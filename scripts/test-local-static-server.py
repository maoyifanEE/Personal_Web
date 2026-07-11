"""Regression tests for the local no-cache static server."""

from __future__ import annotations

import socket
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SERVER_SCRIPT = REPO_ROOT / "scripts" / "local_static_server.py"


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def request(url: str, method: str = "GET") -> urllib.response.addinfourl:
    req = urllib.request.Request(url, method=method)
    return urllib.request.urlopen(req, timeout=5)


def wait_for_server(base_url: str) -> None:
    for _ in range(50):
        try:
            with request(base_url):
                return
        except OSError:
            time.sleep(0.1)
    raise AssertionError("local static server did not become ready")


def assert_no_store(response: urllib.response.addinfourl) -> None:
    cache_control = response.headers.get("Cache-Control", "")
    assert "no-store" in cache_control
    assert response.headers.get("Pragma") == "no-cache"
    assert response.headers.get("Expires") == "0"


def main() -> None:
    port = free_port()
    with tempfile.TemporaryDirectory() as tmp:
        fixture_root = Path(tmp) / "site"
        fixture_root.mkdir()
        (fixture_root / "index.html").write_text("<!doctype html><title>ok</title>", encoding="utf-8")
        (fixture_root / "hub.js").write_text("console.log('ok');\n", encoding="utf-8")
        (fixture_root / "styles.css").write_text("body { color: black; }\n", encoding="utf-8")
        (fixture_root / "data.json").write_text('{"ok": true}\n', encoding="utf-8")
        outside_file = Path(tmp) / "outside.txt"
        outside_file.write_text("must not be served", encoding="utf-8")

        process = subprocess.Popen(
            [
                sys.executable,
                str(SERVER_SCRIPT),
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
                "--root",
                str(fixture_root),
            ],
            cwd=REPO_ROOT,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        try:
            base_url = f"http://127.0.0.1:{port}"
            wait_for_server(f"{base_url}/")

            with request(f"{base_url}/") as response:
                assert response.status == 200
                assert "text/html" in response.headers.get("Content-Type", "")
                assert_no_store(response)

            for path, expected_content_type in [
                ("/hub.js", "javascript"),
                ("/styles.css", "text/css"),
                ("/data.json", "application/json"),
            ]:
                with request(f"{base_url}{path}") as response:
                    assert response.status == 200
                    assert expected_content_type in response.headers.get("Content-Type", "")
                    assert_no_store(response)
                with request(f"{base_url}{path}", method="HEAD") as response:
                    assert response.status == 200
                    assert_no_store(response)

            try:
                request(f"{base_url}/../outside.txt")
            except urllib.error.HTTPError as error:
                assert error.code in {403, 404}
            else:
                raise AssertionError("server exposed a file outside the static root")
        finally:
            process.terminate()
            try:
                process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)

    print("LOCAL_STATIC_SERVER_TEST_PASS")


if __name__ == "__main__":
    main()
