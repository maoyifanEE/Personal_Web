"""Static tests for phase-1 public deployment preparation."""

from __future__ import annotations

from datetime import datetime, timezone
import os
from pathlib import Path
import re
import sys

from pydantic import TypeAdapter


ROOT = Path(__file__).resolve().parents[1]
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://deployment:deployment@localhost/deployment")
os.environ.setdefault("SESSION_SECRET", "deployment-test-session-secret")
sys.path.insert(0, str(ROOT / "backend"))

from app.api.routes.homepage import to_canvas_response, to_public_canvas_response  # noqa: E402
from app.schemas.homepage import HomepageCanvasPublicResponse, HomepageCanvasResponse  # noqa: E402


class FakeCanvasState:
    canvas_key = "default"
    schema_version = "sketch-canvas-v1"
    canvas_data = {"stickers": [{"mediaId": 12}]}
    revision = 7
    updated_at = datetime.now(timezone.utc)
    updated_by_user_id = 42


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def test_public_canvas_schema() -> None:
    public_missing = to_public_canvas_response(None).model_dump()
    public_existing = to_public_canvas_response(FakeCanvasState()).model_dump()
    internal_existing = to_canvas_response(FakeCanvasState()).model_dump()

    assert_true("updated_by_user_id" not in public_missing, "missing public canvas leaked updater field")
    assert_true("updated_by_user_id" not in public_existing, "existing public canvas leaked updater field")
    assert_true(internal_existing["updated_by_user_id"] == 42, "internal canvas response lost updater field")

    public_schema = HomepageCanvasPublicResponse.model_json_schema()
    internal_schema = HomepageCanvasResponse.model_json_schema()
    assert_true("updated_by_user_id" not in public_schema["properties"], "public schema contains updater field")
    assert_true("updated_by_user_id" in internal_schema["properties"], "internal schema lost updater field")
    TypeAdapter(HomepageCanvasPublicResponse).validate_python(public_existing)

    route_source = read("backend/app/api/routes/homepage.py")
    assert_true(
        '@router.get("/canvas", response_model=HomepageCanvasPublicResponse)' in route_source,
        "public canvas route does not use public response model",
    )
    assert_true("to_public_canvas_response(state)" in route_source, "public route does not use public converter")
    assert_true("alembic/versions" not in "\\n".join(git_changed_files()), "database migration was added")
    print("PUBLIC_CANVAS_SCHEMA_TEST_PASS")


