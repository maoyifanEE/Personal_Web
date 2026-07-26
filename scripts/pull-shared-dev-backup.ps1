param(
  [string]$BackupId = "",
  [string]$LocalBackupRoot = "",
  [string]$SshAlias = "personal-web-prod",
  [string]$SshConfigPath = "",
  [string]$KnownHostsPath = "",
  [string]$SshExe = "ssh.exe",
  [string]$ScpExe = "scp.exe",
  [string]$PgRestorePath = ""
)

$ErrorActionPreference = "Stop"

$ServerBackupRoot = "/var/backups/personal-web/shared-dev"
$ExpectedDatabaseName = "personal_web_shared_dev"
$ExpectedSchemaVersion = 1
$ExpectedAlembicRevision = "20260712_0006"
$KeepLocalBackups = 7
$RequiredFiles = @(
  "personal_web_shared_dev.dump",
  "homepage-media.tar.gz",
  "manifest.json",
  "SHA256SUMS",
  "SUCCESS"
)
$HashedFiles = @("personal_web_shared_dev.dump", "homepage-media.tar.gz", "manifest.json")

function Write-BackupLog {
  param([string]$Message)

  $line = "[Personal_Web backup pull] $Message"
  Write-Host $line
  if ($script:BackupLogPath) {
    Add-Content -LiteralPath $script:BackupLogPath -Value $line -Encoding utf8
  }
}

function Initialize-BackupLog {
  param([string]$RepositoryRoot)

  $logDir = Join-Path $RepositoryRoot ".local_logs\backup"
  New-Item -ItemType Directory -Force -Path $logDir | Out-Null
  Get-ChildItem -LiteralPath $logDir -Filter "pull-shared-dev-backup-*.log" -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddDays(-7) } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  $script:BackupLogPath = Join-Path $logDir ("pull-shared-dev-backup-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType File -Path $script:BackupLogPath -Force | Out-Null
}

function Assert-SafeBackupId {
  param([string]$Value)

  if ($Value -notmatch "^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$") {
    throw "backup_id_invalid"
  }
}

function Assert-SafeLocalChild {
  param(
    [string]$Root,
    [string]$Child
  )

  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd("\")
  $childFull = [System.IO.Path]::GetFullPath($Child)
  if (-not $childFull.StartsWith($rootFull + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "local_path_escaped_backup_root"
  }
  return $childFull
}

function Get-ExpectedBackupAclSids {
  $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  return @($currentUserSid, "S-1-5-18", "S-1-5-32-544")
}

function Protect-LocalBackupDirectory {
  param([string]$Path)

  New-Item -ItemType Directory -Force -Path $Path | Out-Null
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $inheritFlags = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit"
  $propagationFlags = [System.Security.AccessControl.PropagationFlags]"None"
  $fullControl = [System.Security.AccessControl.FileSystemRights]"FullControl"
  foreach ($sidValue in Get-ExpectedBackupAclSids) {
    $sid = New-Object System.Security.Principal.SecurityIdentifier($sidValue)
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $sid,
      $fullControl,
      $inheritFlags,
      $propagationFlags,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
    $acl.AddAccessRule($rule)
  }
  $acl.SetAccessRuleProtection($true, $false)
  Set-Acl -LiteralPath $Path -AclObject $acl
  Assert-LocalBackupAcl -Path $Path
}

function Assert-LocalBackupAcl {
  param([string]$Path)

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "local_backup_reparse_point_rejected"
  }
  $acl = Get-Acl -LiteralPath $Path
  if (-not $acl.AreAccessRulesProtected) {
    throw "local_backup_acl_inheritance_enabled"
  }
  $expected = @(Get-ExpectedBackupAclSids | Sort-Object)
  $actual = @()
  foreach ($rule in $acl.Access) {
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
      continue
    }
    $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
    if (($rule.FileSystemRights -band [System.Security.AccessControl.FileSystemRights]::FullControl) -ne 0) {
      $actual += $sid
    }
  }
  $actual = @($actual | Sort-Object -Unique)
  if (($actual -join "|") -ne ($expected -join "|")) {
    throw "local_backup_acl_unexpected_entries"
  }
}

