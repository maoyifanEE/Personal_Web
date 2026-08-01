"""Sticker tool service safety tests."""

import json
import zlib
from concurrent.futures import Future
from pathlib import Path
from struct import pack
from zipfile import ZipFile

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


def bridge_id(char: str = "a") -> str:
    return char * 32


def use_temp_bridge(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    root = tmp_path / "bridge"
    monkeypatch.setattr(service, "bridge_root", lambda: root)
    monkeypatch.setattr(service, "runs_root", lambda: root / "runs")
    monkeypatch.setattr(service, "outputs_root", lambda: root / "outputs")
    monkeypatch.setattr(service, "review_bundles_root", lambda: root / "review-bundles")
    return root


def write_state(run_id: str, state: dict, monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> Path:
    use_temp_bridge(monkeypatch, tmp_path)
    run_dir = service.run_dir_for_id(run_id)
    run_dir.mkdir(parents=True, exist_ok=True)
    service.write_run_state(run_dir, state)
    return run_dir


def alpha_metrics() -> dict:
    return {
        "width": 4,
        "height": 4,
        "totalPixels": 16,
        "alphaMin": 0,
        "alphaMax": 255,
        "fullyTransparentCount": 12,
        "fullyOpaqueCount": 4,
        "semitransparentCount": 0,
        "transparentFraction": 0.75,
        "nonopaqueFraction": 0.75,
        "topBorderNonzeroCount": 0,
        "bottomBorderNonzeroCount": 0,
        "leftBorderNonzeroCount": 0,
        "rightBorderNonzeroCount": 0,
        "borderNonzeroCount": 0,
        "borderAlphaMax": 0,
        "alphaBoundingBoxes": {},
        "lowAlphaHazeSuspected": False,
        "rectangularHazeSuspected": False,
        "heavySemitransparentHaloWarning": False,
    }


def pass_compatibility() -> dict:
    return service.compatibility_payload(
        contract="PASS",
        result="PASS",
        alpha="PASS",
        journey="PASS",
        tool="PASS",
        browser="PASS",
        overall="REVIEW_REQUIRED",
    )


def preview_record(source: str, rendered: bool = True) -> dict:
    return {
        "rendered": rendered,
        "imageComplete": True,
        "naturalWidth": 4,
        "naturalHeight": 4,
        "renderedWidth": 120,
        "renderedHeight": 120,
        "visible": True,
        "backgroundColor": "rgb(255, 255, 255)",
        "backgroundImagePresent": False,
        "contextSource": source,
        "failureCode": None if rendered else "TEST_FAILURE",
    }


def preview_matrix(rendered: bool = True) -> dict:
    return {
        "light": preview_record("fixed-light", rendered),
        "dark": preview_record("fixed-dark", rendered),
        "web": preview_record("web-computed", rendered),
        "journey": preview_record("journey-computed", rendered),
    }


def ready_state(run_id: str) -> dict:
    metrics = alpha_metrics()
    return {
        "schemaVersion": service.RUN_STATUS_SCHEMA_VERSION,
        "bridgeRunId": run_id,
        "toolRunId": bridge_id("b"),
        "contractVersion": service.CONTRACT_VERSION,
        "createdAt": service.utc_now_iso(),
        "updatedAt": service.utc_now_iso(),
        "status": "ready_for_review",
        "dataProfile": "local",
        "toolConfigSource": "env",
        "requestRelativePath": None,
        "outputRelativePath": None,
        "toolArtifactRelativePaths": {},
        "manifest": {
            "processing": {"qualityVerdict": "PASS"},
            "output": {"alpha": metrics},
        },
        "providerAlphaMetrics": metrics,
        "clientAlphaMetrics": metrics,
        "browserAnalysis": {"comparison": {"ok": True, "mismatches": []}},
        "previewMatrix": preview_matrix(),
        "previewEvidence": {},
        "review": None,
        "compatibility": pass_compatibility(),
        "userVisualVerdict": "PENDING",
    }


def test_validate_bridge_run_id_rejects_path_like_ids():
    assert service.validate_bridge_run_id(bridge_id()) == bridge_id()

    for bad_id in ("../escape", "ABCDEF" * 6, "not-a-run-id", "a" * 31, "g" * 32):
        with pytest.raises(service.StickerToolError) as error:
            service.validate_bridge_run_id(bad_id)
        assert error.value.code == "RUN_ID_INVALID"


def test_accept_review_rejects_blocked_or_unanalyzed_run(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    run_id = bridge_id()
    state = ready_state(run_id)
    state["browserAnalysis"] = None
    state["compatibility"]["browserAnalysisCompatibility"] = "PENDING"
    write_state(run_id, state, monkeypatch, tmp_path)

    with pytest.raises(service.StickerToolError) as error:
        service.record_review(run_id, {"visualVerdict": "accepted", "issueCodes": []})

    assert error.value.code == "RESULT_NOT_ACCEPTABLE_FOR_UPLOAD"
    persisted = service.get_run_state(run_id)
    assert persisted["userVisualVerdict"] == "PENDING"
    assert persisted["review"] is None


def test_browser_analysis_updates_compatibility_and_accept_review_persists(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    run_id = bridge_id()
    state = ready_state(run_id)
    state["browserAnalysis"] = None
    state["previewMatrix"] = {}
    state["compatibility"]["browserAnalysisCompatibility"] = "PENDING"
    state["compatibility"]["journeyRenderCompatibility"] = "WARNING"
    write_state(run_id, state, monkeypatch, tmp_path)

    analyzed = service.submit_browser_analysis(
        run_id,
        {
            "alpha": alpha_metrics(),
            "previewMatrix": preview_matrix(),
            "frontendEvents": [{"name": "alpha.analyzed"}],
        },
    )
    assert analyzed["status"] == "ready_for_review"
    assert analyzed["compatibility"]["browserAnalysisCompatibility"] == "PASS"
    assert analyzed["compatibility"]["journeyRenderCompatibility"] == "PASS"

    reviewed = service.record_review(run_id, {"visualVerdict": "accepted", "issueCodes": []})
    assert reviewed["status"] == "accepted"
    assert reviewed["userVisualVerdict"] == "ACCEPTED"
    assert reviewed["compatibility"]["overallHandoffVerdict"] == "ACCEPTED_FOR_UPLOAD"
    assert (service.run_dir_for_id(run_id) / "user-review.json").is_file()


def test_browser_analysis_mismatch_blocks_acceptance(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    run_id = bridge_id()
    state = ready_state(run_id)
    state["browserAnalysis"] = None
    write_state(run_id, state, monkeypatch, tmp_path)
    browser_alpha = alpha_metrics()
    browser_alpha["fullyTransparentCount"] = 0

    analyzed = service.submit_browser_analysis(
        run_id,
        {
            "alpha": browser_alpha,
            "previewMatrix": preview_matrix(),
        },
    )

    assert analyzed["status"] == "blocked"
    assert analyzed["compatibility"]["browserAnalysisCompatibility"] == "FAIL"
    with pytest.raises(service.StickerToolError) as error:
        service.record_review(run_id, {"visualVerdict": "accepted", "issueCodes": []})
    assert error.value.code == "RESULT_NOT_ACCEPTABLE_FOR_UPLOAD"


def test_rejected_review_defaults_and_persists_issue_codes(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    run_id = bridge_id()
    write_state(run_id, ready_state(run_id), monkeypatch, tmp_path)

    reviewed = service.record_review(run_id, {"visualVerdict": "rejected", "issueCodes": []})

    assert reviewed["status"] == "rejected"
    persisted = json.loads((service.run_dir_for_id(run_id) / "user-review.json").read_text(encoding="utf-8"))
    assert persisted["issueCodes"] == ["OTHER"]


def test_queue_limit_counts_active_worker_futures(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    use_temp_bridge(monkeypatch, tmp_path)
    monkeypatch.setattr(service, "_stale_runs_marked", False)
    futures = {bridge_id(char): Future() for char in ("a", "b", "c")}
    monkeypatch.setattr(service, "_active_futures", futures)

    with pytest.raises(service.StickerToolError) as error:
        service.ensure_run_capacity()

    assert error.value.code == "RUN_CAPACITY_REACHED"


def test_stale_processing_run_becomes_interrupted(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    run_id = bridge_id()
    state = ready_state(run_id)
    state["status"] = "running"
    write_state(run_id, state, monkeypatch, tmp_path)
    monkeypatch.setattr(service, "_stale_runs_marked", False)
    monkeypatch.setattr(service, "_active_futures", {})

    service.mark_stale_processing_runs_interrupted()

    assert service.get_run_state(run_id)["status"] == "interrupted"


def test_preview_matrix_validation_accepts_four_records_and_ignores_complete_flag():
    matrix = preview_matrix()
    matrix["complete"] = True

    with pytest.raises(service.StickerToolError) as error:
        service.normalize_preview_matrix(matrix)

    assert error.value.code == "PREVIEW_CONTEXT_UNKNOWN"

    normalized = service.normalize_preview_matrix(preview_matrix())
    assert service.preview_matrix_complete(normalized) is True


def test_preview_matrix_validation_blocks_missing_invalid_or_failed_context():
    missing = preview_matrix()
    missing.pop("journey")
    with pytest.raises(service.StickerToolError) as error:
        service.normalize_preview_matrix(missing)
    assert error.value.code == "PREVIEW_CONTEXT_MISSING"

    invalid = preview_matrix()
    invalid["light"]["renderedWidth"] = -1
    with pytest.raises(service.StickerToolError) as error:
        service.normalize_preview_matrix(invalid)
    assert error.value.code == "PREVIEW_CONTEXT_INVALID"

    failed = preview_matrix()
    failed["journey"]["rendered"] = False
    normalized = service.normalize_preview_matrix(failed)
    assert service.preview_matrix_complete(normalized) is False


def test_submit_preview_evidence_accepts_png_and_rejects_invalid_inputs(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
):
    monkeypatch.setattr(service, "PROJECT_ROOT", tmp_path)
    run_id = bridge_id()
    write_state(run_id, ready_state(run_id), monkeypatch, tmp_path)

    response = service.submit_preview_evidence(run_id, [("output-light.png", rgba_png(4, 4))])

    assert response["bridgeRunId"] == run_id
    state = service.get_run_state(run_id)
    assert state["previewEvidence"]["light"]["captured"] is True
    assert (service.run_dir_for_id(run_id) / "preview-evidence" / "output-light.png").is_file()

    with pytest.raises(service.StickerToolError) as error:
        service.submit_preview_evidence(run_id, [("../output-web.png", rgba_png(4, 4))])
    assert error.value.code == "PREVIEW_EVIDENCE_CONTEXT_INVALID"

    with pytest.raises(service.StickerToolError) as error:
        service.submit_preview_evidence(run_id, [("output-web.png", b"<svg></svg>")])
    assert error.value.code == "PREVIEW_EVIDENCE_NOT_PNG"

    blocked_id = bridge_id("c")
    blocked = ready_state(blocked_id)
    blocked["previewMatrix"]["web"]["rendered"] = False
    write_state(blocked_id, blocked, monkeypatch, tmp_path)
    with pytest.raises(service.StickerToolError) as error:
        service.submit_preview_evidence(blocked_id, [("output-web.png", rgba_png(4, 4))])
    assert error.value.code == "PREVIEW_CONTEXT_NOT_RENDERED"


def test_diagnostic_zip_inventory_hashes_and_sanitizes_paths(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    project_root = tmp_path / "project"
    project_root.mkdir()
    monkeypatch.setattr(service, "PROJECT_ROOT", project_root)
    monkeypatch.setattr(service, "git_commit", lambda repo=None: "personalwebcommit")
    monkeypatch.setattr(service, "git_branch", lambda repo: "Feature/test")
    docs_contracts = project_root / "docs" / "contracts"
    docs_contracts.mkdir(parents=True)
    (docs_contracts / "sticker-preprocessor-request-v1.schema.json").write_text("{}", encoding="utf-8")
    run_id = bridge_id()
    use_temp_bridge(monkeypatch, project_root)
    run_dir = service.run_dir_for_id(run_id)
    run_dir.mkdir(parents=True, exist_ok=True)
    input_dir = run_dir / "input"
    input_dir.mkdir()
    (input_dir / "source.png").write_bytes(rgba_png(4, 4))
    output_path = run_dir / "output" / "processed.png"
    output_path.parent.mkdir()
    output_path.write_bytes(rgba_png(4, 4))
    request_path = run_dir / "request.json"
    request_path.write_text(
        json.dumps(
            {
                "input": {
                    "path": r"C:\Users\maoyi\source.png",
                    "safeBasename": "source.png",
                }
            }
        ),
        encoding="utf-8",
    )
    review_path = run_dir / "user-review.json"
    review_path.write_text(json.dumps({"visualVerdict": "accepted", "issueCodes": []}), encoding="utf-8")
    state = ready_state(run_id)
    state["outputRelativePath"] = service.repo_relative(output_path)
    state["requestRelativePath"] = service.repo_relative(request_path)
    state["review"] = {"issueCodes": []}
    state["userVisualVerdict"] = "ACCEPTED"
    state["compatibility"]["overallHandoffVerdict"] = "ACCEPTED_FOR_UPLOAD"
    state["manifest"]["tool"] = {"gitCommit": "providercommit"}
    state["manifest"]["input"] = {"sha256": "inputhash"}
    state["manifest"]["output"].update({"sha256": service.sha256_path(output_path)})
    service.write_run_state(run_dir, state)
    service.submit_preview_evidence(run_id, [("output-light.png", rgba_png(4, 4))])

    zip_path, _name = service.create_integration_bundle(run_id)

    with ZipFile(zip_path, "r") as archive:
        names = archive.namelist()
        assert len(names) == len(set(names))
        manifest = json.loads(archive.read("manifest.json").decode("utf-8"))
        assert "web/request.json" in names
        assert "previews/output-light.png" in names
        assert "previews/output-web.txt" not in names
        assert not any(name.startswith("previews/") and name.endswith(".txt") for name in names)
        assert manifest["previewEvidence"]["light"]["captured"] is True
        assert manifest["previewEvidence"]["web"]["captured"] is False
        assert manifest["previewEvidence"]["web"]["omissionCode"] == "CAPTURE_NOT_SUBMITTED"
        request = json.loads(archive.read("web/request.json").decode("utf-8"))
        assert request["input"]["path"] == "input/source.png"
        for name, expected_hash in manifest["fileInventory"].items():
            assert service.sha256_bytes(archive.read(name)) == expected_hash
        text = b"\n".join(archive.read(name) for name in names).decode("utf-8", errors="ignore")
        assert "C:\\Users\\" not in text
        assert "DATABASE_URL" not in text
