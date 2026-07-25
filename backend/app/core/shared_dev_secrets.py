"""Strict parser for shared-development secret files."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


CONTRACT_PATH = Path(__file__).resolve().parents[3] / "config" / "shared-dev-secret-contract.json"
CONTRACT_INVALID = "contract_invalid"


class SharedDevSecretError(ValueError):
    """Raised when a shared-development secret contract is invalid."""


def load_shared_dev_secret_contract(path: Path = CONTRACT_PATH) -> dict[str, Any]:
    """Load the tracked non-secret shared-development secret contract."""

    contract = json.loads(path.read_text(encoding="utf-8"))
    if contract.get("schemaVersion") != 1:
        raise SharedDevSecretError(CONTRACT_INVALID)
    raw_required = contract.get("requiredKeys")
    raw_optional = contract.get("optionalKeys")
    aliases = contract.get("deprecatedAliases", {})
    if not isinstance(raw_required, list) or not isinstance(raw_optional, list) or not isinstance(aliases, dict):
        raise SharedDevSecretError(CONTRACT_INVALID)
    if any(not isinstance(key, str) or not key.strip() for key in raw_required + raw_optional):
        raise SharedDevSecretError(CONTRACT_INVALID)
    required = set(raw_required)
    optional = set(raw_optional)
    if len(required) != len(raw_required) or len(optional) != len(raw_optional):
        raise SharedDevSecretError(CONTRACT_INVALID)
    if required & optional:
        raise SharedDevSecretError(CONTRACT_INVALID)
    allowed = required | optional
    for alias, target in aliases.items():
        if alias not in allowed or target not in allowed or alias == target:
            raise SharedDevSecretError(CONTRACT_INVALID)
    for start in aliases:
        seen: set[str] = set()
        current = start
        while current in aliases:
            if current in seen:
                raise SharedDevSecretError(CONTRACT_INVALID)
            seen.add(current)
            current = aliases[current]
    for key in (
        "expectedDatabaseName",
        "expectedDatabaseUser",
        "expectedDatabaseSshAlias",
        "expectedDatabaseSshUser",
        "expectedMediaSshAlias",
        "expectedMediaSshUser",
        "expectedRemoteMediaRoot",
    ):
        if not isinstance(contract.get(key), str) or not contract[key].strip():
            raise SharedDevSecretError(CONTRACT_INVALID)
    expected = {
        "expectedDatabaseName": "personal_web_shared_dev",
        "expectedDatabaseUser": "personal_web_shared_dev_app",
        "expectedDatabaseSshAlias": "personal-web-shared-db",
        "expectedDatabaseSshUser": "personal-web-db-tunnel",
        "expectedMediaSshAlias": "personal-web-shared-media",
        "expectedMediaSshUser": "personal-web-dev",
        "expectedRemoteMediaRoot": "/srv/personal-web/shared-dev/homepage",
    }
    if any(contract[key] != value for key, value in expected.items()):
        raise SharedDevSecretError(CONTRACT_INVALID)
    contract["requiredKeys"] = sorted(required)
    contract["optionalKeys"] = sorted(optional)
    contract["allowedKeys"] = sorted(allowed)
    return contract


def allowed_shared_dev_secret_keys(contract: dict[str, Any] | None = None) -> frozenset[str]:
    contract = contract or load_shared_dev_secret_contract()
    return frozenset(contract["allowedKeys"])


def required_shared_dev_secret_keys(contract: dict[str, Any] | None = None) -> frozenset[str]:
    contract = contract or load_shared_dev_secret_contract()
    return frozenset(contract["requiredKeys"])


def parse_shared_dev_secret_text(text: str, *, require_all: bool = False) -> dict[str, str]:
    """Parse allowlisted KEY=VALUE text without exposing secret values in errors."""

    contract = load_shared_dev_secret_contract()
    allowed_keys = allowed_shared_dev_secret_keys(contract)
    values: dict[str, str] = {}
    for line_number, raw_line in enumerate(text.splitlines(), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" not in line:
            raise SharedDevSecretError(f"Malformed shared-development secret line {line_number}")
        key, value = raw_line.split("=", 1)
        key = key.strip()
        if not key or any(ch.isspace() for ch in key):
            raise SharedDevSecretError(f"Malformed shared-development secret key on line {line_number}")
        if key not in allowed_keys:
            raise SharedDevSecretError(f"Unknown shared-development secret key on line {line_number}")
        if key in values:
            raise SharedDevSecretError(f"Duplicate shared-development secret key on line {line_number}")
        values[key] = value
    canonicalize_shared_dev_secret_values(values, contract)
    if require_all:
        missing = sorted(required_shared_dev_secret_keys(contract) - values.keys())
        if missing:
            raise SharedDevSecretError("Missing required shared-development secret keys: " + ", ".join(missing))
    return values


def canonicalize_shared_dev_secret_values(values: dict[str, str], contract: dict[str, Any] | None = None) -> None:
    """Resolve deprecated aliases in-place without leaking values."""

    contract = contract or load_shared_dev_secret_contract()
    for alias, canonical in (contract.get("deprecatedAliases") or {}).items():
        if alias not in values:
            continue
        if canonical in values:
            if values[alias] != values[canonical]:
                raise SharedDevSecretError(f"Conflicting shared-development secret aliases: {canonical} and {alias}")
        else:
            values[canonical] = values[alias]


def parse_shared_dev_secret_file(path: Path, *, require_all: bool = True) -> dict[str, str]:
    """Read and parse a shared-development secret file without logging its contents."""

    return parse_shared_dev_secret_text(path.read_text(encoding="utf-8"), require_all=require_all)