function Invoke-TrustedSsh {
  param([string]$RemoteCommand)

  $args = @(
    "-F", $SshConfigPath,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "UserKnownHostsFile=$KnownHostsPath",
    "--",
    $SshAlias,
    $RemoteCommand
  )
  & $SshExe @args
  if ($LASTEXITCODE -ne 0) {
    throw "ssh_command_failed"
  }
}

function Invoke-TrustedScp {
  param(
    [string]$RemoteFile,
    [string]$LocalFile
  )

  $remoteSpec = ("{0}:{1}" -f $SshAlias, $RemoteFile)
  $args = @(
    "-F", $SshConfigPath,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "UserKnownHostsFile=$KnownHostsPath",
    "--",
    $remoteSpec,
    $LocalFile
  )
  & $ScpExe @args
  if ($LASTEXITCODE -ne 0) {
    throw "scp_download_failed"
  }
}

function Get-RemoteValidationScript {
  param([string]$SelectedBackupId)

  @"
set -euo pipefail
root='$ServerBackupRoot'
backup_id='$SelectedBackupId'
case "`$backup_id" in
  *[!A-Za-z0-9TZ-]*|""|*.partial*) exit 11 ;;
esac
d="`$root/`$backup_id"
test -d "`$d"
test ! -L "`$d"
test "`$(stat -c '%U:%G:%a:%F' "`$d")" = 'root:root:700:directory'
expected='SHA256SUMS
SUCCESS
homepage-media.tar.gz
manifest.json
personal_web_shared_dev.dump'
actual="`$(find "`$d" -mindepth 1 -maxdepth 1 -printf '%f\n' | sort)"
test "`$actual" = "`$expected"
for f in personal_web_shared_dev.dump homepage-media.tar.gz manifest.json SHA256SUMS SUCCESS; do
  p="`$d/`$f"
  test -f "`$p"
  test ! -L "`$p"
  test "`$(stat -c '%U:%G:%a:%F' "`$p")" = 'root:root:600:regular file'
done
awk '{print `$2}' "`$d/SHA256SUMS" | sort | diff -u - <(printf '%s\n' homepage-media.tar.gz manifest.json personal_web_shared_dev.dump | sort)
/opt/personal-web/deploy/backup/verify-shared-dev-backup.sh "`$backup_id" >/dev/null
printf '%s\n' verified
"@
}

function Get-LatestServerBackupId {
  $remote = @"
set -euo pipefail
root='$ServerBackupRoot'
find "`$root" -mindepth 1 -maxdepth 1 -type d -regextype posix-extended -regex '.*/[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}' -exec test -f '{}/SUCCESS' ';' -printf '%f\n' | sort | tail -n 1
"@
  $result = Invoke-TrustedSsh -RemoteCommand $remote
  $selected = ($result | Where-Object { $_ } | Select-Object -Last 1)
  if (-not $selected) {
    throw "no_successful_server_backup"
  }
  Assert-SafeBackupId $selected
  return $selected
}

function Read-Sha256Sums {
  param([string]$Path)

  $result = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if (-not $line.Trim()) {
      continue
    }
    if ($line -notmatch "^([0-9a-fA-F]{64})  ([A-Za-z0-9_.-]+)$") {
      throw "sha256sums_invalid"
    }
    $fileName = $Matches[2]
    if ($HashedFiles -notcontains $fileName) {
      throw "sha256sums_unexpected_file"
    }
    if ($result.ContainsKey($fileName)) {
      throw "sha256sums_duplicate_file"
    }
    $result[$fileName] = $Matches[1].ToLowerInvariant()
  }
  foreach ($file in $HashedFiles) {
    if (-not $result.ContainsKey($file)) {
      throw "sha256sums_missing_file"
    }
  }
  return $result
}

