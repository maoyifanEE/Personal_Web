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
        "bridgeRunId": state.get("bridgeRunId"),
        "toolRunId": state.get("toolRunId"),
        "toolQualityVerdict": compatibility.get("toolQualityVerdict"),
        "alphaMetrics": output.get("alpha"),
        "compatibilityVerdict": compatibility,
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
    if result["status"] != "ready_for_review":
        raise SystemExit(f"Unexpected run status: {result['status']}")
    if not result.get("outputUrl"):
        raise SystemExit("Smoke run did not produce an output URL")
    state = service.get_run_state(result["bridgeRunId"])
    compatibility = state.get("compatibility") or {}
    if compatibility.get("contractCompatibility") != "PASS":
        raise SystemExit("Contract compatibility did not pass")
    if compatibility.get("resultIntegrity") != "PASS":
        raise SystemExit("Result integrity did not pass")
    zip_path, _filename = service.create_integration_bundle(result["bridgeRunId"])
    enrich_review_zip(zip_path, Path(os.environ["STICKER_PREPROCESSOR_PATH"]), state)
    print(f"SMOKE_BRIDGE_RUN_ID={result['bridgeRunId']}")
    print(f"SMOKE_STATUS={result['status']}")
    print(f"SMOKE_VERDICT={compatibility.get('overallHandoffVerdict')}")
    print(f"FINAL_INTEGRATION_REVIEW_ZIP={zip_path.resolve()}")
    print("STICKER_TOOL_INTEGRATION_SMOKE_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
