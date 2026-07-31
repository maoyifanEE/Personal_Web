"""Sticker tool service safety tests."""

import json
import zlib
from pathlib import Path
from struct import pack

import pytest

from app.services import sticker_tool_service as service


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    import binascii

    return pack(">I", len(data)) + chunk_type + data + pack(">I", binascii.crc32(chunk_type + data) & 0xFFFFFFFF)


def rgba_png(width: int = 2, height: int = 2) -> bytes:
    rows = []
    pixels = [
        [255, 0, 0, 0],
        [255, 0, 0, 255],
        [255, 0, 0, 128],
        [255, 0, 0, 255],
    ]
    for y in range(height):
        row = bytearray([0])
        for x in range(width):
            row.extend(pixels[(y * width + x) % len(pixels)])
        rows.append(bytes(row))
    return b"".join(
        [
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            png_chunk(b"IDAT", zlib.compress(b"".join(rows))),
            png_chunk(b"IEND", b""),
        ]
    )


def test_parse_single_json_stdout_requires_one_object():
    assert service.parse_single_json_stdout('{"ok": true}\n') == {"ok": True}

    with pytest.raises(service.StickerToolError) as error:
        service.parse_single_json_stdout('{"ok": true}\n{"extra": true}\n')
    assert error.value.code == "STDOUT_NOT_SINGLE_JSON"

    with pytest.raises(service.StickerToolError) as error:
        service.parse_single_json_stdout("[1, 2, 3]\n")
    assert error.value.code == "STDOUT_JSON_NOT_OBJECT"


def test_resolve_tool_relative_blocks_absolute_and_escape(tmp_path: Path):
    tool_root = tmp_path / "tool"
    tool_root.mkdir()
    (tool_root / "handoff").mkdir()
    safe = tool_root / "handoff" / "result.json"
    safe.write_text("{}", encoding="utf-8")

    assert service.resolve_tool_relative(tool_root, "handoff/result.json") == safe.resolve()

    with pytest.raises(service.StickerToolError) as error:
        service.resolve_tool_relative(tool_root, str(safe.resolve()))
    assert error.value.code == "TOOL_PATH_INVALID"

    with pytest.raises(service.StickerToolError) as error:
        service.resolve_tool_relative(tool_root, "../outside.png")
    assert error.value.code == "TOOL_PATH_ESCAPE"


def test_analyze_png_alpha_reads_rgba_metrics(tmp_path: Path):
    image_path = tmp_path / "processed.png"
    image_path.write_bytes(rgba_png())

    metrics = service.analyze_png_alpha(image_path)

    assert metrics["width"] == 2
    assert metrics["height"] == 2
    assert metrics["fullyTransparentCount"] == 1
    assert metrics["fullyOpaqueCount"] == 2
    assert metrics["semitransparentCount"] == 1
    assert metrics["alphaMax"] == 255


def test_validate_result_manifest_rejects_schema_and_bridge_mismatch(tmp_path: Path):
    tool_root = tmp_path / "tool"
    handoff = tool_root / "handoff"
    handoff.mkdir(parents=True)
    manifest_path = handoff / "result.json"

    manifest_path.write_text(json.dumps({"schemaVersion": "wrong"}), encoding="utf-8")
    response = {"resultManifestRelativePath": "handoff/result.json"}
    with pytest.raises(service.StickerToolError) as error:
        service.validate_result_manifest(tool_root, response, "bridge-1")
    assert error.value.code == "MANIFEST_SCHEMA_INVALID"

    manifest_path.write_text(
        json.dumps(
            {
                "schemaVersion": service.RESULT_SCHEMA_VERSION,
                "contractVersion": service.CONTRACT_VERSION,
                "bridgeRunId": "other",
            }
        ),
        encoding="utf-8",
    )
    with pytest.raises(service.StickerToolError) as error:
        service.validate_result_manifest(tool_root, response, "bridge-1")
    assert error.value.code == "MANIFEST_BRIDGE_ID_MISMATCH"
