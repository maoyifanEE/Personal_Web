"""Regression checks for PowerShell source encoding and parser safety."""

from __future__ import annotations

import subprocess
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
PUBLIC_CHECK_SCRIPT = PROJECT_ROOT / "scripts" / "check-remote-homepage-public.ps1"


def test_public_check_script_uses_single_utf8_bom_and_lf_line_endings() -> None:
    data = PUBLIC_CHECK_SCRIPT.read_bytes()

    assert data.startswith(b"\xef\xbb\xbf")
    assert data[3:6] != b"\xef\xbb\xbf"
    assert b"\r" not in data
    assert b"\n" in data

    decoded = data.decode("utf-8-sig")
    assert not decoded.startswith("\ufeff")
    assert "\ufeff" not in decoded
    assert "留言" in decoded
    assert "暂未开放" in decoded
    assert "留言会提交到服务器数据库" in decoded
    assert "管理员登录后可查看" in decoded


def test_tracked_powershell_files_parse_with_windows_powershell() -> None:
    tracked_files = subprocess.run(
        ["git", "ls-files", "*.ps1"],
        cwd=PROJECT_ROOT,
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    ).stdout.splitlines()
    assert tracked_files

    parser_script = r"""
$ErrorActionPreference = "Stop"
$files = @(
%s
)
$failures = @()
foreach ($file in $files) {
  $tokens = $null
  $errors = $null
  [System.Management.Automation.Language.Parser]::ParseFile($file, [ref]$tokens, [ref]$errors) | Out-Null
  foreach ($errorRecord in $errors) {
    $failures += [pscustomobject]@{
      File = $file
      Message = $errorRecord.Message
      Line = $errorRecord.Extent.StartLineNumber
      Column = $errorRecord.Extent.StartColumnNumber
    }
  }
}
if ($failures.Count -gt 0) {
  $failures | ConvertTo-Json -Depth 4
  exit 1
}
Write-Output ("parsed={0}" -f $files.Count)
""" % (
        "\n".join(
            "  " + _quote_powershell_string(str((PROJECT_ROOT / path).resolve()))
            for path in tracked_files
        )
    )

    result = subprocess.run(
        ["powershell.exe", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", parser_script],
        cwd=PROJECT_ROOT,
        check=False,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )

    assert result.returncode == 0, result.stdout + result.stderr
    assert f"parsed={len(tracked_files)}" in result.stdout


def _quote_powershell_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
