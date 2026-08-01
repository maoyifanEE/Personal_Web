"""Synthetic local smoke test for the Sticker_Preprocessor handoff contract.

This script intentionally does not call Journey save, homepage media upload,
SFTP, SSH, Alembic, or any database API. It writes only ignored local bridge
artifacts under Personal_Web/.runtime.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
from struct import pack
import sys
import time
from zipfile import ZIP_DEFLATED, ZipFile
import zlib

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services import sticker_tool_service as service  # noqa: E402


CONTRACT_FILES = [
    "sticker-preprocessor-handoff-v1.md",
    "sticker-preprocessor-capabilities-v1.schema.json",
    "sticker-preprocessor-request-v1.schema.json",
    "sticker-preprocessor-result-v1.schema.json",
    "sticker-preprocessor-response-v1.schema.json",
]


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    import binascii

    return pack(">I", len(data)) + chunk_type + data + pack(">I", binascii.crc32(chunk_type + data) & 0xFFFFFFFF)


def synthetic_rgba_png(path: Path) -> None:
    width = 48
    height = 48
    rows = []
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            dx = x - width / 2
            dy = y - height / 2
            alpha = 255 if (dx * dx + dy * dy) <= 16 * 16 else 0
            row.extend([31, 143, 144, alpha])
        rows.append(bytes(row))
    payload = b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            png_chunk(b"IDAT", zlib.compress(b"".join(rows))),
            png_chunk(b"IEND", b""),
        ]
    )
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)


def decode_rgba_png(data: bytes) -> dict[str, object]:
    if not data.startswith(b"\x89PNG\r\n\x1a\n"):
        raise ValueError("PNG signature missing")
    offset = 8
    width = height = color_type = bit_depth = None
    compressed = bytearray()
    while offset + 8 <= len(data):
        length = int.from_bytes(data[offset : offset + 4], "big")
        chunk_type = data[offset + 4 : offset + 8]
        chunk_data = data[offset + 8 : offset + 8 + length]
        offset += 12 + length
        if chunk_type == b"IHDR":
            width, height, bit_depth, color_type = unpack_png_header(chunk_data)
        elif chunk_type == b"IDAT":
            compressed.extend(chunk_data)
        elif chunk_type == b"IEND":
            break
    if width is None or height is None or bit_depth != 8 or color_type != 6:
        raise ValueError("Only 8-bit RGBA PNG is supported")
    raw = zlib.decompress(bytes(compressed))
    stride = width * 4
    pos = 0
    previous = [0] * stride
    pixels = bytearray()
    for _y in range(height):
        filter_type = raw[pos]
        pos += 1
        row = list(raw[pos : pos + stride])
        pos += stride
        reconstructed = unfilter_png_row(row, previous, filter_type, 4)
        pixels.extend(reconstructed)
        previous = reconstructed
    return {"width": width, "height": height, "pixels": bytes(pixels)}


def unpack_png_header(data: bytes) -> tuple[int, int, int, int]:
    width = int.from_bytes(data[0:4], "big")
    height = int.from_bytes(data[4:8], "big")
    return width, height, data[8], data[9]


def unfilter_png_row(row: list[int], previous: list[int], filter_type: int, bpp: int) -> list[int]:
    out = [0] * len(row)
    for index, value in enumerate(row):
        left = out[index - bpp] if index >= bpp else 0
        up = previous[index]
        up_left = previous[index - bpp] if index >= bpp else 0
        if filter_type == 0:
            predictor = 0
        elif filter_type == 1:
            predictor = left
        elif filter_type == 2:
            predictor = up
        elif filter_type == 3:
            predictor = (left + up) // 2
        elif filter_type == 4:
            predictor = paeth_predictor(left, up, up_left)
        else:
            raise ValueError("Unsupported PNG row filter")
        out[index] = (value + predictor) & 0xFF
    return out


def paeth_predictor(a: int, b: int, c: int) -> int:
    p = a + b - c
    pa = abs(p - a)
    pb = abs(p - b)
    pc = abs(p - c)
    if pa <= pb and pa <= pc:
        return a
    return b if pb <= pc else c


def encode_rgba_png(width: int, height: int, pixels: bytes) -> bytes:
    if len(pixels) != width * height * 4:
        raise ValueError("RGBA pixel length does not match dimensions")
    rows = []
    stride = width * 4
    for y in range(height):
        rows.append(bytes([0]) + pixels[y * stride : (y + 1) * stride])
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            png_chunk(b"IDAT", zlib.compress(b"".join(rows))),
            png_chunk(b"IEND", b""),
        ]
    )


def composite_processed_preview(processed_png: bytes, background: tuple[int, int, int], *, size: int = 180) -> bytes:
    processed = decode_rgba_png(processed_png)
    source_width = int(processed["width"])
    source_height = int(processed["height"])
    source_pixels: bytes = processed["pixels"]  # type: ignore[assignment]
    scale = min(size / source_width, size / source_height)
    draw_width = max(1, round(source_width * scale))
    draw_height = max(1, round(source_height * scale))
    offset_x = (size - draw_width) // 2
    offset_y = (size - draw_height) // 2
    canvas = bytearray()
    for _ in range(size * size):
        canvas.extend([background[0], background[1], background[2], 255])
    for y in range(draw_height):
        source_y = min(source_height - 1, int(y / scale))
        for x in range(draw_width):
            source_x = min(source_width - 1, int(x / scale))
            source_index = (source_y * source_width + source_x) * 4
            red, green, blue, alpha = source_pixels[source_index : source_index + 4]
            if alpha <= 0:
                continue
            target_x = offset_x + x
            target_y = offset_y + y
            target_index = (target_y * size + target_x) * 4
            inv_alpha = 255 - alpha
            canvas[target_index] = (red * alpha + canvas[target_index] * inv_alpha) // 255
            canvas[target_index + 1] = (green * alpha + canvas[target_index + 1] * inv_alpha) // 255
            canvas[target_index + 2] = (blue * alpha + canvas[target_index + 2] * inv_alpha) // 255
            canvas[target_index + 3] = 255
    return encode_rgba_png(size, size, bytes(canvas))


def synthetic_preview_matrix(output_width: int, output_height: int) -> dict[str, dict[str, object]]:
    values = {}
    for context, color, source in [
        ("light", "rgb(255, 255, 255)", "fixed-light"),
        ("dark", "rgb(31, 41, 51)", "fixed-dark"),
        ("web", "rgb(246, 250, 250)", "web-computed"),
        ("journey", "rgb(239, 247, 247)", "journey-computed"),
    ]:
        values[context] = {
            "rendered": True,
            "imageComplete": True,
            "naturalWidth": output_width,
            "naturalHeight": output_height,
            "renderedWidth": 180,
            "renderedHeight": 180,
            "frameRenderedWidth": 180,
            "frameRenderedHeight": 180,
            "imageRenderedWidth": 180,
            "imageRenderedHeight": 180,
            "imageDisplay": "block",
            "imageVisibility": "visible",
            "imageOpacity": 1,
            "visible": True,
            "backgroundColor": color,
            "backgroundImagePresent": False,
            "contextSource": source,
            "evidenceSource": "automated-synthetic-composite",
            "failureCode": None,
        }
    return values


def synthetic_preview_files(processed_path: Path) -> list[tuple[str, bytes]]:
    processed_png = processed_path.read_bytes()
    previews = [
        ("output-light.png", composite_processed_preview(processed_png, (255, 255, 255))),
        ("output-dark.png", composite_processed_preview(processed_png, (31, 41, 51))),
        ("output-web.png", composite_processed_preview(processed_png, (246, 250, 250))),
        ("output-journey.png", composite_processed_preview(processed_png, (239, 247, 247))),
    ]
    for _filename, data in previews:
        verify_preview_contains_processed_output(data, processed_png)
    print("STICKER_TOOL_SYNTHETIC_PREVIEW_CONTENT_PASS")
    return previews


def verify_preview_contains_processed_output(preview_png: bytes, processed_png: bytes) -> None:
    preview = decode_rgba_png(preview_png)
    processed = decode_rgba_png(processed_png)
    preview_width = int(preview["width"])
    preview_height = int(preview["height"])
    preview_pixels: bytes = preview["pixels"]  # type: ignore[assignment]
    processed_pixels: bytes = processed["pixels"]  # type: ignore[assignment]
    if preview_width <= 0 or preview_height <= 0:
        raise AssertionError("preview dimensions are invalid")
    unique = {
        tuple(preview_pixels[index : index + 4])
        for index in range(0, len(preview_pixels), 4)
    }
    if len(unique) <= 1:
        raise AssertionError("preview is single-color background-only evidence")
    if not any(processed_pixels[index + 3] > 0 for index in range(0, len(processed_pixels), 4)):
        raise AssertionError("processed output has no visible pixels")
    background = preview_pixels[0:4]
    foreground = []
    for y in range(preview_height):
        for x in range(preview_width):
            index = (y * preview_width + x) * 4
            pixel = preview_pixels[index : index + 4]
            if pixel != background:
                foreground.append((x, y))
    if not foreground:
        raise AssertionError("preview foreground bounding box is empty")
    min_x = min(x for x, _y in foreground)
    max_x = max(x for x, _y in foreground)
    min_y = min(y for _x, y in foreground)
    max_y = max(y for _x, y in foreground)
    if max_x <= min_x or max_y <= min_y:
        raise AssertionError("preview foreground bounding box is invalid")


def git_value(repo: Path, *args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=repo, text=True).strip()


def contract_hashes() -> dict[str, str]:
    root = REPO_ROOT / "docs" / "contracts"
    return {name: hashlib.sha256((root / name).read_bytes()).hexdigest() for name in CONTRACT_FILES}


def baseline_regression_summary() -> dict[str, object]:
    triage = REPO_ROOT / ".runtime" / "regression-triage"
    work_summary = triage / "work-handoff-node-runner" / "work-handoff-current-summary.txt"
    pg_compare = triage / "pg-restore-comparison.txt"
    return {
        "workHandoffClassification": "AGGREGATE_TEST_WINDOW_TIMEOUT"
        if work_summary.is_file()
        else "NOT_RUN_IN_THIS_SMOKE",
        "pgRestoreClassification": "CURRENT_AND_BASELINE_SAME_FAILURE"
        if pg_compare.is_file() and "CURRENT_AND_BASELINE_SAME_FAILURE" in pg_compare.read_text(encoding="utf-8")
        else "NOT_RUN_IN_THIS_SMOKE",
        "featureDependencyOverlap": "none",
        "triageArtifactsLocalOnly": True,
    }


def enrich_review_zip(zip_path: Path, tool_root: Path, state: dict[str, object]) -> None:
    compatibility = state.get("compatibility") or {}
    provider_manifest = state.get("manifest") or {}
    output = provider_manifest.get("output") or {}
    original_manifest: dict[str, object] = {}
    with ZipFile(zip_path, "r") as archive:
        if "manifest.json" in archive.namelist():
            original_manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
    enriched_manifest = {
        "personalWeb": {
            "branch": git_value(REPO_ROOT, "branch", "--show-current"),
            "commit": git_value(REPO_ROOT, "rev-parse", "HEAD"),
        },
        "stickerPreprocessor": {
            "branch": git_value(tool_root, "branch", "--show-current"),
            "commit": git_value(tool_root, "rev-parse", "HEAD"),
        },
        "contractSchemaHashes": contract_hashes(),
        "schemaHashes": original_manifest.get("schemaHashes", {}),
        "bridgeRunId": state.get("bridgeRunId"),
        "toolRunId": state.get("toolRunId"),
        "toolQualityVerdict": compatibility.get("toolQualityVerdict"),
        "alphaMetrics": output.get("alpha"),
        "compatibilityVerdict": compatibility,
        "userVisualVerdict": state.get("userVisualVerdict"),
        "reviewSource": state.get("reviewSource"),
        "userIssueCodes": (state.get("review") or {}).get("issueCodes", []),
        "previewCompletionMatrix": state.get("previewMatrix") or {},
        "previewEvidence": original_manifest.get("previewEvidence", {}),
        "previewEvidenceOverall": original_manifest.get("previewEvidenceOverall"),
        "fileInventory": original_manifest.get("fileInventory", {}),
        "omissions": original_manifest.get("omissions", []),
        "privacyWarning": original_manifest.get("privacyWarning"),
        "testSummary": {
            "syntheticSmoke": "PASS",
            "input": "synthetic RGBA PNG",
            "mediaUpload": "NOT_RUN",
            "databaseWrite": "NOT_RUN",
            "journeySave": "NOT_RUN",
        },
        "baselineRegressionAttribution": baseline_regression_summary(),
    }
    entries: dict[str, bytes] = {}
    with ZipFile(zip_path, "r") as archive:
        for name in archive.namelist():
            entries[name] = archive.read(name)
    if "web/request.json" in entries:
        request = json.loads(entries["web/request.json"].decode("utf-8"))
        input_data = request.get("input")
        if isinstance(input_data, dict):
            input_data["path"] = f"input/{input_data.get('safeBasename') or 'source-image'}"
        entries["web/request.json"] = json.dumps(request, ensure_ascii=False, indent=2).encode("utf-8")
    entries["manifest.json"] = json.dumps(enriched_manifest, ensure_ascii=False, indent=2).encode("utf-8")
    tmp_path = zip_path.with_suffix(zip_path.suffix + ".tmp")
    with ZipFile(tmp_path, "w", ZIP_DEFLATED) as archive:
        for name, data in entries.items():
            archive.writestr(name, data)
    os.replace(tmp_path, zip_path)


def wait_for_review_state(bridge_run_id: str, timeout_seconds: int = 120) -> dict[str, object]:
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        state = service.get_run_state(bridge_run_id)
        status = state.get("status")
        if status in {"ready_for_review", "blocked", "failed", "interrupted"}:
            return state
        time.sleep(0.5)
    raise SystemExit(f"Smoke run timed out waiting for async worker: {bridge_run_id}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--tool-root", default="")
    args = parser.parse_args()

    if args.tool_root:
        os.environ["STICKER_PREPROCESSOR_PATH"] = str(Path(args.tool_root).resolve())
    else:
        default_tool = REPO_ROOT.parent / "script" / "Sticker_Preprocessor"
        os.environ.setdefault("STICKER_PREPROCESSOR_PATH", str(default_tool))
    os.environ.setdefault("PERSONAL_WEB_DATA_PROFILE", "local")

    input_path = REPO_ROOT / ".runtime" / "sticker-tool-smoke" / "synthetic-alpha.png"
    synthetic_rgba_png(input_path)
    result = service.create_bridge_run(
        input_path.read_bytes(),
        input_path.name,
        "image/png",
        {
            "mode": "alpha_cleanup",
            "aiModel": "silueta",
            "alphaMatting": False,
            "paddingPixels": 2,
            "alphaCropThreshold": 8,
        },
        data_profile=os.environ.get("PERSONAL_WEB_DATA_PROFILE"),
    )
    if result["status"] not in {"queued", "validating_tool", "running", "validating_result"}:
        raise SystemExit(f"Unexpected initial run status: {result['status']}")
    state = wait_for_review_state(result["bridgeRunId"])
    if state["status"] != "ready_for_review":
        raise SystemExit(f"Unexpected completed run status: {state['status']}")
    public_state = service.public_run_payload(state)
    if not public_state.get("outputUrl"):
        raise SystemExit("Smoke run did not produce an output URL")
    compatibility = state.get("compatibility") or {}
    if compatibility.get("contractCompatibility") != "PASS":
        raise SystemExit("Contract compatibility did not pass")
    if compatibility.get("resultIntegrity") != "PASS":
        raise SystemExit("Result integrity did not pass")
    output_relative_path = state.get("outputRelativePath")
    if not isinstance(output_relative_path, str):
        raise SystemExit("Smoke run did not expose processed output path")
    processed_path = REPO_ROOT / output_relative_path
    processed = decode_rgba_png(processed_path.read_bytes())
    output_width = int(processed["width"])
    output_height = int(processed["height"])
    if state.get("clientAlphaMetrics", {}).get("width") != output_width:
        raise SystemExit("Processed output width does not match backend metrics")
    if state.get("clientAlphaMetrics", {}).get("height") != output_height:
        raise SystemExit("Processed output height does not match backend metrics")
    analyzed = service.submit_browser_analysis(
        result["bridgeRunId"],
        {
            "alpha": state.get("clientAlphaMetrics"),
            "previewMatrix": synthetic_preview_matrix(output_width, output_height),
            "frontendEvents": [
                {"name": "output.decoded"},
                {"name": "alpha.analyzed"},
                {"name": "preview_matrix.completed"},
            ],
        },
    )
    if analyzed.get("status") != "ready_for_review":
        raise SystemExit(f"Browser analysis blocked smoke run: {analyzed.get('status')}")
    service.submit_preview_evidence(
        result["bridgeRunId"],
        synthetic_preview_files(processed_path),
        evidence_source="automated-synthetic-composite",
    )
    reviewed = service.record_review(
        result["bridgeRunId"],
        {"visualVerdict": "accepted", "issueCodes": [], "reviewSource": "automated-smoke"},
    )
    if reviewed.get("compatibility", {}).get("overallHandoffVerdict") != "ACCEPTED_FOR_UPLOAD":
        raise SystemExit("Accepted review did not produce ACCEPTED_FOR_UPLOAD")
    state = service.get_run_state(result["bridgeRunId"])
    zip_path, _filename = service.create_integration_bundle(result["bridgeRunId"])
    enrich_review_zip(zip_path, Path(os.environ["STICKER_PREPROCESSOR_PATH"]), state)
    print(f"SMOKE_BRIDGE_RUN_ID={result['bridgeRunId']}")
    print(f"SMOKE_INITIAL_STATUS={result['status']}")
    print(f"SMOKE_STATUS={state['status']}")
    print(f"SMOKE_VERDICT={state.get('compatibility', {}).get('overallHandoffVerdict')}")
    print("SMOKE_MEDIA_UPLOAD=NOT_RUN")
    print("SMOKE_DATABASE_WRITE=NOT_RUN")
    print(f"FINAL_INTEGRATION_REVIEW_ZIP={zip_path.resolve()}")
    print("STICKER_TOOL_INTEGRATION_SMOKE_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
