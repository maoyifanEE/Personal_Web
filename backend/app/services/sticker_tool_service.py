"""Local-only adapter for the external Sticker_Preprocessor tool."""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import struct
import subprocess
import threading
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
SUPPORTED_REVIEW_ISSUES = {
    "VISIBLE_RECTANGLE",
    "HEAVY_WHITE_OR_GRAY_HALO",
    "BACKGROUND_REMAINS",
    "SUBJECT_DAMAGED",
    "TEXT_OR_FINE_DETAIL_DAMAGED",
    "CROP_OR_PADDING_WRONG",
    "OTHER",
}
PREVIEW_CONTEXTS = ("light", "dark", "web", "journey")
PREVIEW_EVIDENCE_FILES = {
    "light": "output-light.png",
    "dark": "output-dark.png",
    "web": "output-web.png",
    "journey": "output-journey.png",
}
PREVIEW_EVIDENCE_SOURCES = {
    "browser-rendered-composite",
    "automated-synthetic-composite",
    "missing",
}
FIXED_PREVIEW_BACKGROUNDS = {
    "light": (255, 255, 255),
    "dark": (31, 41, 51),
}
PROCESSING_STATES = {"queued", "validating_tool", "running", "validating_result"}
TERMINAL_STATES = {"ready_for_review", "blocked", "failed", "accepted", "rejected", "uploaded", "interrupted"}
BLOCKING_CODES = {
    "CONTRACT_MISMATCH",
    "MANIFEST_MISMATCH",
    "TOOL_PATH_ESCAPE",
    "OUTPUT_HASH_MISMATCH",
    "OUTPUT_BYTE_MISMATCH",
    "OUTPUT_MIME_INVALID",
    "OUTPUT_NOT_RGBA_PNG",
    "PROVIDER_CLIENT_ALPHA_MISMATCH",
    "PROVIDER_BROWSER_ALPHA_MISMATCH",
    "NO_FULLY_TRANSPARENT_PIXELS",
    "BORDER_ALPHA_NOT_CLEAN",
    "RECTANGULAR_HAZE_SUSPECTED",
    "TOOL_QUALITY_FAIL",
    "BROWSER_DECODE_FAILED",
    "PREVIEW_MATRIX_INCOMPLETE",
    "PREVIEW_OUTPUT_DIMENSION_MISMATCH",
    "PREVIEW_EVIDENCE_INCOMPLETE",
    "PREVIEW_EVIDENCE_STICKER_MISSING",
}
MAX_INPUT_BYTES = 50 * 1024 * 1024
MAX_PREVIEW_EVIDENCE_BYTES = 5 * 1024 * 1024
MAX_PREVIEW_EVIDENCE_DIMENSION = 4096
PROCESS_TIMEOUT_SECONDS = 90
MAX_ACTIVE_RUNS = 3
ALPHA_FRACTION_TOLERANCE = 0.0001
BRIDGE_RUN_ID_RE = re.compile(r"^[0-9a-f]{32}$")

_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="sticker-tool")
_worker_lock = threading.Lock()
_active_futures: dict[str, Future] = {}
_stale_runs_marked = False


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


def log_event(name: str, details: dict[str, Any]) -> None:
    safe = {
        key: value
        for key, value in details.items()
        if key.lower() not in {"path", "fullpath", "csrf", "cookie", "token", "password", "database_url"}
    }
    safe.setdefault("contractVersion", CONTRACT_VERSION)
    safe.setdefault("clientCommit", git_commit())
    write_jsonl_event("sticker-tool", name, safe)


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


def validate_bridge_run_id(bridge_run_id: str) -> str:
    if not BRIDGE_RUN_ID_RE.fullmatch(str(bridge_run_id or "")):
        raise StickerToolError("RUN_ID_INVALID", "处理记录不存在。", status_code=404)
    return bridge_run_id


def validate_tool_run_id(tool_run_id: str | None) -> str | None:
    if tool_run_id is None:
        return None
    if not BRIDGE_RUN_ID_RE.fullmatch(str(tool_run_id)):
        raise StickerToolError("TOOL_RUN_ID_INVALID", "工具运行 ID 无效。", status_code=502)
    return str(tool_run_id)


def run_dir_for_id(bridge_run_id: str) -> Path:
    return runs_root() / validate_bridge_run_id(bridge_run_id)


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
    log_event("sticker_tool.retention.pruned", result)
    return result


def mark_stale_processing_runs_interrupted() -> None:
    global _stale_runs_marked
    with _worker_lock:
        if _stale_runs_marked:
            return
        active_ids = {
            bridge_run_id
            for bridge_run_id, future in _active_futures.items()
            if not future.done()
        }
        _stale_runs_marked = True
    root = runs_root()
    if not root.exists():
        return
    for state_path in root.glob("*/run-status.json"):
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        bridge_run_id = state.get("bridgeRunId")
        if bridge_run_id in active_ids or state.get("status") not in PROCESSING_STATES:
            continue
        run_dir = state_path.parent
        set_run_status(run_dir, state, "interrupted", reason_code="STALE_LOCAL_WORKER")


