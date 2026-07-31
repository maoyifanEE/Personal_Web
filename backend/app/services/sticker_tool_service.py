"""Local-only adapter for the external Sticker_Preprocessor tool."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import struct
import subprocess
import sys
import time
import uuid
from typing import Any
import zlib
from zipfile import ZIP_DEFLATED, ZipFile

from app.core.config import Settings
from app.core.diagnostics import PROJECT_ROOT, write_jsonl_event

CONTRACT_VERSION = "personal-web-sticker-handoff-v1"
REQUEST_SCHEMA_VERSION = "personal-web-sticker-request-v1"
RESPONSE_SCHEMA_VERSION = "sticker-preprocessor-bridge-response-v1"
CAPABILITIES_SCHEMA_VERSION = "sticker-preprocessor-capabilities-v1"
RESULT_SCHEMA_VERSION = "sticker-preprocessor-result-v1"
LOCAL_CONFIG_SCHEMA_VERSION = "personal-web-local-tool-config-v1"
RUN_STATUS_SCHEMA_VERSION = "personal-web-sticker-tool-run-v1"
SUPPORTED_PROFILES = {"local", "shared_remote"}
SUPPORTED_MIME_TYPES = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}
MAX_INPUT_BYTES = 50 * 1024 * 1024
PROCESS_TIMEOUT_SECONDS = 90
MAX_ACTIVE_RUNS = 4


class StickerToolError(RuntimeError):
    def __init__(self, code: str, message: str, *, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_path(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def repo_relative(path: Path) -> str:
    return path.resolve().relative_to(PROJECT_ROOT.resolve()).as_posix()


def safe_path_fingerprint(path: Path) -> dict[str, str]:
    normalized = str(path.resolve()).replace("\\", "/")
    return {
        "basename": path.name,
        "fingerprint": hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:12],
    }


def config_path() -> Path:
    return PROJECT_ROOT / ".runtime" / "local-tools" / "sticker-preprocessor.json"


def bridge_root() -> Path:
    return PROJECT_ROOT / ".runtime" / "sticker-tool-bridge"


def runs_root() -> Path:
    return bridge_root() / "runs"


def outputs_root() -> Path:
    return bridge_root() / "outputs"


def review_bundles_root() -> Path:
    return bridge_root() / "review-bundles"


def prune_runs(days: int = 7) -> dict[str, int]:
    root = bridge_root()
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    deleted = 0
    scanned = 0
    for base in (runs_root(), outputs_root()):
        if not base.exists():
            continue
        for child in base.iterdir():
            if not child.is_dir() or child.is_symlink():
                continue
            scanned += 1
            if datetime.fromtimestamp(child.stat().st_mtime, timezone.utc) >= cutoff:
                continue
            shutil.rmtree(child)
            deleted += 1
    result = {"scanned": scanned, "deleted": deleted}
    write_jsonl_event("sticker-tool", "sticker_tool.retention.pruned", result)
    return result


def active_run_count() -> int:
    root = runs_root()
    if not root.exists():
        return 0
    count = 0
    for status_path in root.glob("*/run-status.json"):
        try:
            state = json.loads(status_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if state.get("status") in {"queued", "processing"}:
            count += 1
    return count


def ensure_run_capacity() -> None:
    if active_run_count() >= MAX_ACTIVE_RUNS:
        write_jsonl_event("sticker-tool", "sticker_tool.run.rejected_capacity", {"maxActiveRuns": MAX_ACTIVE_RUNS})
        raise StickerToolError("RUN_CAPACITY_REACHED", "本机贴纸预处理任务过多，请稍后再试。", status_code=429)


def git_commit() -> str | None:
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=5,
            check=True,
        )
        return result.stdout.strip()
    except Exception:
        return None


def load_saved_config() -> dict[str, Any] | None:
    path = config_path()
    if not path.is_file():
        return None
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("schemaVersion") != LOCAL_CONFIG_SCHEMA_VERSION:
        raise StickerToolError("CONFIG_SCHEMA_INVALID", "本机工具配置格式无效。")
    tool_root = Path(str(data.get("toolRoot", "")))
    return {
        "toolRoot": tool_root,
        "configuredAt": data.get("configuredAt"),
        "source": data.get("source", "user"),
    }


def save_config(tool_root: Path, *, source: str = "user") -> dict[str, Any]:
    resolved = tool_root.expanduser().resolve()
    data = {
        "schemaVersion": LOCAL_CONFIG_SCHEMA_VERSION,
        "toolRoot": str(resolved),
        "configuredAt": utc_now_iso(),
        "source": source,
    }
    path = config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)
    write_jsonl_event(
        "sticker-tool",
        "sticker_tool.config.saved",
        {"source": source, **safe_path_fingerprint(resolved)},
    )
    return public_config_status(resolved, source=source)


def clear_config() -> None:
    path = config_path()
    if path.exists():
        path.unlink()
    write_jsonl_event("sticker-tool", "sticker_tool.config.cleared", {})


def auto_detect_candidates() -> list[Path]:
    parent = PROJECT_ROOT.parent
    return [
        parent / "script" / "Sticker_Preprocessor",
        parent / "Sticker_Preprocessor",
    ]


def resolve_configured_tool_root() -> tuple[Path | None, str]:
    env_path = os.environ.get("STICKER_PREPROCESSOR_PATH")
    if env_path:
        return Path(env_path).expanduser(), "environment"
    saved = load_saved_config()
    if saved:
        return saved["toolRoot"], str(saved["source"] or "user")
    for candidate in auto_detect_candidates():
        if candidate.exists():
            return candidate, "auto-detect"
    return None, "none"


def resolve_tool_python(tool_root: Path) -> Path:
    python_path = tool_root / ".venv" / "Scripts" / "python.exe"
    if not python_path.is_file():
        raise StickerToolError("TOOL_PYTHON_MISSING", "未找到工具虚拟环境 Python。")
    try:
        python_path.resolve().relative_to(tool_root.resolve())
    except ValueError as exc:
        raise StickerToolError("TOOL_PYTHON_OUTSIDE_ROOT", "工具 Python 路径不安全。") from exc
    return python_path


def validate_tool_root(tool_root: Path) -> Path:
    resolved = tool_root.expanduser().resolve()
    if not resolved.is_dir():
        raise StickerToolError("TOOL_ROOT_MISSING", "工具目录不存在。")
    if not (resolved / "pyproject.toml").is_file():
        raise StickerToolError("TOOL_ROOT_INVALID", "工具目录不是 Sticker_Preprocessor 项目。")
    resolve_tool_python(resolved)
    return resolved


def minimal_child_env() -> dict[str, str]:
    allowed: dict[str, str] = {}
    for key in ("SystemRoot", "WINDIR", "PATH", "PATHEXT", "TEMP", "TMP"):
        value = os.environ.get(key)
        if value:
            allowed[key] = value
    return allowed


def run_tool_command(tool_root: Path, args: list[str], *, timeout: int = 30) -> subprocess.CompletedProcess[str]:
    python = resolve_tool_python(tool_root)
    write_jsonl_event(
        "sticker-tool",
        "sticker_tool.run.process_spawned",
        {"tool": safe_path_fingerprint(tool_root), "args": args[:2]},
    )
    return subprocess.run(
        [str(python), "-m", "sticker_preprocessor", *args],
        cwd=tool_root,
        env=minimal_child_env(),
        capture_output=True,
        text=True,
        shell=False,
        timeout=timeout,
        check=False,
    )


def parse_single_json_stdout(stdout: str) -> dict[str, Any]:
    lines = [line for line in stdout.splitlines() if line.strip()]
    if len(lines) != 1:
        raise StickerToolError("STDOUT_NOT_SINGLE_JSON", "工具输出格式无效。")
    try:
        data = json.loads(lines[0])
    except json.JSONDecodeError as exc:
        raise StickerToolError("STDOUT_NOT_JSON", "工具输出不是 JSON。") from exc
    if not isinstance(data, dict):
        raise StickerToolError("STDOUT_JSON_NOT_OBJECT", "工具输出不是对象。")
    return data


def get_capabilities(tool_root: Path) -> dict[str, Any]:
    validated = validate_tool_root(tool_root)
    write_jsonl_event("sticker-tool", "sticker_tool.capabilities.started", safe_path_fingerprint(validated))
    completed = run_tool_command(validated, ["--bridge-capabilities"], timeout=15)
    if completed.returncode != 0:
        write_jsonl_event("sticker-tool", "sticker_tool.capabilities.failed", {"exitCode": completed.returncode})
        raise StickerToolError("CAPABILITIES_FAILED", "工具能力检测失败。", status_code=502)
    data = parse_single_json_stdout(completed.stdout)
    validate_capabilities(data)
    write_jsonl_event("sticker-tool", "sticker_tool.capabilities.succeeded", {"tool": data.get("tool", {})})
    return data


def validate_capabilities(data: dict[str, Any]) -> None:
    if data.get("schemaVersion") != CAPABILITIES_SCHEMA_VERSION:
        raise StickerToolError("CAPABILITIES_SCHEMA_UNSUPPORTED", "工具能力协议不兼容。", status_code=409)
    if CONTRACT_VERSION not in data.get("contractVersions", []):
        write_jsonl_event("sticker-tool", "sticker_tool.contract.incompatible", {})
        raise StickerToolError("CONTRACT_UNSUPPORTED", "工具不支持当前联动协议。", status_code=409)
    if data.get("resultSchemaVersion") != RESULT_SCHEMA_VERSION:
        raise StickerToolError("RESULT_SCHEMA_UNSUPPORTED", "工具结果协议不兼容。", status_code=409)
    write_jsonl_event("sticker-tool", "sticker_tool.contract.compatible", {"contractVersion": CONTRACT_VERSION})


def public_config_status(tool_root: Path | None, *, source: str) -> dict[str, Any]:
    if tool_root is None:
        return {
            "configured": False,
            "state": "not_configured",
            "source": source,
            "pathFingerprint": None,
        }
    return {
        "configured": True,
        "state": "configured",
        "source": source,
        "pathFingerprint": safe_path_fingerprint(tool_root),
    }


def status_payload(settings: Settings) -> dict[str, Any]:
    root, source = resolve_configured_tool_root()
    payload = public_config_status(root, source=source)
    payload.update(
        {
            "schemaVersion": "personal-web-sticker-tool-status-v1",
            "contractVersion": CONTRACT_VERSION,
            "appEnv": settings.app_env,
            "dataProfile": settings.personal_web_data_profile,
            "allowedProfiles": sorted(SUPPORTED_PROFILES),
        }
    )
    if root:
        try:
            capabilities_data = get_capabilities(root)
            payload["state"] = "compatible"
            payload["capabilities"] = safe_capabilities(capabilities_data)
        except StickerToolError as exc:
            payload["state"] = "invalid" if exc.code.startswith("TOOL_") else "incompatible"
            payload["errorCode"] = exc.code
    return payload


def safe_capabilities(data: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": data.get("schemaVersion"),
        "contractVersions": data.get("contractVersions", []),
        "tool": data.get("tool", {}),
        "supportedInputMimeTypes": data.get("supportedInputMimeTypes", []),
        "supportedModes": data.get("supportedModes", []),
        "supportedModels": data.get("supportedModels", []),
        "defaults": data.get("defaults", {}),
        "limits": data.get("limits", {}),
        "resultSchemaVersion": data.get("resultSchemaVersion"),
    }


def create_bridge_run(
    input_bytes: bytes,
    filename: str,
    content_type: str | None,
    options: dict[str, Any],
    *,
    data_profile: str | None = None,
) -> dict[str, Any]:
    prune_runs()
    ensure_run_capacity()
    root, source = resolve_configured_tool_root()
    if root is None:
        raise StickerToolError("TOOL_NOT_CONFIGURED", "请先配置 Sticker_Preprocessor。")
    tool_root = validate_tool_root(root)
    capabilities_data = get_capabilities(tool_root)
    limit = int(capabilities_data.get("limits", {}).get("maxInputBytes", MAX_INPUT_BYTES))
    if not input_bytes or len(input_bytes) > min(limit, MAX_INPUT_BYTES):
        raise StickerToolError("INPUT_SIZE_INVALID", "图片大小不符合要求。", status_code=413)
    ext = Path(filename).suffix.lower()
    mime_type = SUPPORTED_MIME_TYPES.get(ext) or content_type
    if mime_type not in SUPPORTED_MIME_TYPES.values():
        raise StickerToolError("INPUT_MIME_UNSUPPORTED", "不支持的图片格式。")
    bridge_run_id = uuid.uuid4().hex
    run_dir = runs_root() / bridge_run_id
    input_dir = run_dir / "input"
    output_dir = outputs_root() / bridge_run_id
    input_dir.mkdir(parents=True, exist_ok=True)
    output_dir.mkdir(parents=True, exist_ok=True)
    safe_name = Path(filename).name or f"source{ext or '.png'}"
    source_path = input_dir / safe_name
    source_path.write_bytes(input_bytes)
    digest = sha256_bytes(input_bytes)
    request = {
        "schemaVersion": REQUEST_SCHEMA_VERSION,
        "contractVersion": CONTRACT_VERSION,
        "bridgeRunId": bridge_run_id,
        "createdAt": utc_now_iso(),
        "client": {"name": "Personal_Web", "gitCommit": git_commit()},
        "input": {
            "path": str(source_path.resolve()),
            "safeBasename": safe_name,
            "mimeType": mime_type,
            "bytes": len(input_bytes),
            "sha256": digest,
        },
        "options": normalize_options(options),
    }
    request_path = run_dir / "request.json"
    request_path.write_text(json.dumps(request, ensure_ascii=False, indent=2), encoding="utf-8")
    state = {
        "schemaVersion": RUN_STATUS_SCHEMA_VERSION,
        "bridgeRunId": bridge_run_id,
        "toolRunId": None,
        "contractVersion": CONTRACT_VERSION,
        "createdAt": utc_now_iso(),
        "updatedAt": utc_now_iso(),
        "status": "queued",
        "dataProfile": data_profile or os.environ.get("PERSONAL_WEB_DATA_PROFILE"),
        "toolConfigSource": source,
        "toolPathFingerprint": safe_path_fingerprint(tool_root),
        "requestRelativePath": repo_relative(request_path),
        "outputRelativePath": None,
        "toolArtifactRelativePaths": {},
        "manifest": None,
        "compatibility": None,
        "userVisualVerdict": "pending",
    }
    write_run_state(run_dir, state)
    write_jsonl_event("sticker-tool", "sticker_tool.run.created", {"bridgeRunId": bridge_run_id})
    write_jsonl_event("sticker-tool", "sticker_tool.run.input_saved", {"bridgeRunId": bridge_run_id, "bytes": len(input_bytes)})
    return execute_bridge_run(tool_root, run_dir, request_path, state)


def normalize_options(options: dict[str, Any]) -> dict[str, Any]:
    return {
        "mode": options.get("mode") or "auto",
        "aiModel": options.get("aiModel") or "silueta",
        "alphaMatting": bool(options.get("alphaMatting", False)),
        "paddingPixels": int(options.get("paddingPixels", 8)),
        "alphaCropThreshold": int(options.get("alphaCropThreshold", 8)),
    }


def write_run_state(run_dir: Path, state: dict[str, Any]) -> None:
    state["updatedAt"] = utc_now_iso()
    path = run_dir / "run-status.json"
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def execute_bridge_run(tool_root: Path, run_dir: Path, request_path: Path, state: dict[str, Any]) -> dict[str, Any]:
    state["status"] = "processing"
    write_run_state(run_dir, state)
    write_jsonl_event("sticker-tool", "sticker_tool.run.started", {"bridgeRunId": state["bridgeRunId"]})
    try:
        completed = run_tool_command(
            tool_root,
            ["--bridge-process-request", str(request_path.resolve())],
            timeout=PROCESS_TIMEOUT_SECONDS,
        )
    except subprocess.TimeoutExpired as exc:
        state["status"] = "failed"
        state["errorCode"] = "TOOL_TIMEOUT"
        write_run_state(run_dir, state)
        write_jsonl_event("sticker-tool", "sticker_tool.run.process_timeout", {"bridgeRunId": state["bridgeRunId"]})
        raise StickerToolError("TOOL_TIMEOUT", "工具处理超时。", status_code=504) from exc
    write_jsonl_event(
        "sticker-tool",
        "sticker_tool.run.process_completed",
        {"bridgeRunId": state["bridgeRunId"], "exitCode": completed.returncode},
    )
    response = parse_single_json_stdout(completed.stdout)
    write_jsonl_event("sticker-tool", "sticker_tool.result.response_received", {"bridgeRunId": state["bridgeRunId"]})
    if response.get("schemaVersion") != "sticker-preprocessor-bridge-response-v1":
        raise StickerToolError("RESPONSE_SCHEMA_INVALID", "工具响应协议无效。", status_code=502)
    if response.get("bridgeRunId") != state["bridgeRunId"]:
        raise StickerToolError("RESPONSE_BRIDGE_ID_MISMATCH", "工具响应关联 ID 不匹配。", status_code=502)
    state["toolRunId"] = response.get("toolRunId")
    manifest = validate_result_manifest(tool_root, response, state["bridgeRunId"])
    state["manifest"] = manifest
    state["toolArtifactRelativePaths"] = copy_tool_artifacts(tool_root, run_dir, manifest)
    if not response.get("ok"):
        state["status"] = "failed"
        state["errorCode"] = response.get("errorCode") or "TOOL_FAILED"
        write_run_state(run_dir, state)
        raise StickerToolError(state["errorCode"], "工具处理失败。", status_code=502)
    copied = copy_verified_output(tool_root, run_dir, manifest)
    state["outputRelativePath"] = repo_relative(copied)
    state["compatibility"] = evaluate_compatibility(manifest)
    state["status"] = "ready_for_review"
    write_run_state(run_dir, state)
    write_jsonl_event("sticker-tool", "sticker_tool.result.ready_for_review", {"bridgeRunId": state["bridgeRunId"]})
    return public_run_payload(state)


def copy_tool_artifacts(tool_root: Path, run_dir: Path, manifest: dict[str, Any]) -> dict[str, str]:
    copied: dict[str, str] = {}
    artifacts = manifest.get("artifacts") or {}
    for key, target_name in {
        "eventsRelativePath": "tool-events.jsonl",
        "reportRelativePath": "tool-report.json",
    }.items():
        relative = artifacts.get(key)
        if not relative:
            continue
        source = resolve_tool_relative(tool_root, relative)
        if not source.is_file():
            continue
        target = run_dir / "tool-artifacts" / target_name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
        copied[key] = repo_relative(target)
    return copied


def resolve_tool_relative(tool_root: Path, relative: str | None) -> Path:
    if not relative or Path(relative).is_absolute():
        raise StickerToolError("TOOL_PATH_INVALID", "工具返回路径无效。", status_code=502)
    resolved = (tool_root / relative).resolve()
    try:
        resolved.relative_to(tool_root.resolve())
    except ValueError as exc:
        raise StickerToolError("TOOL_PATH_ESCAPE", "工具返回路径越界。", status_code=502) from exc
    if resolved.is_symlink():
        raise StickerToolError("TOOL_PATH_SYMLINK", "工具返回路径不安全。", status_code=502)
    return resolved


def validate_result_manifest(tool_root: Path, response: dict[str, Any], bridge_run_id: str) -> dict[str, Any]:
    manifest_path = resolve_tool_relative(tool_root, response.get("resultManifestRelativePath"))
    if not manifest_path.is_file():
        raise StickerToolError("MANIFEST_MISSING", "工具结果清单不存在。", status_code=502)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != RESULT_SCHEMA_VERSION:
        raise StickerToolError("MANIFEST_SCHEMA_INVALID", "工具结果清单协议无效。", status_code=502)
    if manifest.get("bridgeRunId") != bridge_run_id:
        raise StickerToolError("MANIFEST_BRIDGE_ID_MISMATCH", "工具结果关联 ID 不匹配。", status_code=502)
    if manifest.get("contractVersion") != CONTRACT_VERSION:
        raise StickerToolError("MANIFEST_CONTRACT_INVALID", "工具结果协议版本无效。", status_code=502)
    write_jsonl_event("sticker-tool", "sticker_tool.result.manifest_validated", {"bridgeRunId": bridge_run_id})
    return manifest


def copy_verified_output(tool_root: Path, run_dir: Path, manifest: dict[str, Any]) -> Path:
    output = manifest.get("output") or {}
    source = resolve_tool_relative(tool_root, output.get("relativePath"))
    if not source.is_file():
        raise StickerToolError("OUTPUT_MISSING", "工具输出文件不存在。", status_code=502)
    if sha256_path(source) != output.get("sha256"):
        raise StickerToolError("OUTPUT_HASH_MISMATCH", "工具输出哈希不匹配。", status_code=502)
    png_metrics = analyze_png_alpha(source)
    if png_metrics["width"] != output.get("width") or png_metrics["height"] != output.get("height"):
        raise StickerToolError("OUTPUT_DIMENSION_MISMATCH", "工具输出尺寸不匹配。", status_code=502)
    dest = run_dir / "output" / "processed.png"
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, dest)
    if sha256_path(dest) != output.get("sha256"):
        raise StickerToolError("COPIED_OUTPUT_HASH_MISMATCH", "复制后的输出哈希不匹配。", status_code=502)
    write_jsonl_event("sticker-tool", "sticker_tool.result.hash_validated", {"bridgeRunId": manifest.get("bridgeRunId")})
    write_jsonl_event("sticker-tool", "sticker_tool.result.copied", {"bridgeRunId": manifest.get("bridgeRunId")})
    return dest


def analyze_png_alpha(path: Path) -> dict[str, Any]:
    data = path.read_bytes()
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise StickerToolError("OUTPUT_NOT_PNG", "工具输出不是 PNG。", status_code=502)
    offset = 8
    width = height = color_type = bit_depth = None
    compressed = bytearray()
    while offset + 8 <= len(data):
        length = struct.unpack(">I", data[offset : offset + 4])[0]
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type = struct.unpack(">IIBB", chunk_data[:10])
        elif chunk_type == b"IDAT":
            compressed.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
    if width is None or height is None or bit_depth != 8 or color_type != 6:
        raise StickerToolError("OUTPUT_NOT_RGBA_PNG", "工具输出不是 RGBA PNG。", status_code=502)
    raw = zlib.decompress(bytes(compressed))
    stride = width * 4
    pos = 0
    prev = [0] * stride
    alphas: list[int] = []
    border_nonzero = 0
    border_alpha_max = 0
    for y in range(height):
        filter_type = raw[pos]
        pos += 1
        row = list(raw[pos : pos + stride])
        pos += stride
        recon = unfilter_row(row, prev, filter_type, 4)
        for x in range(width):
            alpha = recon[x * 4 + 3]
            alphas.append(alpha)
            if x in {0, width - 1} or y in {0, height - 1}:
                if alpha > 0:
                    border_nonzero += 1
                border_alpha_max = max(border_alpha_max, alpha)
        prev = recon
    total = len(alphas)
    fully_transparent = sum(1 for value in alphas if value == 0)
    fully_opaque = sum(1 for value in alphas if value == 255)
    semitransparent = sum(1 for value in alphas if 0 < value < 255)
    return {
        "width": width,
        "height": height,
        "alphaMin": min(alphas),
        "alphaMax": max(alphas),
        "fullyTransparentCount": fully_transparent,
        "fullyOpaqueCount": fully_opaque,
        "semitransparentCount": semitransparent,
        "transparentFraction": fully_transparent / total,
        "nonopaqueFraction": (total - fully_opaque) / total,
        "borderNonzeroCount": border_nonzero,
        "borderAlphaMax": border_alpha_max,
    }


def unfilter_row(row: list[int], prev: list[int], filter_type: int, bpp: int) -> list[int]:
    out = [0] * len(row)
    for i, value in enumerate(row):
        left = out[i - bpp] if i >= bpp else 0
        up = prev[i]
        up_left = prev[i - bpp] if i >= bpp else 0
        if filter_type == 0:
            predictor = 0
        elif filter_type == 1:
            predictor = left
        elif filter_type == 2:
            predictor = up
        elif filter_type == 3:
            predictor = (left + up) // 2
        elif filter_type == 4:
            predictor = paeth(left, up, up_left)
        else:
            raise StickerToolError("PNG_FILTER_INVALID", "PNG 数据无效。", status_code=502)
        out[i] = (value + predictor) & 0xFF
    return out


def paeth(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    if pb <= pc:
        return b
    return c


def evaluate_compatibility(manifest: dict[str, Any]) -> dict[str, Any]:
    alpha = manifest.get("output", {}).get("alpha", {})
    issues = []
    if alpha.get("fullyTransparentCount", 0) <= 0:
        issues.append("NO_FULLY_TRANSPARENT_PIXELS")
    if alpha.get("alphaMax", 0) < 250:
        issues.append("NO_OPAQUE_SUBJECT")
    if alpha.get("borderAlphaMax", 0) > 32:
        issues.append("BORDER_ALPHA_NOT_CLEAN")
    if alpha.get("rectangularHazeSuspected"):
        issues.append("RECTANGULAR_HAZE_SUSPECTED")
    verdict = "BLOCKED" if issues else "REVIEW_REQUIRED"
    result = {
        "contractCompatibility": "PASS",
        "resultIntegrity": "PASS",
        "alphaCompatibility": "PASS" if not issues else "FAIL",
        "journeyRenderCompatibility": "REVIEW_REQUIRED",
        "toolQualityVerdict": manifest.get("processing", {}).get("qualityVerdict"),
        "userVisualVerdict": "pending",
        "overallHandoffVerdict": verdict,
        "issueCodes": issues,
    }
    write_jsonl_event("sticker-tool", "sticker_tool.compatibility.evaluated", result)
    return result


def public_run_payload(state: dict[str, Any]) -> dict[str, Any]:
    return {
        "schemaVersion": state["schemaVersion"],
        "bridgeRunId": state["bridgeRunId"],
        "toolRunId": state.get("toolRunId"),
        "contractVersion": state["contractVersion"],
        "status": state["status"],
        "dataProfile": state.get("dataProfile"),
        "toolConfigSource": state.get("toolConfigSource"),
        "toolPathFingerprint": state.get("toolPathFingerprint"),
        "compatibility": state.get("compatibility"),
        "userVisualVerdict": state.get("userVisualVerdict", "pending"),
        "outputUrl": f"/api/sticker-tool/runs/{state['bridgeRunId']}/output"
        if state.get("outputRelativePath")
        else None,
    }


def get_run_state(bridge_run_id: str) -> dict[str, Any]:
    path = runs_root() / bridge_run_id / "run-status.json"
    if not path.is_file():
        raise StickerToolError("RUN_NOT_FOUND", "处理记录不存在。", status_code=404)
    return json.loads(path.read_text(encoding="utf-8"))


def record_review(bridge_run_id: str, verdict: str) -> dict[str, Any]:
    if verdict not in {"accepted", "rejected"}:
        raise StickerToolError("REVIEW_VERDICT_INVALID", "视觉审核结果无效。")
    run_dir = runs_root() / bridge_run_id
    state = get_run_state(bridge_run_id)
    state["userVisualVerdict"] = verdict
    if state.get("compatibility"):
        state["compatibility"]["userVisualVerdict"] = verdict
        if verdict == "accepted" and state["compatibility"]["overallHandoffVerdict"] != "BLOCKED":
            state["compatibility"]["overallHandoffVerdict"] = "ACCEPTED_FOR_UPLOAD"
    write_run_state(run_dir, state)
    event = "sticker_tool.review.accepted" if verdict == "accepted" else "sticker_tool.review.rejected"
    write_jsonl_event("sticker-tool", event, {"bridgeRunId": bridge_run_id})
    return public_run_payload(state)


def output_path_for_run(bridge_run_id: str) -> Path:
    state = get_run_state(bridge_run_id)
    relative = state.get("outputRelativePath")
    if not relative:
        raise StickerToolError("OUTPUT_NOT_READY", "输出尚未准备好。", status_code=404)
    path = (PROJECT_ROOT / relative).resolve()
    path.relative_to(PROJECT_ROOT.resolve())
    if not path.is_file():
        raise StickerToolError("OUTPUT_MISSING", "输出文件不存在。", status_code=404)
    return path


def create_integration_bundle(bridge_run_id: str) -> tuple[Path, str]:
    state = get_run_state(bridge_run_id)
    bundle_dir = review_bundles_root()
    bundle_dir.mkdir(parents=True, exist_ok=True)
    filename = f"sticker-tool-integration-{datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S')}-{bridge_run_id[:8]}.zip"
    zip_path = bundle_dir / filename
    output_path = output_path_for_run(bridge_run_id)
    manifest = {
        "bridgeRunId": bridge_run_id,
        "toolRunId": state.get("toolRunId"),
        "contractVersion": CONTRACT_VERSION,
        "clientCommit": git_commit(),
        "toolCommit": (state.get("manifest") or {}).get("tool", {}).get("gitCommit"),
        "dataProfile": state.get("dataProfile"),
        "toolConfigSource": state.get("toolConfigSource"),
        "toolPathFingerprint": state.get("toolPathFingerprint"),
        "compatibility": state.get("compatibility"),
        "userVisualVerdict": state.get("userVisualVerdict"),
        "privacyWarning": "联动诊断包包含本次输入图片、处理结果和预览图，仅在确认后手动分享。",
    }
    with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        archive.writestr("web/run-status.json", json.dumps(state, ensure_ascii=False, indent=2))
        archive.writestr("web/provider-result.json", json.dumps(state.get("manifest"), ensure_ascii=False, indent=2))
        request_path = PROJECT_ROOT / state.get("requestRelativePath", "")
        if request_path.is_file():
            archive.write(request_path, "web/request.json")
        input_dir = runs_root() / bridge_run_id / "input"
        if input_dir.is_dir():
            for input_path in input_dir.iterdir():
                if input_path.is_file() and not input_path.is_symlink():
                    archive.write(input_path, f"input/{input_path.name}")
        for relative in (state.get("toolArtifactRelativePaths") or {}).values():
            artifact_path = PROJECT_ROOT / relative
            if artifact_path.is_file():
                archive.write(artifact_path, f"tool/{artifact_path.name}")
        archive.write(output_path, "output/processed.png")
    write_jsonl_event("sticker-tool", "sticker_tool.bundle.created", {"bridgeRunId": bridge_run_id, "bytes": zip_path.stat().st_size})
    return zip_path, filename
