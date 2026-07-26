param(
  [string]$BackupId = "",
  [string]$LocalBackupRoot = "",
  [string]$SshAlias = "personal-web-prod",
  [string]$SshConfigPath = "",
  [string]$KnownHostsPath = ""
)

$ErrorActionPreference = "Stop"

$ServerBackupRoot = "/var/backups/personal-web/shared-dev"
$ExpectedDatabaseName = "personal_web_shared_dev"
$ExpectedSchemaVersion = 1
$KeepLocalBackups = 7
$RequiredFiles = @(
  "personal_web_shared_dev.dump",
  "homepage-media.tar.gz",
  "manifest.json",
  "SHA256SUMS",
  "SUCCESS"
)

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

function Protect-LocalBackupRoot {
  param([string]$Path)

  New-Item -ItemType Directory -Force -Path $Path | Out-Null
  $acl = New-Object System.Security.AccessControl.DirectorySecurity
  $currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  $inheritFlags = [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit"
  $propagationFlags = [System.Security.AccessControl.PropagationFlags]"None"
  $fullControl = [System.Security.AccessControl.FileSystemRights]"FullControl"
  foreach ($identity in @($currentUser, "SYSTEM", "Administrators")) {
    $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
      $identity,
      $fullControl,
      $inheritFlags,
      $propagationFlags,
      [System.Security.AccessControl.AccessControlType]::Allow
    )
    $acl.AddAccessRule($rule)
  }
  $acl.SetAccessRuleProtection($true, $false)
  Set-Acl -LiteralPath $Path -AclObject $acl
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
  & ssh.exe @args
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
  & scp.exe @args
  if ($LASTEXITCODE -ne 0) {
    throw "scp_download_failed"
  }
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

function Test-LocalBackupVerified {
  param([string]$Directory)

  foreach ($file in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath (Join-Path $Directory $file) -PathType Leaf)) {
      return $false
    }
  }
  try {
    Verify-DownloadedBackup -Directory $Directory | Out-Null
    return $true
  } catch {
    return $false
  }
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
    $result[$Matches[2]] = $Matches[1].ToLowerInvariant()
  }
  return $result
}

function Get-PgRestorePath {
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

function Test-TarArchivePaths {
  param(
    [string]$ArchivePath,
    [object]$Manifest
  )

  $listing = & tar.exe -tzf $ArchivePath
  if ($LASTEXITCODE -ne 0) {
    throw "media_archive_unreadable"
  }
  $safeFiles = @()
  foreach ($entry in $listing) {
    if (-not $entry) {
      continue
    }
    $normalized = $entry.Replace("\", "/")
    if ($normalized.StartsWith("/") -or $normalized -match "(^|/)\.\.($|/)") {
      throw "media_archive_unsafe_path"
    }
    if (-not $normalized.EndsWith("/")) {
      $safeFiles += $normalized
    }
  }
  if ($safeFiles.Count -ne [int]$Manifest.sourceMediaRegularFileCount) {
    throw "media_archive_file_count_mismatch"
  }
}

function Verify-DownloadedBackup {
  param([string]$Directory)

  $manifestPath = Join-Path $Directory "manifest.json"
  $sumsPath = Join-Path $Directory "SHA256SUMS"
  $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
  if ([int]$manifest.schemaVersion -ne $ExpectedSchemaVersion) {
    throw "manifest_schema_invalid"
  }
  if ([string]$manifest.databaseName -ne $ExpectedDatabaseName) {
    throw "manifest_database_invalid"
  }
  if ([string]$manifest.sourceMediaRoot -ne "/srv/personal-web/shared-dev/homepage") {
    throw "manifest_media_root_invalid"
  }
  if (-not [bool]$manifest.verification.ok) {
    throw "manifest_verification_failed"
  }
  $sums = Read-Sha256Sums -Path $sumsPath
  foreach ($file in @("personal_web_shared_dev.dump", "homepage-media.tar.gz", "manifest.json")) {
    if (-not $sums.ContainsKey($file)) {
      throw "sha256sums_missing_file"
    }
    $actual = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Directory $file)).Hash.ToLowerInvariant()
    if ($actual -ne $sums[$file]) {
      throw "sha256_mismatch"
    }
  }
  $dump = Join-Path $Directory "personal_web_shared_dev.dump"
  $pgRestore = Get-PgRestorePath
  & $pgRestore --list $dump | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "dump_unreadable"
  }
  Test-TarArchivePaths -ArchivePath (Join-Path $Directory "homepage-media.tar.gz") -Manifest $manifest
  $archiveHash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $Directory "homepage-media.tar.gz")).Hash.ToLowerInvariant()
  if ($archiveHash -ne [string]$manifest.mediaArchive.sha256) {
    throw "manifest_archive_hash_mismatch"
  }
  return $manifest
}

function Invoke-LocalRetention {
  param([string]$Root)

  $verified = @()
  Get-ChildItem -LiteralPath $Root -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}$" } |
    ForEach-Object {
      if (Test-LocalBackupVerified -Directory $_.FullName) {
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

Protect-LocalBackupRoot -Path $LocalBackupRoot
$selectedBackupId = if ($BackupId) { Assert-SafeBackupId $BackupId; $BackupId } else { Get-LatestServerBackupId }
$finalDir = Join-Path $LocalBackupRoot $selectedBackupId
$partialDir = Join-Path $LocalBackupRoot ("{0}.partial" -f $selectedBackupId)

if (Test-Path -LiteralPath $finalDir -PathType Container) {
  if (Test-LocalBackupVerified -Directory $finalDir) {
    Write-BackupLog "already_current backupId=$selectedBackupId"
    exit 0
  }
  throw "existing_backup_failed_verification"
}

if (Test-Path -LiteralPath $partialDir) {
  Remove-Item -LiteralPath $partialDir -Recurse -Force
}
New-Item -ItemType Directory -Path $partialDir | Out-Null
Protect-LocalBackupRoot -Path $partialDir

$remoteVerify = "set -euo pipefail; d='$ServerBackupRoot/$selectedBackupId'; test -d `"`$d`"; test -f `"`$d/SUCCESS`"; test `"$(stat -c '%U:%a' `"`$d`")`" = 'root:700'; printf '%s\n' verified"
Invoke-TrustedSsh -RemoteCommand $remoteVerify | Out-Null

foreach ($file in $RequiredFiles) {
  Invoke-TrustedScp -RemoteFile "$ServerBackupRoot/$selectedBackupId/$file" -LocalFile (Join-Path $partialDir $file)
}

$manifest = Verify-DownloadedBackup -Directory $partialDir
Move-Item -LiteralPath $partialDir -Destination $finalDir
Protect-LocalBackupRoot -Path $finalDir
Invoke-LocalRetention -Root $LocalBackupRoot
Write-BackupLog ("downloaded backupId={0} database={1} mediaFiles={2} mediaBytes={3}" -f
  $selectedBackupId,
  $manifest.databaseName,
  $manifest.sourceMediaRegularFileCount,
  $manifest.sourceMediaLogicalBytes
)
