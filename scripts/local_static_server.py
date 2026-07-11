"""Local-only static server with no-store headers for frontend development."""

from __future__ import annotations

import argparse
import functools
import http.server
import logging
import mimetypes
from pathlib import Path
from socketserver import TCPServer


NO_STORE_VALUE = "no-store, no-cache, must-revalidate, max-age=0"
NO_CACHE_SUFFIXES = {".html", ".htm", ".js", ".css", ".json", ".map"}


class LocalStaticRequestHandler(http.server.SimpleHTTPRequestHandler):
    """Serve project files locally while preventing stale source assets."""

    server_version = "PersonalWebLocalStatic/1.0"

    def end_headers(self) -> None:
        if self.should_disable_cache():
            self.send_header("Cache-Control", NO_STORE_VALUE)
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def should_disable_cache(self) -> bool:
        path_without_query = self.path.split("?", 1)[0].split("#", 1)[0]
        suffix = Path(path_without_query).suffix.lower()
        if path_without_query in {"", "/"}:
            return True
        return suffix in NO_CACHE_SUFFIXES

    def log_message(self, format: str, *args: object) -> None:
        logging.info("%s - %s", self.address_string(), format % args)


class ReusableTCPServer(TCPServer):
    """Allow quick local restarts on the same port."""

    allow_reuse_address = True


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Serve Personal_Web local frontend files.")
    parser.add_argument("--host", default="127.0.0.1", help="Local interface to bind.")
    parser.add_argument("--port", default=4173, type=int, help="Local frontend port.")
    parser.add_argument("--root", default=".", help="Project root to serve.")
    return parser.parse_args()


def run_server(host: str, port: int, root: Path) -> None:
    resolved_root = root.resolve()
    if not resolved_root.exists() or not resolved_root.is_dir():
        raise SystemExit(f"Static root is not a directory: {resolved_root}")

    mimetypes.add_type("application/javascript", ".js")
    mimetypes.add_type("text/css", ".css")
    handler = functools.partial(LocalStaticRequestHandler, directory=str(resolved_root))

    logging.basicConfig(level=logging.INFO, format="[Personal_Web frontend] %(message)s")
    logging.info("Serving %s", resolved_root)
    logging.info("Homepage: http://%s:%s/", host, port)
    logging.info("No-store headers enabled for HTML, JavaScript, CSS, JSON, and source maps.")

    with ReusableTCPServer((host, port), handler) as httpd:
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            logging.info("Shutdown requested.")
        finally:
            httpd.server_close()
            logging.info("Server stopped.")


def main() -> None:
    args = parse_args()
    run_server(args.host, args.port, Path(args.root))


if __name__ == "__main__":
    main()