def git_changed_files() -> list[str]:
    import subprocess

    result = subprocess.run(
        ["git", "diff", "--name-only"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    return [line for line in result.stdout.splitlines() if line]


def test_deployment_templates() -> None:
    nginx = read("deploy/nginx/personal-web-public.conf.example")
    systemd = read("deploy/systemd/personal-web-backend.service.example")
    env = read("deploy/production.env.example")
    remote_check = read("scripts/check-remote-homepage-public.ps1")
    deployment_doc = read("docs/12_HOMEPAGE_REMOTE_PUBLISH_PLAN.md")

    assert_true(
        not re.search(r"location\s+(?:=|~\*?|\^~)?\s*/api/?\s*\{", nginx),
        "nginx template must not proxy broad /api",
    )
    assert_true("location = /api/messages" in nginx, "nginx template must explicitly allow /api/messages")
    assert_true(
        "proxy_pass http://127.0.0.1:8000/api/messages;" in nginx,
        "message proxy must target the exact local backend route",
    )
    message_location = re.search(
        r"location = /api/messages \{(?P<body>[\s\S]*?)\n    location = /api/homepage/canvas",
        nginx,
    )
    assert_true(message_location is not None, "message location block was not found")
    message_location_body = message_location.group("body")
    assert_true("limit_except POST OPTIONS" in message_location_body, "message route must allow only POST/OPTIONS")
    for header in [
        "Host $host",
        "X-Real-IP $remote_addr",
        "X-Forwarded-For $proxy_add_x_forwarded_for",
        "X-Forwarded-Proto $scheme",
        "X-Request-ID $request_id",
    ]:
        assert_true(header in message_location_body, f"message proxy missing header {header}")
    assert_true(
        "location = /api/admin/messages" not in nginx,
        "nginx template must not allowlist admin message routes",
    )
    assert_true(
        "location /apps/messages" not in nginx and "location = /apps/messages" not in nginx,
        "nginx template must not expose messages admin app",
    )
    assert_true("location = /login.html" not in nginx, "nginx template must not expose login.html")
    assert_true("location = /hub.html" not in nginx, "nginx template must not expose hub.html")
    assert_true("proxy_pass http://127.0.0.1:8000$request_uri;" in nginx, "media proxy must target local backend")
    assert_true("location / {" in nginx and "return 404;" in nginx, "nginx template must deny unknown paths")
    assert_true("ProtectSystem=full" in systemd, "systemd template must retain ProtectSystem=full")
    assert_true("--host 127.0.0.1 --port 8000" in systemd, "systemd template must bind Uvicorn locally")
    assert_true(
        "/var/www/personal_web/.local_logs" in systemd,
        "systemd template must allow controlled diagnostics writes",
    )
    assert_true(
        "ReadWritePaths=/var/www " not in systemd,
        "systemd template must not add broad /var/www writable root",
    )
    assert_true("ALLOW_DEV_TOOLS=false" in env, "production env must disable dev tools")
    assert_true("APP_ENV=production" in env, "production env must set APP_ENV")
    assert_true("MESSAGE_RATE_LIMIT_ENABLED=true" in env, "production env must enable message rate limiting")
    assert_true("MESSAGE_RATE_LIMIT_MAX=5" in env, "production env must set message rate limit max")
    assert_true(
        "MESSAGE_RATE_LIMIT_WINDOW_SECONDS=600" in env,
        "production env must set message rate limit window",
    )
    assert_true("<REPLACE_WITH_LONG_RANDOM_SECRET>" in env, "production env must use placeholder secret")
    assert_true("development-only-change-me" not in env, "production env must not use default session secret")
    assert_true("*" not in re.search(r"CORS_ALLOW_ORIGINS=(.*)", env).group(1), "CORS must not use wildcard")
    assert_true(
        "sudo install -d -o personal-web -g personal-web -m 0750" in deployment_doc,
        "deployment docs must include safe directory creation command",
    )
    assert_true(
        "/var/www/personal_web/.local_logs" in deployment_doc,
        "deployment docs must mention diagnostics directory preparation",
    )

    for path in [
        "/",
        "/index.html",
        "/journey.html",
        "/styles.css",
        "/journey.css",
        "/script.js",
        "/journey.js",
        "/auth.js",
        "/debug-logger-core.js",
        "/debug-logger.js",
        "/journey-curve-import-core.js",
        "/assets/icon.svg",
        "/assets/beian/gongan.png",
        "/api/messages",
        "/api/homepage/canvas",
    ]:
        assert_true(path in nginx, f"nginx template missing public dependency {path}")

    for private_route in [
        "login.html",
        "hub.html",
        "debug-log.html",
        "apps/",
        "docs/",
        "scripts/",
        "backend/",
        ".git/",
        ".env",
        "data/uploads/",
        "api/auth/me",
        "api/debug/status",
        "api/messages",
        "api/messages/1",
        "api/admin/messages",
        "api/homepage/media",
        "api/homepage/items",
        "api/homepage/canvas/reset",
        "api/homepage/publish-bundle/export",
        "api/unknown",
    ]:
        assert_true(private_route in remote_check, f"remote verification missing denied route {private_route}")

    assert_true("PUBLIC_POSITIVE_CHECK_PASS" in remote_check, "positive pass marker missing")
    assert_true("PUBLIC_PRIVATE_ROUTE_DENY_CHECK_PASS" in remote_check, "negative pass marker missing")
    assert_true("PUBLIC_DEPLOYMENT_SURFACE_CHECK_PASS" in remote_check, "surface pass marker missing")
    print("SYSTEMD_DIAGNOSTICS_PATH_TEST_PASS")
    print("DEPLOYMENT_TEMPLATE_TEST_PASS")


if __name__ == "__main__":
    test_public_canvas_schema()
    test_deployment_templates()