def active_run_count() -> int:
    mark_stale_processing_runs_interrupted()
    count = 0
    with _worker_lock:
        for bridge_run_id, future in list(_active_futures.items()):
            if future.done():
                _active_futures.pop(bridge_run_id, None)
            else:
                count += 1
    root = runs_root()
    if not root.exists():
        return count
    for status_path in root.glob("*/run-status.json"):
        try:
            state = json.loads(status_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
        if state.get("bridgeRunId") in _active_futures:
            continue
        if state.get("status") in PROCESSING_STATES:
            count += 1
    return count


def ensure_run_capacity() -> None:
    if active_run_count() >= MAX_ACTIVE_RUNS:
        log_event("sticker_tool.run.rejected_capacity", {"maxActiveRuns": MAX_ACTIVE_RUNS})
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
    log_event("sticker_tool.config.saved", {"source": source, **safe_path_fingerprint(resolved)})
    return public_config_status(resolved, source=source)


def clear_config() -> None:
    path = config_path()
    if path.exists():
        path.unlink()
    log_event("sticker_tool.config.cleared", {})


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
    log_event("sticker_tool.run.process_spawned", {"tool": safe_path_fingerprint(tool_root), "args": args[:2]})
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
    log_event("sticker_tool.capabilities.started", safe_path_fingerprint(validated))
    completed = run_tool_command(validated, ["--bridge-capabilities"], timeout=15)
    if completed.returncode != 0:
        log_event("sticker_tool.capabilities.failed", {"exitCode": completed.returncode})
        raise StickerToolError("CAPABILITIES_FAILED", "工具能力检测失败。", status_code=502)
    data = parse_single_json_stdout(completed.stdout)
    validate_capabilities(data)
    log_event("sticker_tool.capabilities.succeeded", {"tool": data.get("tool", {})})
    return data


def validate_capabilities(data: dict[str, Any]) -> None:
    if data.get("schemaVersion") != CAPABILITIES_SCHEMA_VERSION:
        raise StickerToolError("CAPABILITIES_SCHEMA_UNSUPPORTED", "工具能力协议不兼容。", status_code=409)
    if CONTRACT_VERSION not in data.get("contractVersions", []):
        log_event("sticker_tool.contract.incompatible", {})
        raise StickerToolError("CONTRACT_UNSUPPORTED", "工具不支持当前联动协议。", status_code=409)
    if data.get("resultSchemaVersion") != RESULT_SCHEMA_VERSION:
        raise StickerToolError("RESULT_SCHEMA_UNSUPPORTED", "工具结果协议不兼容。", status_code=409)
    log_event("sticker_tool.contract.compatible", {"contractVersion": CONTRACT_VERSION})


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
    mark_stale_processing_runs_interrupted()
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
    if not input_bytes or len(input_bytes) > MAX_INPUT_BYTES:
        raise StickerToolError("INPUT_SIZE_INVALID", "图片大小不符合要求。", status_code=413)
    ext = Path(filename).suffix.lower()
    mime_type = SUPPORTED_MIME_TYPES.get(ext) or content_type
    if mime_type not in SUPPORTED_MIME_TYPES.values():
        raise StickerToolError("INPUT_MIME_UNSUPPORTED", "不支持的图片格式。")

    bridge_run_id = uuid.uuid4().hex
    run_dir = run_dir_for_id(bridge_run_id)
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
    state = initial_run_state(
        bridge_run_id,
        source,
        tool_root,
        request_path,
        data_profile=data_profile,
    )
    write_run_state(run_dir, state)
    log_event("sticker_tool.run.created", {"bridgeRunId": bridge_run_id, "dataProfile": state.get("dataProfile")})
    log_event("sticker_tool.run.input_saved", {"bridgeRunId": bridge_run_id, "bytes": len(input_bytes)})
    submit_worker(bridge_run_id, tool_root, run_dir, request_path)
    return public_run_payload(state)


def initial_run_state(bridge_run_id: str, source: str, tool_root: Path, request_path: Path, *, data_profile: str | None) -> dict[str, Any]:
    return {
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
        "capabilities": None,
        "providerAlphaMetrics": None,
        "clientAlphaMetrics": None,
        "browserAnalysis": None,
        "previewMatrix": {},
        "previewEvidence": {},
        "review": None,
        "compatibility": compatibility_payload(overall="PROCESSING"),
        "userVisualVerdict": "PENDING",
        "reviewSource": None,
    }


def submit_worker(bridge_run_id: str, tool_root: Path, run_dir: Path, request_path: Path) -> None:
    with _worker_lock:
        future = _executor.submit(process_bridge_run_worker, bridge_run_id, tool_root, run_dir, request_path)
        _active_futures[bridge_run_id] = future
        future.add_done_callback(lambda _future, run_id=bridge_run_id: remove_active_future(run_id))


def remove_active_future(bridge_run_id: str) -> None:
    with _worker_lock:
        _active_futures.pop(bridge_run_id, None)


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
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(tmp, path)


def set_run_status(run_dir: Path, state: dict[str, Any], next_status: str, *, reason_code: str) -> None:
    previous = state.get("status")
    state["status"] = next_status
    write_run_state(run_dir, state)
    log_event(
        "sticker_tool.run.state_changed",
        {
            "bridgeRunId": state.get("bridgeRunId"),
            "toolRunId": state.get("toolRunId"),
            "dataProfile": state.get("dataProfile"),
            "previousState": previous,
            "nextState": next_status,
            "reasonCode": reason_code,
        },
    )


def process_bridge_run_worker(bridge_run_id: str, tool_root: Path, run_dir: Path, request_path: Path) -> None:
    state = get_run_state(bridge_run_id)
    try:
        set_run_status(run_dir, state, "validating_tool", reason_code="WORKER_STARTED")
        capabilities_data = get_capabilities(tool_root)
        state["capabilities"] = safe_capabilities(capabilities_data)
        limit = int(capabilities_data.get("limits", {}).get("maxInputBytes", MAX_INPUT_BYTES))
        request = json.loads(request_path.read_text(encoding="utf-8"))
        if int(request.get("input", {}).get("bytes", 0)) > min(limit, MAX_INPUT_BYTES):
            raise StickerToolError("INPUT_SIZE_INVALID", "图片大小不符合要求。", status_code=413)

        set_run_status(run_dir, state, "running", reason_code="TOOL_VALIDATED")
        completed = run_tool_command(
            tool_root,
            ["--bridge-process-request", str(request_path.resolve())],
            timeout=PROCESS_TIMEOUT_SECONDS,
        )
        log_event(
            "sticker_tool.run.process_completed",
            {"bridgeRunId": bridge_run_id, "exitCode": completed.returncode},
        )
        set_run_status(run_dir, state, "validating_result", reason_code="TOOL_COMPLETED")
        response = parse_single_json_stdout(completed.stdout)
        validate_bridge_response(response, bridge_run_id, completed.returncode)
        log_event("sticker_tool.result.response_validated", {"bridgeRunId": bridge_run_id})
        state["toolRunId"] = response.get("toolRunId")

        manifest = validate_result_manifest(tool_root, response, bridge_run_id, request)
        state["manifest"] = manifest
        state["toolArtifactRelativePaths"] = copy_tool_artifacts(tool_root, run_dir, manifest)
        if not response.get("ok"):
            state["compatibility"] = compatibility_payload(
                contract="PASS",
                result="PASS",
                alpha="FAIL",
                journey="FAIL",
                tool=manifest.get("processing", {}).get("qualityVerdict") or "FAIL",
                browser="PENDING",
                overall="BLOCKED",
                issues=[manifest.get("failure", {}).get("code") or "TOOL_FAILED"],
            )
            set_run_status(run_dir, state, "failed", reason_code="TOOL_FAILED_RESPONSE")
            return

        copied = copy_verified_output(tool_root, run_dir, manifest)
        state["outputRelativePath"] = repo_relative(copied)
        state["clientAlphaMetrics"] = analyze_png_alpha(copied)
        state["providerAlphaMetrics"] = manifest.get("output", {}).get("alpha", {})
        alpha_comparison = compare_alpha_metrics(state["providerAlphaMetrics"], state["clientAlphaMetrics"])
        log_event(
            "sticker_tool.result.alpha_compared",
            {"bridgeRunId": bridge_run_id, "result": "PASS" if alpha_comparison["ok"] else "FAIL"},
        )
        state["compatibility"] = evaluate_compatibility(manifest, state["clientAlphaMetrics"], alpha_comparison)
        next_status = "blocked" if state["compatibility"]["overallHandoffVerdict"] == "BLOCKED" else "ready_for_review"
        set_run_status(run_dir, state, next_status, reason_code="RESULT_VALIDATED")
    except subprocess.TimeoutExpired:
        apply_worker_error(run_dir, state, "TOOL_TIMEOUT", "failed")
    except StickerToolError as exc:
        status = "blocked" if exc.code in BLOCKING_CODES or exc.status_code == 502 else "failed"
        apply_worker_error(run_dir, state, exc.code, status)
    except Exception as exc:
        log_event("sticker_tool.run.worker_unhandled_error", {"bridgeRunId": bridge_run_id, "error": type(exc).__name__})
        apply_worker_error(run_dir, state, "WORKER_UNHANDLED_ERROR", "failed")


def apply_worker_error(run_dir: Path, state: dict[str, Any], code: str, status: str) -> None:
    state["errorCode"] = code
    state["compatibility"] = compatibility_payload(
        contract="FAIL" if "CONTRACT" in code else "PASS",
        result="FAIL",
        alpha="FAIL",
        journey="FAIL",
        browser="PENDING",
        overall="BLOCKED" if status == "blocked" else "PROCESSING",
        issues=[code],
    )
    set_run_status(run_dir, state, status, reason_code=code)


def validate_bridge_response(response: dict[str, Any], bridge_run_id: str, exit_code: int) -> None:
    if response.get("schemaVersion") != RESPONSE_SCHEMA_VERSION:
        raise StickerToolError("CONTRACT_MISMATCH", "工具响应协议无效。", status_code=502)
    if response.get("contractVersion") != CONTRACT_VERSION:
        raise StickerToolError("CONTRACT_MISMATCH", "工具响应协议版本无效。", status_code=502)
    if not isinstance(response.get("ok"), bool):
        raise StickerToolError("CONTRACT_MISMATCH", "工具响应 ok 字段无效。", status_code=502)
    if response.get("bridgeRunId") != bridge_run_id:
        raise StickerToolError("MANIFEST_MISMATCH", "工具响应关联 ID 不匹配。", status_code=502)
    validate_bridge_run_id(response.get("bridgeRunId"))
    validate_tool_run_id(response.get("toolRunId"))
    if not response.get("resultManifestRelativePath"):
        raise StickerToolError("MANIFEST_MISMATCH", "工具响应缺少结果清单。", status_code=502)
    if response["ok"] and exit_code != 0:
        raise StickerToolError("MANIFEST_MISMATCH", "工具成功响应必须使用退出码 0。", status_code=502)
    if not response["ok"] and exit_code == 0:
        raise StickerToolError("MANIFEST_MISMATCH", "工具失败响应必须使用非 0 退出码。", status_code=502)


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


def validate_result_manifest(
    tool_root: Path,
    response: dict[str, Any],
    bridge_run_id: str,
    request: dict[str, Any] | None = None,
) -> dict[str, Any]:
    manifest_path = resolve_tool_relative(tool_root, response.get("resultManifestRelativePath"))
    if not manifest_path.is_file():
        raise StickerToolError("MANIFEST_MISSING", "工具结果清单不存在。", status_code=502)
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("schemaVersion") != RESULT_SCHEMA_VERSION:
        raise StickerToolError("MANIFEST_SCHEMA_INVALID", "工具结果清单协议无效。", status_code=502)
    if manifest.get("contractVersion") != CONTRACT_VERSION:
        raise StickerToolError("CONTRACT_MISMATCH", "工具结果协议版本无效。", status_code=502)
    if manifest.get("bridgeRunId") != bridge_run_id:
        raise StickerToolError("MANIFEST_BRIDGE_ID_MISMATCH", "工具结果关联 ID 不匹配。", status_code=502)
    if manifest.get("toolRunId") != response.get("toolRunId"):
        raise StickerToolError("MANIFEST_MISMATCH", "工具运行 ID 不匹配。", status_code=502)
    if manifest.get("status") not in {"success", "failed"}:
        raise StickerToolError("MANIFEST_MISMATCH", "工具结果状态无效。", status_code=502)
    if bool(response.get("ok")) != (manifest.get("status") == "success"):
        raise StickerToolError("MANIFEST_MISMATCH", "工具响应状态与清单状态不一致。", status_code=502)
    if request:
        validate_manifest_input_identity(manifest, request)
    validate_manifest_options(manifest.get("options") or {})
    if manifest.get("status") == "success":
        output = manifest.get("output") or {}
        if output.get("mimeType") != "image/png":
            raise StickerToolError("OUTPUT_MIME_INVALID", "工具输出 MIME 无效。", status_code=502)
    log_event("sticker_tool.result.manifest_validated", {"bridgeRunId": bridge_run_id, "toolRunId": manifest.get("toolRunId")})
    return manifest


def validate_manifest_input_identity(manifest: dict[str, Any], request: dict[str, Any]) -> None:
    expected = request.get("input") or {}
    actual = manifest.get("input") or {}
    for key in ("safeBasename", "mimeType", "bytes", "sha256"):
        if actual.get(key) != expected.get(key):
            raise StickerToolError("MANIFEST_MISMATCH", f"工具输入身份字段不匹配: {key}", status_code=502)
    log_event("sticker_tool.result.input_identity_validated", {"bridgeRunId": manifest.get("bridgeRunId")})


def validate_manifest_options(options: dict[str, Any]) -> None:
    if options.get("mode") not in {"auto", "alpha_cleanup", "checkerboard", "ai"}:
        raise StickerToolError("MANIFEST_MISMATCH", "工具选项 mode 无效。", status_code=502)
    if options.get("aiModel") not in {"silueta", "u2netp", "isnet-general-use"}:
        raise StickerToolError("MANIFEST_MISMATCH", "工具选项 aiModel 无效。", status_code=502)
    if not isinstance(options.get("alphaMatting"), bool):
        raise StickerToolError("MANIFEST_MISMATCH", "工具选项 alphaMatting 无效。", status_code=502)
    for key in ("paddingPixels", "alphaCropThreshold"):
        if not isinstance(options.get(key), int):
            raise StickerToolError("MANIFEST_MISMATCH", f"工具选项 {key} 无效。", status_code=502)


def copy_verified_output(tool_root: Path, run_dir: Path, manifest: dict[str, Any]) -> Path:
    output = manifest.get("output") or {}
    source = resolve_tool_relative(tool_root, output.get("relativePath"))
    if not source.is_file():
        raise StickerToolError("OUTPUT_MISSING", "工具输出文件不存在。", status_code=502)
    if source.stat().st_size != output.get("bytes"):
        raise StickerToolError("OUTPUT_BYTE_MISMATCH", "工具输出字节数不匹配。", status_code=502)
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
    log_event("sticker_tool.result.output_identity_validated", {"bridgeRunId": manifest.get("bridgeRunId")})
    return dest


def decode_rgba_png_bytes(data: bytes, *, error_code: str = "PNG_INVALID", status_code: int = 422) -> dict[str, Any]:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise StickerToolError(error_code, "PNG data is invalid.", status_code=status_code)
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
        raise StickerToolError("PNG_NOT_RGBA", "PNG must be 8-bit RGBA.", status_code=status_code)
    raw = zlib.decompress(bytes(compressed))
    stride = width * 4
    pos = 0
    prev = [0] * stride
    rows: list[list[int]] = []
    pixels = bytearray()
    for _y in range(height):
        filter_type = raw[pos]
        pos += 1
        row = list(raw[pos : pos + stride])
        pos += stride
        recon = unfilter_row(row, prev, filter_type, 4)
        rows.append(recon)
        pixels.extend(recon)
        prev = recon
    return {
        "width": width,
        "height": height,
        "rows": rows,
        "pixels": bytes(pixels),
    }


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
        raise StickerToolError("OUTPUT_NOT_RGBA_PNG", "工具输出不是 8-bit RGBA PNG。", status_code=502)
    raw = zlib.decompress(bytes(compressed))
    stride = width * 4
    pos = 0
    prev = [0] * stride
    alphas: list[int] = []
    border_nonzero = 0
    border_alpha_max = 0
    top = bottom = left = right = 0
    boxes = {0: empty_box(), 8: empty_box(), 32: empty_box()}
    for y in range(height):
        filter_type = raw[pos]
        pos += 1
        row = list(raw[pos : pos + stride])
        pos += stride
        recon = unfilter_row(row, prev, filter_type, 4)
        for x in range(width):
            alpha = recon[x * 4 + 3]
            alphas.append(alpha)
            for threshold, box in boxes.items():
                if alpha > threshold:
                    extend_box(box, x, y)
            if y == 0 and alpha > 0:
                top += 1
            if y == height - 1 and alpha > 0:
                bottom += 1
            if x == 0 and alpha > 0:
                left += 1
            if x == width - 1 and alpha > 0:
                right += 1
            if x in {0, width - 1} or y in {0, height - 1}:
                if alpha > 0:
                    border_nonzero += 1
                border_alpha_max = max(border_alpha_max, alpha)
        prev = recon
    total = len(alphas)
    fully_transparent = sum(1 for value in alphas if value == 0)
    fully_opaque = sum(1 for value in alphas if value == 255)
    semitransparent = sum(1 for value in alphas if 0 < value < 255)
    transparent_fraction = fully_transparent / total
    nonopaque_fraction = (total - fully_opaque) / total
    low_alpha = sum(1 for value in alphas if 0 < value <= 32)
    border_pixels = max(1, (width * 2) + (height * 2) - 4)
    rectangular_haze = border_nonzero / border_pixels > 0.35 and border_alpha_max > 32
    return {
        "width": width,
        "height": height,
        "totalPixels": total,
        "alphaMin": min(alphas),
        "alphaMax": max(alphas),
        "fullyTransparentCount": fully_transparent,
        "fullyOpaqueCount": fully_opaque,
        "semitransparentCount": semitransparent,
        "transparentFraction": transparent_fraction,
        "nonopaqueFraction": nonopaque_fraction,
        "topBorderNonzeroCount": top,
        "bottomBorderNonzeroCount": bottom,
        "leftBorderNonzeroCount": left,
        "rightBorderNonzeroCount": right,
        "borderNonzeroCount": border_nonzero,
        "borderAlphaMax": border_alpha_max,
        "alphaBoundingBoxes": {
            "gt0": finalize_box(boxes[0]),
            "gt8": finalize_box(boxes[8]),
            "gt32": finalize_box(boxes[32]),
        },
        "lowAlphaHazeSuspected": (low_alpha / total) > 0.2,
        "rectangularHazeSuspected": rectangular_haze,
        "heavySemitransparentHaloWarning": (semitransparent / total) > 0.45,
    }


def empty_box() -> dict[str, int | None]:
    return {"minX": None, "minY": None, "maxX": None, "maxY": None}


def extend_box(box: dict[str, int | None], x: int, y: int) -> None:
    box["minX"] = x if box["minX"] is None else min(int(box["minX"]), x)
    box["minY"] = y if box["minY"] is None else min(int(box["minY"]), y)
    box["maxX"] = x if box["maxX"] is None else max(int(box["maxX"]), x)
    box["maxY"] = y if box["maxY"] is None else max(int(box["maxY"]), y)


def finalize_box(box: dict[str, int | None]) -> dict[str, int | None]:
    return dict(box)


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


def compare_alpha_metrics(provider: dict[str, Any], client: dict[str, Any]) -> dict[str, Any]:
    mismatches: list[str] = []
    integer_keys = [
        "alphaMin",
        "alphaMax",
        "fullyTransparentCount",
        "fullyOpaqueCount",
        "semitransparentCount",
        "borderNonzeroCount",
        "borderAlphaMax",
    ]
    for key in integer_keys:
        if provider.get(key) != client.get(key):
            mismatches.append(key)
    for key in ("transparentFraction", "nonopaqueFraction"):
        if abs(float(provider.get(key, -1)) - float(client.get(key, -2))) > ALPHA_FRACTION_TOLERANCE:
            mismatches.append(key)
    return {"ok": not mismatches, "mismatches": mismatches}


def evaluate_compatibility(
    manifest: dict[str, Any],
    client_alpha: dict[str, Any],
    alpha_comparison: dict[str, Any],
    *,
    browser_analysis: dict[str, Any] | None = None,
    preview_matrix: dict[str, bool] | None = None,
) -> dict[str, Any]:
    issues: list[str] = []
    alpha_verdict = "PASS"
    journey_verdict = "WARNING"
    browser_verdict = "PENDING"
    tool_verdict = manifest.get("processing", {}).get("qualityVerdict") or "WARNING"
    if tool_verdict not in {"PASS", "WARNING", "FAIL"}:
        tool_verdict = "WARNING"
    if not alpha_comparison.get("ok"):
        issues.append("PROVIDER_CLIENT_ALPHA_MISMATCH")
    if client_alpha.get("fullyTransparentCount", 0) <= 0:
        issues.append("NO_FULLY_TRANSPARENT_PIXELS")
    if client_alpha.get("borderAlphaMax", 0) > 32:
        issues.append("BORDER_ALPHA_NOT_CLEAN")
    if client_alpha.get("rectangularHazeSuspected"):
        issues.append("RECTANGULAR_HAZE_SUSPECTED")
    if tool_verdict == "FAIL":
        issues.append("TOOL_QUALITY_FAIL")
    if issues:
        alpha_verdict = "FAIL"
    if browser_analysis:
        browser_verdict = "PASS" if browser_analysis.get("comparison", {}).get("ok") else "FAIL"
        if browser_verdict == "FAIL":
            issues.append("PROVIDER_BROWSER_ALPHA_MISMATCH")
    if preview_matrix:
        journey_verdict = "PASS" if preview_matrix_complete(preview_matrix) else "FAIL"
        if journey_verdict == "FAIL":
            issues.append("PREVIEW_MATRIX_INCOMPLETE")
    overall = "BLOCKED" if any(issue in BLOCKING_CODES for issue in issues) else "REVIEW_REQUIRED"
    result = compatibility_payload(
        contract="PASS",
        result="PASS",
        alpha=alpha_verdict,
        journey=journey_verdict,
        tool=tool_verdict,
        browser=browser_verdict,
        overall=overall,
        issues=issues,
    )
    log_event("sticker_tool.compatibility.evaluated", result)
    return result


def preview_matrix_complete(preview_matrix: dict[str, Any]) -> bool:
    return all((preview_matrix.get(context) or {}).get("rendered") is True for context in PREVIEW_CONTEXTS)


def preview_evidence_complete(state: dict[str, Any]) -> bool:
    evidence = state.get("previewEvidence") or {}
    return all(
        (evidence.get(context) or {}).get("captured") is True and
        (evidence.get(context) or {}).get("contentVerified") is True and
        bool((evidence.get(context) or {}).get("sha256"))
        for context in PREVIEW_CONTEXTS
    )


def preview_evidence_overall(state: dict[str, Any]) -> str:
    evidence = state.get("previewEvidence") or {}
    if preview_evidence_complete(state):
        return "COMPLETE"
    if any((evidence.get(context) or {}).get("captured") for context in PREVIEW_CONTEXTS):
        return "PARTIAL"
    return "INVALID"


def verified_output_dimensions(state: dict[str, Any]) -> tuple[int, int] | None:
    metrics = state.get("clientAlphaMetrics") or {}
    width = metrics.get("width")
    height = metrics.get("height")
    if isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0:
        return width, height
    output = ((state.get("manifest") or {}).get("output") or {})
    width = output.get("width")
    height = output.get("height")
    if isinstance(width, int) and isinstance(height, int) and width > 0 and height > 0:
        return width, height
    return None


def compatibility_payload(
    *,
    contract: str = "PASS",
    result: str = "PASS",
    alpha: str = "WARNING",
    journey: str = "WARNING",
    tool: str = "WARNING",
    browser: str = "PENDING",
    user: str = "PENDING",
    overall: str = "REVIEW_REQUIRED",
    issues: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "contractCompatibility": contract,
        "resultIntegrity": result,
        "alphaCompatibility": alpha,
        "journeyRenderCompatibility": journey,
        "toolQualityVerdict": tool,
        "browserAnalysisCompatibility": browser,
        "userVisualVerdict": user,
        "overallHandoffVerdict": overall,
        "issueCodes": sorted(set(issues or [])),
    }


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
        "userVisualVerdict": state.get("userVisualVerdict", "PENDING"),
        "reviewSource": state.get("reviewSource"),
        "previewMatrix": state.get("previewMatrix") or {},
        "previewEvidence": preview_evidence_manifest(state) if state.get("previewMatrix") else {},
        "previewEvidenceOverall": preview_evidence_overall(state),
        "outputUrl": f"/api/sticker-tool/runs/{state['bridgeRunId']}/output"
        if state.get("outputRelativePath")
        else None,
    }