function Get-PgRestorePath {
  if ($PgRestorePath) {
    if (-not (Test-Path -LiteralPath $PgRestorePath -PathType Leaf)) {
      throw "pg_restore_unavailable"
    }
    return $PgRestorePath
  }
  $candidate = Get-Command pg_restore.exe -ErrorAction SilentlyContinue
  if ($candidate) {
    return $candidate.Source
  }
  $roots = @(
    Join-Path $env:ProgramFiles "PostgreSQL",
    Join-Path ${env:ProgramFiles(x86)} "PostgreSQL"
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }
  foreach ($root in $roots) {
    $found = Get-ChildItem -LiteralPath $root -Recurse -Filter "pg_restore.exe" -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      Select-Object -First 1
    if ($found) {
      return $found.FullName
    }
  }
  throw "pg_restore_unavailable"
}

function Test-MediaArchiveContent {
  param(
    [string]$ArchivePath,
    [object]$Manifest,
    [string]$VerificationRoot
  )

  $python = Join-Path $repoRoot "backend\.venv\Scripts\python.exe"
  if (-not (Test-Path -LiteralPath $python -PathType Leaf)) {
    throw "python_unavailable"
  }
  $script = @'
import hashlib
import json
import shutil
import sys
import tarfile
from pathlib import Path, PurePosixPath

archive = Path(sys.argv[1])
verify_root = Path(sys.argv[2])
expected_count = int(sys.argv[3])
expected_bytes = int(sys.argv[4])
expected_fingerprint = sys.argv[5]

def safe_name(name):
    value = name.replace("\\", "/").strip("/")
    pure = PurePosixPath(value)
    if not value or name.startswith("/") or ":" in value or any(part in {"", ".", ".."} for part in pure.parts):
        raise SystemExit("unsafe_tar_path")
    return pure.as_posix()

if verify_root.exists():
    if any(verify_root.iterdir()):
        raise SystemExit("verify_root_not_empty")
else:
    verify_root.mkdir(parents=True)

try:
    with tarfile.open(archive, "r:gz") as tar:
        members = tar.getmembers()
        for member in members:
            member.name = safe_name(member.name)
            if member.isdir():
                continue
            if not member.isfile():
                raise SystemExit("unsafe_tar_member")
        for member in members:
            if not member.isfile():
                continue
            target = (verify_root / member.name).resolve()
            if verify_root.resolve() not in [target.parent, *target.parents]:
                raise SystemExit("tar_extract_escape")
            target.parent.mkdir(parents=True, exist_ok=True)
            source = tar.extractfile(member)
            if source is None:
                raise SystemExit("tar_member_unreadable")
            with source, target.open("wb") as output:
                shutil.copyfileobj(source, output)
    entries = []
    for path in sorted(verify_root.rglob("*")):
        if path.is_symlink() or not path.is_file():
            raise SystemExit("unsafe_extracted_file")
        data = path.read_bytes()
        entries.append({"path": path.relative_to(verify_root).as_posix(), "size": len(data), "sha256": hashlib.sha256(data).hexdigest()})
    fingerprint = hashlib.sha256(json.dumps(entries, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    if len(entries) != expected_count:
        raise SystemExit("media_count_mismatch")
    if sum(item["size"] for item in entries) != expected_bytes:
        raise SystemExit("media_bytes_mismatch")
    if fingerprint != expected_fingerprint:
        raise SystemExit("media_fingerprint_mismatch")
finally:
    shutil.rmtree(verify_root, ignore_errors=True)
if verify_root.exists():
    raise SystemExit("verify_cleanup_failed")
'@
  $verifyDir = Join-Path $VerificationRoot ("archive-verify-{0}-{1}" -f $PID, ([guid]::NewGuid().ToString("N")))
  $script | & $python - $ArchivePath $verifyDir $Manifest.sourceMediaRegularFileCount $Manifest.sourceMediaLogicalBytes $Manifest.sourceMediaTreeFingerprint
  if ($LASTEXITCODE -ne 0) {
    throw "media_archive_verification_failed"
  }
}

function Verify-DownloadedBackup {
  param(
    [string]$Directory,
    [string]$SelectedBackupId
  )

  Assert-LocalBackupAcl -Path $Directory
  $names = @(Get-ChildItem -LiteralPath $Directory -Force | Select-Object -ExpandProperty Name | Sort-Object)
  if (($names -join "|") -ne (($RequiredFiles | Sort-Object) -join "|")) {
    throw "local_backup_file_set_mismatch"
  }
  $manifestPath = Join-Path $Directory "manifest.json"
  $sumsPath = Join-Path $Directory "SHA256SUMS"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ([int]$manifest.schemaVersion -ne $ExpectedSchemaVersion) {
    throw "manifest_schema_invalid"
  }
  if ([string]$manifest.backupId -ne $SelectedBackupId) {
    throw "manifest_backup_id_mismatch"
  }
  if ([string]$manifest.databaseName -ne $ExpectedDatabaseName) {
    throw "manifest_database_invalid"
  }
  if ([string]$manifest.alembicRevision -ne $ExpectedAlembicRevision) {
    throw "manifest_alembic_invalid"
  }
  if (-not [string]$manifest.canvasFingerprint) {
    throw "manifest_canvas_fingerprint_missing"
  }
  if ([string]$manifest.sourceMediaRoot -ne "/srv/personal-web/shared-dev/homepage") {
    throw "manifest_media_root_invalid"
  }
  if (-not [bool]$manifest.verification.ok) {
    throw "manifest_verification_failed"
  }
  $sums = Read-Sha256Sums -Path $sumsPath
  foreach ($file in $HashedFiles) {
    $path = Join-Path $Directory $file
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLowerInvariant()
    if ($actual -ne $sums[$file]) {
      throw "sha256_mismatch"
    }
  }
  if ([string]$manifest.databaseDump.filename -ne "personal_web_shared_dev.dump" -or
      [int64]$manifest.databaseDump.size -ne (Get-Item -LiteralPath (Join-Path $Directory "personal_web_shared_dev.dump")).Length -or
      [string]$manifest.databaseDump.sha256 -ne $sums["personal_web_shared_dev.dump"]) {
    throw "manifest_dump_cross_check_failed"
  }
  if ([string]$manifest.mediaArchive.filename -ne "homepage-media.tar.gz" -or
      [int64]$manifest.mediaArchive.size -ne (Get-Item -LiteralPath (Join-Path $Directory "homepage-media.tar.gz")).Length -or
      [string]$manifest.mediaArchive.sha256 -ne $sums["homepage-media.tar.gz"]) {
    throw "manifest_archive_cross_check_failed"
  }
  if ($sums["manifest.json"] -ne (Get-FileHash -Algorithm SHA256 -LiteralPath $manifestPath).Hash.ToLowerInvariant()) {
    throw "manifest_hash_cross_check_failed"
  }
  $pgRestore = Get-PgRestorePath
  & $pgRestore --list (Join-Path $Directory "personal_web_shared_dev.dump") | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "dump_unreadable"
  }
  Test-MediaArchiveContent -ArchivePath (Join-Path $Directory "homepage-media.tar.gz") -Manifest $manifest -VerificationRoot $Directory
  return $manifest
}

function Test-LocalBackupVerified {
  param(
    [string]$Directory,
    [string]$SelectedBackupId
  )

  try {
    Verify-DownloadedBackup -Directory $Directory -SelectedBackupId $SelectedBackupId | Out-Null
    return $true
  } catch {
    return $false
  }
}

function Invoke-LocalRetention {
  param([string]$Root)

  $verified = @()
  Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$" } |
    ForEach-Object {
      if (Test-LocalBackupVerified -Directory $_.FullName -SelectedBackupId $_.Name) {
        $verified += $_
      }
    }
  $ordered = $verified | Sort-Object Name
  if ($ordered.Count -le $KeepLocalBackups) {
    return
  }
  $deleteCount = $ordered.Count - $KeepLocalBackups
  for ($i = 0; $i -lt $deleteCount; $i += 1) {
    if ($ordered[$i].Name -eq $ordered[-1].Name) {
      continue
    }
    Assert-SafeLocalChild -Root $Root -Child $ordered[$i].FullName | Out-Null
    Assert-LocalBackupAcl -Path $ordered[$i].FullName
    Remove-Item -LiteralPath $ordered[$i].FullName -Recurse -Force
  }
}

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
Initialize-BackupLog -RepositoryRoot $repoRoot

if (-not $LocalBackupRoot) {
  $LocalBackupRoot = Join-Path $env:USERPROFILE ".personal_web\backups\shared-dev"
}
if (-not $SshConfigPath) {
  $SshConfigPath = Join-Path $env:USERPROFILE ".ssh\config"
}
if (-not $KnownHostsPath) {
  $KnownHostsPath = Join-Path $env:USERPROFILE ".ssh\known_hosts"
}
if ($SshAlias -ne "personal-web-prod") {
  throw "ssh_alias_invalid"
}
if (-not (Test-Path -LiteralPath $SshConfigPath -PathType Leaf)) {
  throw "ssh_config_missing"
}
if (-not (Test-Path -LiteralPath $KnownHostsPath -PathType Leaf)) {
  throw "known_hosts_missing"
}

Protect-LocalBackupDirectory -Path $LocalBackupRoot
$selectedBackupId = if ($BackupId) { Assert-SafeBackupId $BackupId; $BackupId } else { Get-LatestServerBackupId }
$finalDir = Assert-SafeLocalChild -Root $LocalBackupRoot -Child (Join-Path $LocalBackupRoot $selectedBackupId)
$partialName = "{0}.partial-{1}-{2}" -f $selectedBackupId, $PID, ([guid]::NewGuid().ToString("N").Substring(0, 12))
$partialDir = Assert-SafeLocalChild -Root $LocalBackupRoot -Child (Join-Path $LocalBackupRoot $partialName)

if (Test-Path -LiteralPath $finalDir -PathType Container) {
  if (Test-LocalBackupVerified -Directory $finalDir -SelectedBackupId $selectedBackupId) {
    Write-BackupLog "already_current backupId=$selectedBackupId"
    exit 0
  }
  throw "existing_backup_failed_verification"
}
if (Test-Path -LiteralPath $partialDir) {
  throw "local_partial_collision"
}
New-Item -ItemType Directory -Path $partialDir | Out-Null
Protect-LocalBackupDirectory -Path $partialDir

Invoke-TrustedSsh -RemoteCommand (Get-RemoteValidationScript -SelectedBackupId $selectedBackupId) | Out-Null

foreach ($file in $RequiredFiles) {
  Invoke-TrustedScp -RemoteFile "$ServerBackupRoot/$selectedBackupId/$file" -LocalFile (Join-Path $partialDir $file)
}

$manifest = Verify-DownloadedBackup -Directory $partialDir -SelectedBackupId $selectedBackupId
Move-Item -LiteralPath $partialDir -Destination $finalDir
Protect-LocalBackupDirectory -Path $finalDir
Invoke-LocalRetention -Root $LocalBackupRoot
Write-BackupLog ("downloaded backupId={0} database={1} mediaFiles={2} mediaBytes={3}" -f
  $selectedBackupId,
  $manifest.databaseName,
  $manifest.sourceMediaRegularFileCount,
  $manifest.sourceMediaLogicalBytes
)
