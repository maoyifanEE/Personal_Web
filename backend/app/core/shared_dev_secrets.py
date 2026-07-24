"""Strict parser for shared-development secret files."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


CONTRACT_PATH = Path(__file__).resolve().parents[3] / "config" / "shared-dev-secret-contract.json"


class SharedDevSecretError(ValueError):
    """Raised when a shared-development secret contract is invalid."""


def load_shared_dev_secret_contract(path: Path = CONTRACT_PATH) -> dict[str, Any]:
    """Load the tracked non-secret shared-development secret contract."""

    contract = json.loads(path.read_text(encoding="utf-8"))
    required = set(contract.get("requiredKeys") or [])
    optional = set(contract.get("optionalKeys") or [])
    if not required or not isinstance(contract.get("deprecatedAliases", {}), dict):
        raise SharedDevSecretError("Shared-development secret contract is invalid")
    contract["requiredKeys"] = sorted(required)
    contract["optionalKeys"] = sorted(optional)
    contract["allowedKeys"] = sorted(required | optional)
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
