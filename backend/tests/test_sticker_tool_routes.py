"""Local-only Sticker_Preprocessor bridge route tests."""

from collections.abc import Generator
from types import SimpleNamespace

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session
from app.core.config import Settings, get_settings
from app.main import app
from app.services import sticker_tool_service


def simple_settings(**overrides) -> SimpleNamespace:
    values = {
        "app_env": "development",
        "allow_dev_tools": True,
        "personal_web_data_profile": "local",
        "session_cookie_name": "personal_web_session",
        "session_expire_days": 7,
        "session_secret": "test-session-secret",
        "cookie_secure": False,
        "csrf_header_name": "X-CSRF-Token",
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def dev_settings(profile: str = "local") -> Settings:
    return Settings(
        APP_ENV="development",
        DATABASE_URL="sqlite+pysqlite:///:memory:",
        ALLOW_DEV_TOOLS=True,
        PERSONAL_WEB_DATA_PROFILE=profile,
    )


def client_with_settings(db_session: Session, settings: Settings | SimpleNamespace, host: str = "127.0.0.1") -> TestClient:
    def override_db_session() -> Generator[Session, None, None]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_db_session
    app.dependency_overrides[get_settings] = lambda: settings
    return TestClient(app, client=(host, 50000))


def login_and_csrf(client: TestClient, username: str, password: str) -> str:
    login_response = client.post("/api/auth/login", json={"usernameOrEmail": username, "password": password})
    assert login_response.status_code == 200
    csrf_response = client.get("/api/auth/csrf")
    assert csrf_response.status_code == 200
    return csrf_response.json()["csrfToken"]


def close_client(client: TestClient) -> None:
    client.close()
    app.dependency_overrides.clear()


def test_sticker_tool_hidden_when_dev_tools_disabled(db_session: Session, monkeypatch):
    called = False

    def fail_if_called(_settings):
        nonlocal called
        called = True
        raise AssertionError("status service should not run when route is hidden")

    monkeypatch.setattr(sticker_tool_service, "status_payload", fail_if_called)
    settings = simple_settings(allow_dev_tools=False)
    client = client_with_settings(db_session, settings)
    try:
        response = client.get("/api/sticker-tool/status")
        assert response.status_code == 404
        assert called is False
    finally:
        close_client(client)


def test_sticker_tool_status_requires_homepage_edit_permission(db_session: Session, normal_user, monkeypatch):
    monkeypatch.setattr(
        sticker_tool_service,
        "status_payload",
        lambda settings: {"schemaVersion": "personal-web-sticker-tool-status-v1", "state": "compatible"},
    )
    client = client_with_settings(db_session, dev_settings())
    try:
        login_and_csrf(client, "user", "userpass")
        response = client.get("/api/sticker-tool/status")
        assert response.status_code == 403
    finally:
        close_client(client)


def test_sticker_tool_status_allows_local_admin_in_shared_remote_profile(db_session: Session, admin_user, monkeypatch):
    monkeypatch.setattr(
        sticker_tool_service,
        "status_payload",
        lambda settings: {
            "schemaVersion": "personal-web-sticker-tool-status-v1",
            "state": "compatible",
            "dataProfile": settings.personal_web_data_profile,
        },
    )
    client = client_with_settings(db_session, simple_settings(personal_web_data_profile="shared_remote"))
    try:
        login_and_csrf(client, "admin", "adminpass")
        response = client.get("/api/sticker-tool/status")
        assert response.status_code == 200
        assert response.json()["dataProfile"] == "shared_remote"
    finally:
        close_client(client)


def test_sticker_tool_rejects_non_loopback_client(db_session: Session, admin_user, monkeypatch):
    monkeypatch.setattr(
        sticker_tool_service,
        "status_payload",
        lambda settings: {"schemaVersion": "personal-web-sticker-tool-status-v1", "state": "compatible"},
    )
    client = client_with_settings(db_session, dev_settings(), host="203.0.113.10")
    try:
        login_and_csrf(client, "admin", "adminpass")
        response = client.get("/api/sticker-tool/status")
        assert response.status_code == 403
    finally:
        close_client(client)


def test_sticker_tool_unsafe_request_requires_csrf(db_session: Session, admin_user, monkeypatch):
    monkeypatch.setattr(sticker_tool_service, "validate_tool_root", lambda path: path)
    monkeypatch.setattr(sticker_tool_service, "get_capabilities", lambda root: {})
    monkeypatch.setattr(
        sticker_tool_service,
        "save_config",
        lambda root, source="user": {"configured": True, "state": "configured"},
    )
    client = client_with_settings(db_session, dev_settings())
    try:
        login_and_csrf(client, "admin", "adminpass")
        response = client.post("/api/sticker-tool/config", json={"toolRoot": "C:/tools/Sticker_Preprocessor"})
        assert response.status_code == 403
    finally:
        close_client(client)


def test_sticker_tool_create_run_returns_accepted_queued_state(db_session: Session, admin_user, monkeypatch):
    run_id = "a" * 32

    def fake_create_bridge_run(content, filename, content_type, options, *, data_profile=None):
        assert content == b"png"
        assert filename == "source.png"
        assert content_type == "image/png"
        assert options["mode"] == "alpha_cleanup"
        assert data_profile == "local"
        return {
            "schemaVersion": "personal-web-sticker-tool-run-v1",
            "bridgeRunId": run_id,
            "toolRunId": None,
            "contractVersion": sticker_tool_service.CONTRACT_VERSION,
            "status": "queued",
            "dataProfile": "local",
            "toolConfigSource": "env",
            "toolPathFingerprint": None,
            "compatibility": {"overallHandoffVerdict": "PROCESSING"},
            "userVisualVerdict": "PENDING",
            "previewMatrix": {},
            "outputUrl": None,
        }

    monkeypatch.setattr(sticker_tool_service, "create_bridge_run", fake_create_bridge_run)
    client = client_with_settings(db_session, dev_settings())
    try:
        csrf = login_and_csrf(client, "admin", "adminpass")
        response = client.post(
            "/api/sticker-tool/runs",
            data={
                "mode": "alpha_cleanup",
                "ai_model": "silueta",
                "alpha_matting": "false",
                "padding_pixels": "2",
                "alpha_crop_threshold": "8",
            },
            files={"file": ("source.png", b"png", "image/png")},
            headers={"X-CSRF-Token": csrf},
        )
        assert response.status_code == 202
        body = response.json()
        assert body["bridgeRunId"] == run_id
        assert body["status"] == "queued"
        assert body["outputUrl"] is None
    finally:
        close_client(client)


def test_sticker_tool_preview_evidence_endpoint_accepts_multipart(db_session: Session, admin_user, monkeypatch):
    run_id = "a" * 32
    captured = {}

    def fake_submit_preview_evidence(bridge_run_id, files):
        captured["bridgeRunId"] = bridge_run_id
        captured["files"] = files
        return {
            "schemaVersion": "personal-web-sticker-tool-run-v1",
            "bridgeRunId": bridge_run_id,
            "status": "ready_for_review",
            "previewMatrix": {},
            "compatibility": {},
            "userVisualVerdict": "PENDING",
            "outputUrl": None,
        }

    monkeypatch.setattr(sticker_tool_service, "submit_preview_evidence", fake_submit_preview_evidence)
    client = client_with_settings(db_session, dev_settings())
    try:
        csrf = login_and_csrf(client, "admin", "adminpass")
        response = client.post(
            f"/api/sticker-tool/runs/{run_id}/preview-evidence",
            files={"files": ("output-light.png", b"\x89PNG\r\n\x1a\nfake", "image/png")},
            headers={"X-CSRF-Token": csrf},
        )
        assert response.status_code == 200
        assert captured["bridgeRunId"] == run_id
        assert captured["files"] == [("output-light.png", b"\x89PNG\r\n\x1a\nfake")]
    finally:
        close_client(client)
