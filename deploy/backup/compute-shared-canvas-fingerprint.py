#!/usr/bin/env python3
"""Compute a content-aware shared canvas fingerprint.

Normal mode accepts only temporary backup/restore verification databases, reads
canvas rows through the postgres OS account, and prints only the SHA-256
fingerprint. It never prints raw canvas JSON.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import sys
from typing import Any


POSTGRES_IDENTIFIER_MAX_BYTES = 63
TEMP_DATABASE_RE = re.compile(r"^pw_(?:bk|rs)_v_\d{8}T\d{6}Z_[0-9a-f]{32}$")


def require_temporary_database(name: str) -> str:
    if name in {"personal_web_shared_dev", "personal_web_prod"} or "prod" in name.lower():
        raise ValueError("canvas fingerprint requires a temporary verification database")
    try:
        encoded = name.encode("ascii")
    except UnicodeEncodeError as exc:
        raise ValueError("canvas fingerprint database name must be ASCII") from exc
    if len(encoded) > POSTGRES_IDENTIFIER_MAX_BYTES:
        raise ValueError("canvas fingerprint database name exceeds PostgreSQL identifier length")
    if not TEMP_DATABASE_RE.fullmatch(name):
        raise ValueError("canvas fingerprint database name is not temporary")
    return name


def canonical_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def canonical_canvas_fingerprint(rows: list[dict[str, Any]]) -> str:
    records: list[dict[str, Any]] = []
    for row in sorted(rows, key=lambda item: str(item.get("canvas_key", ""))):
        canvas_data = row.get("canvas_data")
        if isinstance(canvas_data, str):
            canvas_data = json.loads(canvas_data)
        records.append(
            {
                "canvasKey": row.get("canvas_key"),
                "schemaVersion": row.get("schema_version"),
                "revision": row.get("revision"),
                "updatedAt": row.get("updated_at"),
                "canvasData": canvas_data,
            }
        )
    return hashlib.sha256(canonical_json(records).encode("utf-8")).hexdigest()


def fetch_canvas_rows(database: str) -> list[dict[str, Any]]:
    require_temporary_database(database)
    query = """
select coalesce(jsonb_agg(jsonb_build_object(
  'canvas_key', canvas_key,
  'schema_version', schema_version,
  'revision', revision,
  'updated_at', updated_at,
  'canvas_data', canvas_data
) order by canvas_key), '[]'::jsonb)::text
from homepage_canvas_states;
"""
    output = subprocess.check_output(
        [
            "runuser",
            "--user",
            "postgres",
            "--",
            "psql",
            "--dbname",
            database,
            "--tuples-only",
            "--no-align",
            "--set=ON_ERROR_STOP=1",
            "--command",
            query,
        ],
        text=True,
        stderr=subprocess.PIPE,
    ).strip()
    rows = json.loads(output or "[]")
    if not isinstance(rows, list):
        raise ValueError("canvas query did not return a row array")
    return rows


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--database", required=True)
    args = parser.parse_args()
    try:
        fingerprint = canonical_canvas_fingerprint(fetch_canvas_rows(args.database))
    except Exception as exc:
        print(f"[personal-web canvas fingerprint] ERROR: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 1
    print(fingerprint)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
