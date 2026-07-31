"""Synthetic local smoke test for the Sticker_Preprocessor handoff contract.

This script intentionally does not call Journey save, homepage media upload,
SFTP, SSH, Alembic, or any database API. It writes only ignored local bridge
artifacts under Personal_Web/.runtime.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from struct import pack
import sys
import zlib

REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO_ROOT / "backend"))

from app.services import sticker_tool_service as service  # noqa: E402


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
    print(f"SMOKE_BRIDGE_RUN_ID={result['bridgeRunId']}")
    print(f"SMOKE_STATUS={result['status']}")
    print(f"SMOKE_VERDICT={compatibility.get('overallHandoffVerdict')}")
    print(f"FINAL_INTEGRATION_REVIEW_ZIP={zip_path.resolve()}")
    print("STICKER_TOOL_INTEGRATION_SMOKE_PASS")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