def get_run_state(bridge_run_id: str) -> dict[str, Any]:
    path = run_dir_for_id(bridge_run_id) / "run-status.json"
    if not path.is_file():
        raise StickerToolError("RUN_NOT_FOUND", "处理记录不存在。", status_code=404)
    return json.loads(path.read_text(encoding="utf-8"))


def submit_browser_analysis(bridge_run_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    run_dir = run_dir_for_id(bridge_run_id)
    state = get_run_state(bridge_run_id)
    if not state.get("clientAlphaMetrics"):
        raise StickerToolError("RUN_NOT_READY_FOR_ANALYSIS", "处理结果尚未准备好。", status_code=409)
    output_dimensions = verified_output_dimensions(state)
    analysis = normalize_browser_analysis(payload, output_dimensions=output_dimensions)
    comparison = compare_alpha_metrics(state["clientAlphaMetrics"], analysis["alpha"])
    analysis["comparison"] = comparison
    previews = analysis.get("previewMatrix") or {}
    state["browserAnalysis"] = analysis
    state["previewMatrix"] = previews
    (run_dir / "web-analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=2), encoding="utf-8")
    log_event(
        "sticker_tool.browser_analysis.received",
        {"bridgeRunId": bridge_run_id, "previewMatrix": previews},
    )
    log_event("sticker_tool.preview_matrix.received", {"bridgeRunId": bridge_run_id, "previewMatrix": previews})
    event_name = "sticker_tool.browser_analysis.validated" if comparison["ok"] else "sticker_tool.browser_analysis.mismatch"
    log_event(event_name, {"bridgeRunId": bridge_run_id, "mismatches": comparison.get("mismatches", [])})
    log_event(
        "sticker_tool.preview_matrix.validated" if preview_matrix_complete(previews) else "sticker_tool.preview_matrix.incomplete",
        {"bridgeRunId": bridge_run_id, "previewMatrix": previews},
    )
    provider_client_comparison = compare_alpha_metrics(
        state.get("providerAlphaMetrics") or {},
        state["clientAlphaMetrics"],
    )
    state["compatibility"] = evaluate_compatibility(
        state.get("manifest") or {},
        state["clientAlphaMetrics"],
        provider_client_comparison,
        browser_analysis=analysis,
        preview_matrix=previews,
    )
    if state["compatibility"]["overallHandoffVerdict"] == "BLOCKED":
        set_run_status(run_dir, state, "blocked", reason_code="BROWSER_ANALYSIS_BLOCKED")
    else:
        set_run_status(run_dir, state, "ready_for_review", reason_code="BROWSER_ANALYSIS_PASS")
    return public_run_payload(state)


def normalize_browser_analysis(
    payload: dict[str, Any],
    *,
    output_dimensions: tuple[int, int] | None = None,
) -> dict[str, Any]:
    alpha = payload.get("alpha") or payload
    normalized = {
        key: alpha.get(key)
        for key in (
            "width",
            "height",
            "totalPixels",
            "alphaMin",
            "alphaMax",
            "fullyTransparentCount",
            "fullyOpaqueCount",
            "semitransparentCount",
            "transparentFraction",
            "nonopaqueFraction",
            "topBorderNonzeroCount",
            "bottomBorderNonzeroCount",
            "leftBorderNonzeroCount",
            "rightBorderNonzeroCount",
            "borderNonzeroCount",
            "borderAlphaMax",
            "alphaBoundingBoxes",
            "lowAlphaHazeSuspected",
            "rectangularHazeSuspected",
            "heavySemitransparentHaloWarning",
        )
    }
    for key in ("width", "height", "totalPixels"):
        if not isinstance(normalized.get(key), int) or normalized[key] <= 0:
            raise StickerToolError("BROWSER_ANALYSIS_INVALID", f"浏览器分析字段无效: {key}", status_code=422)
    preview_matrix = normalize_preview_matrix(payload.get("previewMatrix") or {}, output_dimensions=output_dimensions)
    return {
        "schemaVersion": "personal-web-sticker-browser-analysis-v1",
        "createdAt": utc_now_iso(),
        "alpha": normalized,
        "previewMatrix": preview_matrix,
        "frontendEvents": payload.get("frontendEvents") if isinstance(payload.get("frontendEvents"), list) else [],
    }


def normalize_preview_matrix(
    matrix: dict[str, Any],
    *,
    output_dimensions: tuple[int, int] | None = None,
) -> dict[str, dict[str, Any]]:
    if not isinstance(matrix, dict):
        raise StickerToolError("PREVIEW_MATRIX_INVALID", "预览矩阵格式无效。", status_code=422)
    unknown = sorted(set(matrix) - set(PREVIEW_CONTEXTS))
    if unknown:
        raise StickerToolError("PREVIEW_CONTEXT_UNKNOWN", "预览上下文无效。", status_code=422)
    missing = [context for context in PREVIEW_CONTEXTS if context not in matrix]
    if missing:
        raise StickerToolError("PREVIEW_CONTEXT_MISSING", "预览上下文不完整。", status_code=422)
    return {
        context: normalize_preview_context(context, matrix[context], output_dimensions=output_dimensions)
        for context in PREVIEW_CONTEXTS
    }


def normalize_preview_context(
    context: str,
    raw: Any,
    *,
    output_dimensions: tuple[int, int] | None = None,
) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise StickerToolError("PREVIEW_CONTEXT_INVALID", "预览上下文字段无效。", status_code=422)
    rendered = bool(raw.get("rendered"))
    image_complete = bool(raw.get("imageComplete"))
    natural_width = bounded_number(raw.get("naturalWidth"), "naturalWidth", integer=True)
    natural_height = bounded_number(raw.get("naturalHeight"), "naturalHeight", integer=True)
    rendered_width = bounded_number(raw.get("renderedWidth"), "renderedWidth")
    rendered_height = bounded_number(raw.get("renderedHeight"), "renderedHeight")
    frame_rendered_width = bounded_number(raw.get("frameRenderedWidth", rendered_width), "frameRenderedWidth")
    frame_rendered_height = bounded_number(raw.get("frameRenderedHeight", rendered_height), "frameRenderedHeight")
    image_rendered_width = bounded_number(raw.get("imageRenderedWidth", rendered_width), "imageRenderedWidth")
    image_rendered_height = bounded_number(raw.get("imageRenderedHeight", rendered_height), "imageRenderedHeight")
    image_display = safe_css_fragment(raw.get("imageDisplay") or "inline")
    image_visibility = safe_css_fragment(raw.get("imageVisibility") or "visible")
    image_opacity = bounded_number(raw.get("imageOpacity", 1), "imageOpacity")
    visible = bool(raw.get("visible"))
    background_color = safe_css_fragment(raw.get("backgroundColor"))
    background_image_present = bool(raw.get("backgroundImagePresent"))
    context_source = safe_css_fragment(raw.get("contextSource"))
    evidence_source = safe_evidence_source(raw.get("evidenceSource"), default="browser-rendered-composite")
    failure_code = raw.get("failureCode")
    if failure_code is not None:
        failure_code = safe_failure_code(failure_code)
    expected_sources = {
        "light": "fixed-light",
        "dark": "fixed-dark",
        "web": "web-computed",
        "journey": "journey-computed",
    }
    if context_source != expected_sources[context]:
        rendered = False
        failure_code = failure_code or "CONTEXT_SOURCE_MISMATCH"
    if output_dimensions and (int(natural_width), int(natural_height)) != output_dimensions:
        rendered = False
        failure_code = "PREVIEW_OUTPUT_DIMENSION_MISMATCH"
    if rendered and (
        not image_complete or
        natural_width <= 0 or
        natural_height <= 0 or
        frame_rendered_width <= 0 or
        frame_rendered_height <= 0 or
        image_rendered_width <= 0 or
        image_rendered_height <= 0 or
        not visible or
        image_display == "none" or
        image_visibility == "hidden" or
        image_opacity <= 0
    ):
        rendered = False
        failure_code = failure_code or "RENDER_VALIDATION_FAILED"
    return {
        "rendered": rendered,
        "imageComplete": image_complete,
        "naturalWidth": int(natural_width),
        "naturalHeight": int(natural_height),
        "renderedWidth": float(rendered_width),
        "renderedHeight": float(rendered_height),
        "frameRenderedWidth": float(frame_rendered_width),
        "frameRenderedHeight": float(frame_rendered_height),
        "imageRenderedWidth": float(image_rendered_width),
        "imageRenderedHeight": float(image_rendered_height),
        "imageDisplay": image_display,
        "imageVisibility": image_visibility,
        "imageOpacity": float(image_opacity),
        "visible": visible,
        "backgroundColor": background_color,
        "backgroundImagePresent": background_image_present,
        "contextSource": context_source,
        "evidenceSource": evidence_source,
        "failureCode": None if rendered else (failure_code or "PREVIEW_NOT_RENDERED"),
    }


def bounded_number(value: Any, field: str, *, integer: bool = False) -> float:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise StickerToolError("PREVIEW_CONTEXT_INVALID", f"预览数值字段无效: {field}", status_code=422)
    number = float(value)
    if number < 0 or number > 10000:
        raise StickerToolError("PREVIEW_CONTEXT_INVALID", f"预览数值字段越界: {field}", status_code=422)
    if integer and int(number) != number:
        raise StickerToolError("PREVIEW_CONTEXT_INVALID", f"预览整数字段无效: {field}", status_code=422)
    return number


def safe_css_fragment(value: Any) -> str:
    text = str(value or "").strip()
    text = re.sub(r"url\([^)]*\)", "url([redacted])", text, flags=re.I)
    text = re.sub(r"[^a-zA-Z0-9#(),.% _\\-\\[\\]]+", "", text)
    return text[:160]


def safe_evidence_source(value: Any, *, default: str = "missing") -> str:
    text = str(value or default)
    return text if text in PREVIEW_EVIDENCE_SOURCES else default


def safe_failure_code(value: Any) -> str:
    code = re.sub(r"[^A-Z0-9_\\-]+", "", str(value or "").upper())
    return code[:80] or "PREVIEW_FAILED"


def record_review(bridge_run_id: str, payload: dict[str, Any] | str) -> dict[str, Any]:
    run_dir = run_dir_for_id(bridge_run_id)
    state = get_run_state(bridge_run_id)
    visual_verdict, issue_codes, review_source = normalize_review_payload(payload)
    if visual_verdict == "accepted":
        assert_acceptable_for_upload(state)
    state["userVisualVerdict"] = visual_verdict.upper()
    state["reviewSource"] = review_source
    state["review"] = {
        "schemaVersion": "personal-web-sticker-user-review-v1",
        "visualVerdict": visual_verdict,
        "reviewSource": review_source,
        "issueCodes": issue_codes,
        "previewContextsReviewed": sorted(
            [key for key, record in (state.get("previewMatrix") or {}).items() if (record or {}).get("rendered")]
        ),
        "reviewedAt": utc_now_iso(),
    }
    (run_dir / "user-review.json").write_text(json.dumps(state["review"], ensure_ascii=False, indent=2), encoding="utf-8")
    if state.get("compatibility"):
        state["compatibility"]["userVisualVerdict"] = visual_verdict.upper()
        state["compatibility"]["overallHandoffVerdict"] = "ACCEPTED_FOR_UPLOAD" if visual_verdict == "accepted" else "REJECTED"
    next_state = "accepted" if visual_verdict == "accepted" else "rejected"
    set_run_status(run_dir, state, next_state, reason_code=f"USER_{next_state.upper()}")
    event = "sticker_tool.review.accepted" if visual_verdict == "accepted" else "sticker_tool.review.rejected"
    log_event(event, {"bridgeRunId": bridge_run_id, "issueCodes": issue_codes})
    return public_run_payload(state)


def normalize_review_payload(payload: dict[str, Any] | str) -> tuple[str, list[str], str]:
    if isinstance(payload, str):
        verdict = payload
        codes: list[str] = []
        review_source = "user"
    else:
        verdict = payload.get("visualVerdict") or payload.get("verdict") or ""
        codes = list(payload.get("issueCodes") or [])
        review_source = str(payload.get("reviewSource") or "user")
    if review_source not in {"user", "automated-smoke"}:
        raise StickerToolError("REVIEW_SOURCE_INVALID", "Review source is invalid.", status_code=422)
    if verdict not in {"accepted", "rejected"}:
        raise StickerToolError("REVIEW_VERDICT_INVALID", "视觉审核结果无效。", status_code=422)
    deduped = sorted(set(str(code) for code in codes))
    unsupported = [code for code in deduped if code not in SUPPORTED_REVIEW_ISSUES]
    if unsupported:
        raise StickerToolError("REVIEW_ISSUE_CODE_INVALID", "拒绝原因无效。", status_code=422)
    if verdict == "accepted" and deduped:
        raise StickerToolError("ACCEPTED_REVIEW_CANNOT_HAVE_ISSUES", "接受结果不能包含问题原因。", status_code=422)
    if verdict == "rejected" and not deduped:
        deduped = ["OTHER"]
    return verdict, deduped, review_source


def assert_acceptable_for_upload(state: dict[str, Any]) -> None:
    compatibility = state.get("compatibility") or {}
    required = {
        "contractCompatibility": "PASS",
        "resultIntegrity": "PASS",
        "alphaCompatibility": "PASS",
        "journeyRenderCompatibility": "PASS",
        "browserAnalysisCompatibility": "PASS",
    }
    blocked_reasons = []
    if state.get("status") != "ready_for_review":
        blocked_reasons.append("RUN_NOT_READY_FOR_REVIEW")
    if compatibility.get("overallHandoffVerdict") == "BLOCKED":
        blocked_reasons.append("MACHINE_BLOCKED")
    for key, expected in required.items():
        if compatibility.get(key) != expected:
            blocked_reasons.append(key)
    if compatibility.get("toolQualityVerdict") == "FAIL":
        blocked_reasons.append("TOOL_QUALITY_FAIL")
    if not state.get("browserAnalysis"):
        blocked_reasons.append("BROWSER_ANALYSIS_REQUIRED")
    if not preview_evidence_complete(state):
        blocked_reasons.append("PREVIEW_EVIDENCE_INCOMPLETE")
    if blocked_reasons:
        log_event(
            "sticker_tool.review.acceptance_blocked",
            {"bridgeRunId": state.get("bridgeRunId"), "reasonCode": ",".join(sorted(set(blocked_reasons)))},
        )
        log_event("sticker_tool.media_upload.blocked", {"bridgeRunId": state.get("bridgeRunId")})
        raise StickerToolError("RESULT_NOT_ACCEPTABLE_FOR_UPLOAD", "结果尚未通过上传前校验。", status_code=409)
    log_event("sticker_tool.media_upload.allowed", {"bridgeRunId": state.get("bridgeRunId")})


def mark_uploaded(bridge_run_id: str) -> dict[str, Any]:
    run_dir = run_dir_for_id(bridge_run_id)
    state = get_run_state(bridge_run_id)
    set_run_status(run_dir, state, "uploaded", reason_code="MEDIA_UPLOAD_SUCCEEDED")
    return public_run_payload(state)


def submit_preview_evidence(
    bridge_run_id: str,
    files: list[tuple[str, bytes]],
    *,
    evidence_source: str = "browser-rendered-composite",
) -> dict[str, Any]:
    run_dir = run_dir_for_id(bridge_run_id)
    state = get_run_state(bridge_run_id)
    preview_matrix = state.get("previewMatrix") or {}
    if not preview_matrix:
        raise StickerToolError("PREVIEW_MATRIX_REQUIRED", "预览矩阵尚未验证。", status_code=409)
    source = safe_evidence_source(evidence_source, default="browser-rendered-composite")
    evidence = dict(state.get("previewEvidence") or {})
    seen: set[str] = set()
    for filename, data in files:
        context = preview_context_from_filename(filename or "")
        if context in seen:
            raise StickerToolError("PREVIEW_EVIDENCE_DUPLICATE", "预览证据重复。", status_code=422)
        seen.add(context)
        record = preview_matrix.get(context) or {}
        if record.get("rendered") is not True:
            log_event("sticker_tool.preview_evidence.rejected", {"bridgeRunId": bridge_run_id, "context": context})
            raise StickerToolError("PREVIEW_CONTEXT_NOT_RENDERED", "预览上下文尚未通过渲染验证。", status_code=409)
        if not data or len(data) > MAX_PREVIEW_EVIDENCE_BYTES:
            raise StickerToolError("PREVIEW_EVIDENCE_SIZE_INVALID", "预览证据大小无效。", status_code=413)
        if not data.startswith(b"\x89PNG\r\n\x1a\n"):
            log_event("sticker_tool.preview_evidence.rejected", {"bridgeRunId": bridge_run_id, "context": context})
            raise StickerToolError("PREVIEW_EVIDENCE_NOT_PNG", "预览证据必须是 PNG。", status_code=422)
        content = analyze_preview_evidence_content(context, data, record, state)
        target = run_dir / "preview-evidence" / PREVIEW_EVIDENCE_FILES[context]
        target.parent.mkdir(parents=True, exist_ok=True)
        tmp = target.with_suffix(target.suffix + ".tmp")
        tmp.write_bytes(data)
        metrics = analyze_png_alpha(tmp)
        if metrics["width"] > MAX_PREVIEW_EVIDENCE_DIMENSION or metrics["height"] > MAX_PREVIEW_EVIDENCE_DIMENSION:
            tmp.unlink(missing_ok=True)
            raise StickerToolError("PREVIEW_EVIDENCE_DIMENSION_INVALID", "预览证据尺寸无效。", status_code=422)
        os.replace(tmp, target)
        evidence[context] = {
            "rendered": True,
            "captured": True,
            "file": f"previews/{PREVIEW_EVIDENCE_FILES[context]}",
            "relativePath": repo_relative(target),
            "sha256": sha256_path(target),
            "bytes": target.stat().st_size,
            "width": metrics["width"],
            "height": metrics["height"],
            "evidenceSource": source,
            "contentVerified": True,
            "contentVerificationMethod": content["method"],
            "foregroundPixelCount": content["foregroundPixelCount"],
            "foregroundBoundingBox": content["foregroundBoundingBox"],
            "uniqueColorCount": content["uniqueColorCount"],
            "omissionCode": None,
        }
        log_event(
            "sticker_tool.preview_evidence.stored",
            {
                "bridgeRunId": bridge_run_id,
                "context": context,
                "bytes": target.stat().st_size,
                "sha256": evidence[context]["sha256"],
            },
        )
    state["previewEvidence"] = evidence
    write_run_state(run_dir, state)
    log_event("sticker_tool.preview_evidence.received", {"bridgeRunId": bridge_run_id, "contexts": sorted(seen)})
    log_event("sticker_tool.preview_evidence.validated", {"bridgeRunId": bridge_run_id, "contexts": sorted(seen)})
    return public_run_payload(state)


def analyze_preview_evidence_content(
    context: str,
    data: bytes,
    preview_record: dict[str, Any],
    state: dict[str, Any],
) -> dict[str, Any]:
    decoded = decode_rgba_png_bytes(data, error_code="PREVIEW_EVIDENCE_NOT_PNG", status_code=422)
    width = int(decoded["width"])
    height = int(decoded["height"])
    pixels: bytes = decoded["pixels"]
    if width <= 0 or height <= 0 or len(pixels) != width * height * 4:
        raise StickerToolError("PREVIEW_EVIDENCE_DIMENSION_INVALID", "Preview PNG dimensions are invalid.", status_code=422)
    unique_colors: set[tuple[int, int, int, int]] = set()
    for index in range(0, len(pixels), 4):
        unique_colors.add(tuple(pixels[index : index + 4]))
        if len(unique_colors) > 4096:
            break
    if len(unique_colors) <= 1:
        raise StickerToolError("PREVIEW_EVIDENCE_STICKER_MISSING", "Preview evidence contains only one color.", status_code=422)
    output_dimensions = verified_output_dimensions(state)
    if output_dimensions:
        natural = (int(preview_record.get("naturalWidth") or 0), int(preview_record.get("naturalHeight") or 0))
        if natural != output_dimensions:
            raise StickerToolError(
                "PREVIEW_OUTPUT_DIMENSION_MISMATCH",
                "Preview image natural dimensions do not match processed output.",
                status_code=422,
            )
    output_alpha = state.get("clientAlphaMetrics") or {}
    if int(output_alpha.get("alphaMax") or 0) <= 0:
        raise StickerToolError("PREVIEW_EVIDENCE_STICKER_MISSING", "Processed output has no visible pixels.", status_code=422)
    background_rgb = expected_preview_background_rgb(context, preview_record, pixels)
    foreground_box = empty_box()
    foreground_count = 0
    for y in range(height):
        row_start = y * width * 4
        for x in range(width):
            offset = row_start + x * 4
            red, green, blue, alpha = pixels[offset : offset + 4]
            if alpha <= 0:
                continue
            if rgb_distance((red, green, blue), background_rgb) > 3:
                foreground_count += 1
                extend_box(foreground_box, x, y)
    if foreground_count <= 0:
        raise StickerToolError("PREVIEW_EVIDENCE_STICKER_MISSING", "Preview evidence has no foreground pixels.", status_code=422)
    method = "exact-fixed-background" if context in FIXED_PREVIEW_BACKGROUNDS else "heuristic-background-difference"
    return {
        "method": method,
        "foregroundPixelCount": foreground_count,
        "foregroundBoundingBox": finalize_box(foreground_box),
        "uniqueColorCount": len(unique_colors),
    }


def expected_preview_background_rgb(
    context: str,
    preview_record: dict[str, Any],
    pixels: bytes,
) -> tuple[int, int, int]:
    if context in FIXED_PREVIEW_BACKGROUNDS:
        return FIXED_PREVIEW_BACKGROUNDS[context]
    parsed = parse_rgb_css(preview_record.get("backgroundColor"))
    if parsed is not None:
        return parsed
    counts: dict[tuple[int, int, int], int] = {}
    for index in range(0, len(pixels), 4):
        red, green, blue, alpha = pixels[index : index + 4]
        if alpha > 0:
            key = (red, green, blue)
            counts[key] = counts.get(key, 0) + 1
    if not counts:
        raise StickerToolError("PREVIEW_EVIDENCE_STICKER_MISSING", "Preview evidence has no opaque content.", status_code=422)
    return max(counts.items(), key=lambda item: item[1])[0]


def parse_rgb_css(value: Any) -> tuple[int, int, int] | None:
    match = re.search(r"rgba?\((\d+),\s*(\d+),\s*(\d+)", str(value or ""))
    if not match:
        return None
    return tuple(max(0, min(255, int(part))) for part in match.groups())


def rgb_distance(left: tuple[int, int, int], right: tuple[int, int, int]) -> int:
    return max(abs(left[index] - right[index]) for index in range(3))


def preview_context_from_filename(filename: str) -> str:
    if "/" in filename or "\\" in filename or Path(filename).name != filename:
        raise StickerToolError("PREVIEW_EVIDENCE_CONTEXT_INVALID", "预览证据文件名无效。", status_code=422)
    for context, expected in PREVIEW_EVIDENCE_FILES.items():
        if filename == expected:
            return context
    raise StickerToolError("PREVIEW_EVIDENCE_CONTEXT_INVALID", "预览证据文件名无效。", status_code=422)


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
    manifest = diagnostic_manifest(state)
    inventory: dict[str, str] = {}
    with ZipFile(zip_path, "w", ZIP_DEFLATED) as archive:
        if state.get("capabilities"):
            add_json(archive, inventory, "contract/capabilities.json", state.get("capabilities"))
        add_json(archive, inventory, "contract/schema-hashes.json", contract_schema_hashes())
        add_json(archive, inventory, "web/run-status.json", sanitized_state_for_bundle(state))
        add_json(archive, inventory, "web/provider-result.json", state.get("manifest"))
        request_path = PROJECT_ROOT / state.get("requestRelativePath", "")
        if request_path.is_file():
            add_json(archive, inventory, "web/request.json", sanitize_request_for_bundle(request_path))
        add_json(archive, inventory, "web/preview-matrix.json", state.get("previewMatrix") or {})
        for name in ("web-analysis.json", "user-review.json"):
            path = run_dir_for_id(bridge_run_id) / name
            if path.is_file():
                archive.writestr(f"web/{name}", path.read_bytes())
                inventory[f"web/{name}"] = sha256_bytes(path.read_bytes())
        frontend_events = (state.get("browserAnalysis") or {}).get("frontendEvents")
        if frontend_events:
            add_json(archive, inventory, "web/frontend-events.json", frontend_events)
        add_backend_events(archive, inventory, bridge_run_id)
        input_dir = runs_root() / bridge_run_id / "input"
        if input_dir.is_dir():
            for input_path in input_dir.iterdir():
                if input_path.is_file() and not input_path.is_symlink():
                    add_file(archive, inventory, input_path, f"input/{input_path.name}")
        for relative in (state.get("toolArtifactRelativePaths") or {}).values():
            artifact_path = PROJECT_ROOT / relative
            if artifact_path.is_file():
                add_file(archive, inventory, artifact_path, f"tool/{artifact_path.name}")
        add_file(archive, inventory, output_path, "output/processed.png")
        add_preview_evidence_files(archive, inventory, state)
        manifest["fileInventory"] = inventory
        add_json(archive, inventory, "manifest.json", manifest)
    verify_zip_safety(zip_path)
    log_event("sticker_tool.bundle.created", {"bridgeRunId": bridge_run_id, "bytes": zip_path.stat().st_size})
    return zip_path, filename


def add_json(archive: ZipFile, inventory: dict[str, str], name: str, data: Any) -> None:
    payload = json.dumps(data, ensure_ascii=False, indent=2).encode("utf-8")
    archive.writestr(name, payload)
    inventory[name] = sha256_bytes(payload)


def add_file(archive: ZipFile, inventory: dict[str, str], path: Path, name: str) -> None:
    data = path.read_bytes()
    archive.writestr(name, data)
    inventory[name] = sha256_bytes(data)


def add_preview_evidence_files(archive: ZipFile, inventory: dict[str, str], state: dict[str, Any]) -> None:
    evidence = state.get("previewEvidence") or {}
    for context in PREVIEW_CONTEXTS:
        record = evidence.get(context) or {}
        relative = record.get("relativePath")
        if not relative:
            continue
        path = PROJECT_ROOT / relative
        if path.is_file() and not path.is_symlink():
            add_file(archive, inventory, path, f"previews/{PREVIEW_EVIDENCE_FILES[context]}")


def add_backend_events(archive: ZipFile, inventory: dict[str, str], bridge_run_id: str) -> None:
    log_dir = PROJECT_ROOT / ".local_logs" / "sticker-tool"
    if not log_dir.is_dir():
        return
    lines: list[str] = []
    for path in sorted(log_dir.glob("sticker-tool-*.jsonl"))[-7:]:
        try:
            for line in path.read_text(encoding="utf-8").splitlines():
                if bridge_run_id in line:
                    lines.append(sanitize_backend_event_line(line))
        except OSError:
            continue
    if not lines:
        return
    data = ("\n".join(lines[-500:]) + "\n").encode("utf-8")
    archive.writestr("web/backend-events.jsonl", data)
    inventory["web/backend-events.jsonl"] = sha256_bytes(data)


def sanitize_backend_event_line(line: str) -> str:
    try:
        event = json.loads(line)
    except json.JSONDecodeError:
        return sanitize_bundle_text(line)
    return json.dumps(sanitize_bundle_value(event), ensure_ascii=False, separators=(",", ":"))


def sanitize_bundle_value(value: Any) -> Any:
    if isinstance(value, dict):
        result = {}
        for key, item in value.items():
            lowered = str(key).lower()
            if lowered in {"path", "fullpath", "csrf", "cookie", "token", "password", "database_url"}:
                result[key] = "[REDACTED]"
            else:
                result[key] = sanitize_bundle_value(item)
        return result
    if isinstance(value, list):
        return [sanitize_bundle_value(item) for item in value]
    if isinstance(value, str):
        return sanitize_bundle_text(value)
    return value


def sanitize_bundle_text(value: str) -> str:
    root = str(PROJECT_ROOT.resolve())
    sanitized = value.replace(root, "[PROJECT_ROOT]")
    sanitized = sanitized.replace(root.replace("\\", "/"), "[PROJECT_ROOT]")
    return re.sub(r"[A-Za-z]:(?:\\\\|\\|/)[^\"'\s,}\]]+", "[LOCAL_PATH]", sanitized)


def contract_schema_hashes() -> dict[str, str]:
    root = PROJECT_ROOT / "docs" / "contracts"
    return {
        path.name: sha256_path(path)
        for path in sorted(root.glob("sticker-preprocessor-*"))
        if path.is_file()
    }


def diagnostic_manifest(state: dict[str, Any]) -> dict[str, Any]:
    manifest = state.get("manifest") or {}
    output = manifest.get("output") or {}
    return {
        "personalWeb": {"branch": git_branch(PROJECT_ROOT), "commit": git_commit()},
        "stickerPreprocessor": {"commit": manifest.get("tool", {}).get("gitCommit")},
        "bridgeRunId": state.get("bridgeRunId"),
        "toolRunId": state.get("toolRunId"),
        "contractVersion": CONTRACT_VERSION,
        "schemaHashes": contract_schema_hashes(),
        "inputHash": manifest.get("input", {}).get("sha256"),
        "outputHash": output.get("sha256"),
        "compatibility": state.get("compatibility"),
        "userVisualVerdict": state.get("userVisualVerdict"),
        "reviewSource": state.get("reviewSource"),
        "userIssueCodes": (state.get("review") or {}).get("issueCodes", []),
        "previewCompletionMatrix": state.get("previewMatrix") or {},
        "previewEvidence": preview_evidence_manifest(state),
        "previewEvidenceOverall": preview_evidence_overall(state),
        "fileInventory": {},
        "omissions": preview_omissions(state),
        "privacyWarning": "联动诊断包包含本次输入图片、处理结果和预览证据，仅在确认后手动分享。",
    }


def preview_evidence_manifest(state: dict[str, Any]) -> dict[str, dict[str, Any]]:
    matrix = state.get("previewMatrix") or {}
    evidence = state.get("previewEvidence") or {}
    result: dict[str, dict[str, Any]] = {}
    for context in PREVIEW_CONTEXTS:
        rendered = bool((matrix.get(context) or {}).get("rendered"))
        record = evidence.get(context) or {}
        captured = bool(record.get("captured") and record.get("sha256"))
        result[context] = {
            "rendered": rendered,
            "captured": captured,
            "evidenceSource": record.get("evidenceSource") if captured else "missing",
            "contentVerified": bool(record.get("contentVerified")) if captured else False,
            "contentVerificationMethod": record.get("contentVerificationMethod") if captured else None,
            "foregroundPixelCount": record.get("foregroundPixelCount") if captured else 0,
            "foregroundBoundingBox": record.get("foregroundBoundingBox") if captured else None,
            "uniqueColorCount": record.get("uniqueColorCount") if captured else 0,
            "file": f"previews/{PREVIEW_EVIDENCE_FILES[context]}" if captured else None,
            "sha256": record.get("sha256") if captured else None,
            "omissionCode": None if captured else preview_omission_code(context, matrix),
        }
    return result


def preview_omissions(state: dict[str, Any]) -> list[str]:
    evidence = preview_evidence_manifest(state)
    return [
        f"{context}:{record['omissionCode']}"
        for context, record in evidence.items()
        if not record.get("captured")
    ]


def preview_omission_code(context: str, matrix: dict[str, Any]) -> str:
    record = matrix.get(context) or {}
    if not record.get("rendered"):
        return str(record.get("failureCode") or "PREVIEW_NOT_RENDERED")
    return "CAPTURE_NOT_SUBMITTED"


def git_branch(repo: Path) -> str | None:
    try:
        return subprocess.check_output(["git", "branch", "--show-current"], cwd=repo, text=True, timeout=5).strip()
    except Exception:
        return None


def sanitized_state_for_bundle(state: dict[str, Any]) -> dict[str, Any]:
    copy = json.loads(json.dumps(state))
    copy.pop("toolPathFingerprint", None)
    return copy


def sanitize_request_for_bundle(request_path: Path) -> dict[str, Any]:
    request = json.loads(request_path.read_text(encoding="utf-8"))
    input_data = request.get("input")
    if isinstance(input_data, dict):
        input_data["path"] = f"input/{input_data.get('safeBasename') or 'source-image'}"
    return request


def verify_zip_safety(zip_path: Path) -> None:
    with ZipFile(zip_path, "r") as archive:
        text = b"\n".join(archive.read(name) for name in archive.namelist() if not name.endswith("/")).decode(
            "utf-8",
            errors="ignore",
        )
    if re.search(r"C:(?:\\\\|\\|/)|/Users/|DATABASE_URL|csrf|cookie|session|password|token|SECRET", text, re.I):
        raise StickerToolError("DIAGNOSTIC_BUNDLE_UNSAFE", "诊断包包含不应导出的路径或敏感字段。", status_code=500)
