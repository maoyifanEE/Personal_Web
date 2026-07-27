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

function Get-ErrorCategory {
  param([object]$ErrorValue)

  $text = [string]$ErrorValue
  switch -Regex ($text) {
    "ssh" { return "ssh" }
    "scp" { return "scp" }
    "acl|Set-Acl|Privilege|UnauthorizedAccess" { return "acl" }
    "sha256|hash" { return "hash" }
    "manifest" { return "manifest" }
    "pg_restore|dump" { return "pg_restore" }
    "archive|media" { return "archive" }
    "cleanup|partial" { return "cleanup" }
    default { return "shell" }
  }
}

function Invoke-PullStage {
  param(
    [string]$Id,
    [string]$Name,
    [scriptblock]$ScriptBlock
  )

  Write-BackupLog "stage_start id=$Id name=$Name"
  try {
    $result = & $ScriptBlock
    Write-BackupLog "stage_ok id=$Id name=$Name"
    return $result
  } catch {
    $category = Get-ErrorCategory $_.Exception.Message
    Write-BackupLog ("stage_error id={0} name={1} category={2} error={3}" -f $Id, $Name, $category, $_.Exception.Message)
    throw
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

function Test-CurrentProcessElevated {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-EnabledPrivilege {
  param([string]$PrivilegeName)

  $output = & whoami.exe /priv 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $false
  }
  return [bool]($output | Where-Object { $_ -match [regex]::Escape($PrivilegeName) -and $_ -match "Enabled" })
}

function Assert-ExpectedLocalBackupTarget {
  param(
    [string]$Root,
    [string]$Path,
    [switch]$AllowFile
  )

  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd("\")
  $pathFull = [System.IO.Path]::GetFullPath($Path).TrimEnd("\")
  if ($pathFull -eq $rootFull) {
    return
  }
  Assert-SafeLocalChild -Root $rootFull -Child $pathFull | Out-Null
  $name = Split-Path -Leaf $pathFull
  if ($AllowFile) {
    $parent = Split-Path -Parent $pathFull
    Assert-SafeLocalChild -Root $rootFull -Child $parent | Out-Null
    $parentName = Split-Path -Leaf $parent
    if ($parentName -notmatch "^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}(\.partial-[0-9]+-[A-Za-z0-9]{12})?$") {
      throw "local_backup_parent_name_invalid"
    }
    if ($RequiredFiles -notcontains $name) {
      throw "local_backup_file_name_invalid"
    }
    return
  }
  $parent = Split-Path -Parent $pathFull
  $parentName = Split-Path -Leaf $parent
  if ($parentName -match "^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}(\.partial-[0-9]+-[A-Za-z0-9]{12})?$" -and
      $name -match "^archive-verify-[0-9]+-[0-9a-fA-F]{32}$") {
    return
  }
  if ($name -notmatch "^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}(\.partial-[0-9]+-[A-Za-z0-9]{12})?$") {
    throw "local_backup_child_name_invalid"
  }
}

function Ensure-ExactLocalBackupDacl {
  param(
    [string]$Path,
    [ValidateSet("Directory", "File")]
    [string]$ItemKind = "Directory",
    [string]$Root
  )

  if ($ItemKind -eq "Directory") {
    New-Item -ItemType Directory -Force -Path $Path | Out-Null
  } elseif (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "local_backup_file_missing"
  }
  Assert-ExpectedLocalBackupTarget -Root $Root -Path $Path -AllowFile:($ItemKind -eq "File")
  try {
    Assert-LocalBackupAcl -Path $Path -ItemKind $ItemKind
    Write-BackupLog "acl_already_exact kind=$ItemKind"
    return
  } catch {
    Write-BackupLog "acl_repair_required kind=$ItemKind reason=$($_.Exception.Message)"
  }

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "local_backup_reparse_point_rejected"
  }
  $acl = Get-Acl -LiteralPath $Path
  $ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
  if (@(Get-ExpectedBackupAclSids) -notcontains $ownerSid) {
    throw "local_backup_owner_unexpected"
  }
  $beforeOwner = $acl.Owner
  $acl.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($acl.Access)) {
    [void]$acl.RemoveAccessRuleSpecific($rule)
  }
  $inheritFlags = if ($ItemKind -eq "Directory") {
    [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit"
  } else {
    [System.Security.AccessControl.InheritanceFlags]"None"
  }
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
    [void]$acl.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $acl
  $afterAcl = Get-Acl -LiteralPath $Path
  if ($afterAcl.Owner -ne $beforeOwner) {
    throw "local_backup_owner_changed"
  }
  Assert-LocalBackupAcl -Path $Path -ItemKind $ItemKind
  Write-BackupLog "acl_repaired kind=$ItemKind elevated=$(Test-CurrentProcessElevated) se_security_enabled=$(Test-EnabledPrivilege 'SeSecurityPrivilege')"
}

function Protect-LocalBackupDirectory {
  param(
    [string]$Path,
    [string]$Root
  )

  Ensure-ExactLocalBackupDacl -Path $Path -ItemKind "Directory" -Root $Root
}

function Protect-LocalBackupFile {
  param(
    [string]$Path,
    [string]$Root
  )

  Ensure-ExactLocalBackupDacl -Path $Path -ItemKind "File" -Root $Root
}

function Assert-LocalBackupAcl {
  param(
    [string]$Path,
    [ValidateSet("Directory", "File")]
    [string]$ItemKind = "Directory"
  )

  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "local_backup_reparse_point_rejected"
  }
  $acl = Get-Acl -LiteralPath $Path
  if (-not $acl.AreAccessRulesProtected) {
    throw "local_backup_acl_inheritance_enabled"
  }
  $ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
  $expected = @(Get-ExpectedBackupAclSids | Sort-Object)
  if ($expected -notcontains $ownerSid) {
    throw "local_backup_owner_unexpected"
  }
  $actual = @()
  $expectedRights = [int][System.Security.AccessControl.FileSystemRights]::FullControl
  $expectedInheritanceFlags = if ($ItemKind -eq "Directory") {
    [System.Security.AccessControl.InheritanceFlags]"ContainerInherit,ObjectInherit"
  } else {
    [System.Security.AccessControl.InheritanceFlags]"None"
  }
  $expectedPropagationFlags = [System.Security.AccessControl.PropagationFlags]"None"
  foreach ($rule in $acl.Access) {
    if ($rule.IsInherited) {
      throw "local_backup_acl_inherited_rule"
    }
    if ($rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
      throw "local_backup_acl_non_allow_rule"
    }
    $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
    if ($expected -notcontains $sid) {
      throw "local_backup_acl_unexpected_sid"
    }
    if (($actual | Where-Object { $_ -eq $sid }).Count -gt 0) {
      throw "local_backup_acl_duplicate_sid"
    }
    if ([int]$rule.FileSystemRights -ne $expectedRights) {
      throw "local_backup_acl_unexpected_rights"
    }
    if ($rule.InheritanceFlags -ne $expectedInheritanceFlags -or $rule.PropagationFlags -ne $expectedPropagationFlags) {
      throw "local_backup_acl_unexpected_flags"
    }
    $actual += $sid
  }
  $actual = @($actual | Sort-Object -Unique)
  if (($actual -join "|") -ne ($expected -join "|")) {
    throw "local_backup_acl_unexpected_entries"
  }
}

function Assert-DownloadedBackupAcls {
  param([string]$Directory)

  Assert-LocalBackupAcl -Path $Directory -ItemKind "Directory"
  foreach ($file in $RequiredFiles) {
    Assert-LocalBackupAcl -Path (Join-Path $Directory $file) -ItemKind "File"
  }
}

function Assert-SafeNativeArgument {
  param([string]$Value)

  if ($null -eq $Value -or $Value -match "[`0`r`n]") {
    throw "native_argument_invalid"
  }
}

function ConvertTo-NativeArgument {
  param([string]$Value)

  Assert-SafeNativeArgument $Value
  if ($Value -notmatch '[\s"]') {
    return $Value
  }
  return '"' + ($Value -replace '(\\*)"', '$1$1\"' -replace '(\\+)$', '$1$1') + '"'
}

function Join-NativeArguments {
  param([string[]]$Arguments)

  return (($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join " ")
}

function Normalize-BashScript {
  param([string]$Script)

  $normalized = $Script -replace "`r`n", "`n"
  $normalized = $normalized -replace "`r", "`n"
  return $normalized.TrimEnd("`n") + "`n"
}

function Get-SanitizedStderr {
  param([string]$Value)

  $text = ($Value -replace "`r", "`n") -replace "`n+", " | "
  if ($text.Length -gt 600) {
    return $text.Substring(0, 600)
  }
  return $text
}

function Invoke-TrustedBashScript {
  param([string]$Script)

  $args = @(
    "-F", $SshConfigPath,
    "-o", "BatchMode=yes",
    "-o", "StrictHostKeyChecking=yes",
    "-o", "UserKnownHostsFile=$KnownHostsPath",
    "--",
    $SshAlias,
    "bash",
    "-s",
    "--"
  )
  foreach ($arg in @($SshExe) + $args) {
    Assert-SafeNativeArgument $arg
  }

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $SshExe
  $psi.Arguments = Join-NativeArguments $args
  $psi.UseShellExecute = $false
  $psi.RedirectStandardInput = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $writer = New-Object System.IO.StreamWriter($process.StandardInput.BaseStream, (New-Object System.Text.UTF8Encoding($false)))
  $writer.NewLine = "`n"
  $writer.Write((Normalize-BashScript $Script))
  $writer.Close()
  $process.WaitForExit()
  $stdout = $stdoutTask.Result
  $stderr = $stderrTask.Result
  if ($process.ExitCode -ne 0) {
    Write-BackupLog ("ssh_failed exit={0} stderr={1}" -f $process.ExitCode, (Get-SanitizedStderr $stderr))
    throw ("ssh_failed_exit_{0}" -f $process.ExitCode)
  }
  return ($stdout -split "`r?`n" | Where-Object { $_ -ne "" })
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
python3 - "`$d" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1])
required = {"personal_web_shared_dev.dump", "homepage-media.tar.gz", "manifest.json", "SHA256SUMS", "SUCCESS"}
actual = {entry.name for entry in root.iterdir()}
if actual != required:
    raise SystemExit("backup file set mismatch")
PY
for f in personal_web_shared_dev.dump homepage-media.tar.gz manifest.json SHA256SUMS SUCCESS; do
  p="`$d/`$f"
  test -f "`$p"
  test ! -L "`$p"
  test "`$(stat -c '%U:%G:%a' "`$p")" = 'root:root:600'
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
  $result = Invoke-TrustedBashScript -Script $remote
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

function Invoke-CapturedProcess {
  param(
    [string]$FileName,
    [string[]]$Arguments,
    [string]$Category = "process"
  )

  foreach ($arg in @($FileName) + $Arguments) {
    Assert-SafeNativeArgument $arg
  }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = $FileName
  $psi.Arguments = Join-NativeArguments $Arguments
  $psi.UseShellExecute = $false
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError = $true
  $psi.CreateNoWindow = $true
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $psi
  try {
    [void]$process.Start()
  } catch {
    throw ("{0}_start_failed" -f $Category)
  }
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  return [pscustomobject]@{
    ExitCode = $process.ExitCode
    Stdout = $stdoutTask.Result
    Stderr = $stderrTask.Result
  }
}

function Test-RegularExecutablePath {
  param(
    [string]$Path,
    [string]$ExpectedLeaf
  )

  if (-not [System.IO.Path]::IsPathRooted($Path)) {
    return $false
  }
  $Path = [System.IO.Path]::GetFullPath($Path)
  if ([System.IO.Path]::GetFileName($Path) -ne $ExpectedLeaf) {
    return $false
  }
  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    return $false
  }
  $item = Get-Item -LiteralPath $Path -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    return $false
  }
  return $true
}

function Get-PgRestoreVersionInfo {
  param([string]$Path)

  if (-not (Test-RegularExecutablePath -Path $Path -ExpectedLeaf "pg_restore.exe")) {
    return $null
  }
  $result = Invoke-CapturedProcess -FileName $Path -Arguments @("--version") -Category "pg_restore"
  if ($result.ExitCode -ne 0) {
    return $null
  }
  $output = ($result.Stdout + $result.Stderr).Trim()
  if ($output -notmatch "^pg_restore \(PostgreSQL\) ([0-9]+)(?:\.([0-9]+))?") {
    return $null
  }
  return [pscustomobject]@{
    Path = (Get-Item -LiteralPath $Path).FullName
    Version = $output
    Major = [int]$Matches[1]
    Minor = if ($Matches[2]) { [int]$Matches[2] } else { 0 }
    IsPgAdmin = ($Path -match "\\pgAdmin 4\\")
  }
}

function Add-PgRestoreCandidate {
  param(
    [System.Collections.ArrayList]$Candidates,
    [string]$Path,
    [string]$Source
  )

  if (-not $Path) {
    return
  }
  $info = Get-PgRestoreVersionInfo -Path $Path
  if (-not $info) {
    return
  }
  $full = $info.Path
  if ($Candidates | Where-Object { $_.Path -ieq $full }) {
    return
  }
  [void]$Candidates.Add([pscustomobject]@{
    Path = $full
    Source = $Source
    Version = $info.Version
    Major = $info.Major
    Minor = $info.Minor
    IsPgAdmin = $info.IsPgAdmin
  })
}

function Get-PgRestoreRegistryBaseDirectories {
  if (Get-Variable -Name PgRestoreRegistryBaseDirectoriesForTest -Scope Script -ErrorAction SilentlyContinue) {
    return $script:PgRestoreRegistryBaseDirectoriesForTest
  }
  $roots = @("HKLM:\SOFTWARE\PostgreSQL\Installations", "HKLM:\SOFTWARE\WOW6432Node\PostgreSQL\Installations")
  $dirs = @()
  foreach ($root in $roots) {
    if (Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root -ErrorAction SilentlyContinue | ForEach-Object {
        $props = Get-ItemProperty $_.PSPath
        if ($props.'Base Directory') {
          $dirs += [string]$props.'Base Directory'
        }
      }
    }
  }
  return $dirs
}

function Get-PgRestoreServiceBaseDirectories {
  if (Get-Variable -Name PgRestoreServiceBaseDirectoriesForTest -Scope Script -ErrorAction SilentlyContinue) {
    return $script:PgRestoreServiceBaseDirectoriesForTest
  }
  $dirs = @()
  Get-CimInstance Win32_Service -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -match "postgres|pgsql|PostgreSQL" -or $_.DisplayName -match "PostgreSQL" } |
    ForEach-Object {
      if ($_.PathName -match '^"([^"]+\\pg_ctl\.exe)"') {
        $dirs += (Split-Path -Parent (Split-Path -Parent $Matches[1]))
      }
    }
  return $dirs
}

function Get-StandardPostgreSqlRoots {
  if (Get-Variable -Name PgRestoreStandardRootsForTest -Scope Script -ErrorAction SilentlyContinue) {
    return $script:PgRestoreStandardRootsForTest
  }
  $roots = @()
  if ($env:ProgramFiles) {
    $roots += (Join-Path $env:ProgramFiles "PostgreSQL")
  }
  if (${env:ProgramFiles(x86)}) {
    $roots += (Join-Path ${env:ProgramFiles(x86)} "PostgreSQL")
  }
  return $roots
}

function Get-PgRestorePath {
  $candidates = New-Object System.Collections.ArrayList
  if ($PgRestorePath) {
    Add-PgRestoreCandidate -Candidates $candidates -Path $PgRestorePath -Source "explicit"
    if ($candidates.Count -ne 1) {
      throw "pg_restore_unavailable"
    }
    $script:LastPgRestoreDiscovery = $candidates[0]
    Write-BackupLog ("pg_restore_selected source={0} version={1} path={2}" -f $candidates[0].Source, $candidates[0].Version, $candidates[0].Path)
    return $candidates[0].Path
  }
  $command = Get-Command pg_restore.exe -ErrorAction SilentlyContinue
  if ($command) {
    Add-PgRestoreCandidate -Candidates $candidates -Path $command.Source -Source "PATH"
  }
  $psql = Get-Command psql.exe -ErrorAction SilentlyContinue
  if ($psql) {
    Add-PgRestoreCandidate -Candidates $candidates -Path (Join-Path (Split-Path -Parent $psql.Source) "pg_restore.exe") -Source "psql_sibling"
  }
  foreach ($dir in Get-PgRestoreRegistryBaseDirectories) {
    Add-PgRestoreCandidate -Candidates $candidates -Path (Join-Path $dir "bin\pg_restore.exe") -Source "registry"
  }
  foreach ($dir in Get-PgRestoreServiceBaseDirectories) {
    Add-PgRestoreCandidate -Candidates $candidates -Path (Join-Path $dir "bin\pg_restore.exe") -Source "service"
  }
  foreach ($root in Get-StandardPostgreSqlRoots) {
    if (Test-Path -LiteralPath $root) {
      Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | ForEach-Object {
        Add-PgRestoreCandidate -Candidates $candidates -Path (Join-Path $_.FullName "bin\pg_restore.exe") -Source "program_files"
        Add-PgRestoreCandidate -Candidates $candidates -Path (Join-Path $_.FullName "pgAdmin 4\runtime\pg_restore.exe") -Source "pgadmin_runtime"
      }
    }
  }
  if ($candidates.Count -eq 0) {
    throw "pg_restore_unavailable"
  }
  $ordered = @($candidates) | Sort-Object @{Expression = {$_.IsPgAdmin}; Ascending = $true}, @{Expression = {$_.Major}; Descending = $true}, @{Expression = {$_.Minor}; Descending = $true}, Path
  $selected = $ordered[0]
  if ($ordered.Count -gt 1) {
    $same = @($ordered | Where-Object { $_.IsPgAdmin -eq $selected.IsPgAdmin -and $_.Major -eq $selected.Major -and $_.Minor -eq $selected.Minor })
    $sameSelectedPath = @($same | Where-Object { $_.Path -ieq $selected.Path })
    if ($same.Count -gt 1 -and $sameSelectedPath.Count -ne $same.Count) {
      throw "pg_restore_ambiguous"
    }
  }
  $script:LastPgRestoreDiscovery = $selected
  Write-BackupLog ("pg_restore_selected source={0} version={1} path={2}" -f $selected.Source, $selected.Version, $selected.Path)
  return $selected.Path
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
  $verifier = Join-Path $repoRoot "deploy\backup\verify-shared-media-archive.py"
  if (-not (Test-RegularExecutablePath -Path $python -ExpectedLeaf "python.exe")) {
    throw "python_unavailable"
  }
  if (-not (Test-Path -LiteralPath $verifier -PathType Leaf)) {
    throw "archive_verifier_missing"
  }
  $verifierItem = Get-Item -LiteralPath $verifier -Force
  if (($verifierItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "archive_verifier_reparse_point"
  }
  $trackedVerifier = (git -C $repoRoot ls-files --error-unmatch "deploy/backup/verify-shared-media-archive.py" 2>$null)
  if ($LASTEXITCODE -ne 0 -or -not $trackedVerifier) {
    throw "archive_verifier_untracked"
  }
  $syntax = Invoke-CapturedProcess -FileName $python -Arguments @("-m", "py_compile", $verifier) -Category "archive"
  if ($syntax.ExitCode -ne 0) {
    throw "archive_verifier_syntax_failed"
  }
  $verifyDir = Join-Path $VerificationRoot ("archive-verify-{0}-{1}" -f $PID, ([guid]::NewGuid().ToString("N")))
  try {
    New-Item -ItemType Directory -Path $verifyDir | Out-Null
    Protect-LocalBackupDirectory -Path $verifyDir -Root $LocalBackupRoot
    $verifyItem = Get-Item -LiteralPath $verifyDir -Force
    if (($verifyItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "archive_verify_dir_reparse_point"
    }
    if (Get-ChildItem -LiteralPath $verifyDir -Force) {
      throw "archive_verify_dir_not_empty"
    }
    $result = Invoke-CapturedProcess -FileName $python -Arguments @(
      $verifier,
      "--archive", $ArchivePath,
      "--extract-dir", $verifyDir,
      "--expect-manifest", (Join-Path (Split-Path -Parent $ArchivePath) "manifest.json")
    ) -Category "archive"
    if ($result.ExitCode -ne 0) {
      Write-BackupLog ("archive_verifier_failed exit={0} stderr={1}" -f $result.ExitCode, (Get-SanitizedStderr $result.Stderr))
      throw "media_archive_verification_failed"
    }
    if (Test-Path -LiteralPath $verifyDir) {
      throw "archive_verification_cleanup_incomplete"
    }
  } catch {
    $original = $_
    if (Test-Path -LiteralPath $verifyDir) {
      try {
        Remove-SafeArchiveVerifyDirectory -Root $LocalBackupRoot -VerifyPath $verifyDir
      } catch {
        Write-BackupLog ("cleanup_failed original={0} cleanup={1}" -f $original.Exception.Message, $_.Exception.Message)
      }
    }
    throw $original
  }
}

function Verify-DownloadedBackup {
  param(
    [string]$Directory,
    [string]$SelectedBackupId
  )

  Assert-DownloadedBackupAcls -Directory $Directory
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
    Assert-DownloadedBackupAcls -Directory $ordered[$i].FullName
    Remove-Item -LiteralPath $ordered[$i].FullName -Recurse -Force
  }
}

function Remove-SafePartialDirectory {
  param(
    [string]$Root,
    [string]$PartialPath
  )

  if (-not (Test-Path -LiteralPath $PartialPath)) {
    return
  }
  try {
    Assert-SafeLocalChild -Root $Root -Child $PartialPath | Out-Null
    $name = Split-Path -Leaf $PartialPath
    if ($name -notmatch "^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}\.partial-[0-9]+-[A-Za-z0-9]{12}$") {
      throw "local_partial_name_invalid"
    }
    $item = Get-Item -LiteralPath $PartialPath -Force
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw "local_partial_reparse_point_rejected"
    }
    $ownerSid = (Get-Acl -LiteralPath $PartialPath).GetOwner([System.Security.Principal.SecurityIdentifier]).Value
    $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    if ($ownerSid -ne $currentUserSid) {
      throw "local_partial_owner_unexpected"
    }
    Assert-LocalBackupAcl -Path $PartialPath -ItemKind "Directory"
    Remove-Item -LiteralPath $PartialPath -Recurse -Force
    if (Test-Path -LiteralPath $PartialPath) {
      throw "local_partial_cleanup_failed"
    }
  } catch {
    Write-BackupLog ("partial_preserved path={0} reason={1}" -f $PartialPath, $_.Exception.Message)
    throw
  }
}

function Remove-SafeArchiveVerifyDirectory {
  param(
    [string]$Root,
    [string]$VerifyPath
  )

  if (-not (Test-Path -LiteralPath $VerifyPath)) {
    return
  }
  Assert-SafeLocalChild -Root $Root -Child $VerifyPath | Out-Null
  $name = Split-Path -Leaf $VerifyPath
  $parent = Split-Path -Parent $VerifyPath
  $parentName = Split-Path -Leaf $parent
  if ($name -notmatch "^archive-verify-[0-9]+-[0-9a-fA-F]{32}$" -or
      $parentName -notmatch "^[0-9]{8}T[0-9]{6}Z-[A-Za-z0-9]{8,32}(\.partial-[0-9]+-[A-Za-z0-9]{12})?$") {
    throw "archive_verify_dir_name_invalid"
  }
  $item = Get-Item -LiteralPath $VerifyPath -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw "archive_verify_dir_reparse_point"
  }
  $ownerSid = (Get-Acl -LiteralPath $VerifyPath).GetOwner([System.Security.Principal.SecurityIdentifier]).Value
  $currentUserSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($ownerSid -ne $currentUserSid) {
    throw "archive_verify_dir_owner_unexpected"
  }
  Remove-Item -LiteralPath $VerifyPath -Recurse -Force
  if (Test-Path -LiteralPath $VerifyPath) {
    throw "archive_verify_dir_cleanup_failed"
  }
}

function Invoke-BackupPull {
  $script:repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
  Initialize-BackupLog -RepositoryRoot $script:repoRoot

  if (-not $LocalBackupRoot) {
    $script:LocalBackupRoot = Join-Path $env:USERPROFILE ".personal_web\backups\shared-dev"
  }
  if (-not $SshConfigPath) {
    $script:SshConfigPath = Join-Path $env:USERPROFILE ".ssh\config"
  }
  if (-not $KnownHostsPath) {
    $script:KnownHostsPath = Join-Path $env:USERPROFILE ".ssh\known_hosts"
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

  Invoke-PullStage P01_LOCAL_ROOT local_root {
    Protect-LocalBackupDirectory -Path $LocalBackupRoot -Root $LocalBackupRoot
  } | Out-Null
  $selectedBackupId = Invoke-PullStage P02_SELECT_BACKUP select_backup {
    if ($BackupId) { Assert-SafeBackupId $BackupId; $BackupId } else { Get-LatestServerBackupId }
  }
  $finalDir = Assert-SafeLocalChild -Root $LocalBackupRoot -Child (Join-Path $LocalBackupRoot $selectedBackupId)
  $partialName = "{0}.partial-{1}-{2}" -f $selectedBackupId, $PID, ([guid]::NewGuid().ToString("N").Substring(0, 12))
  $partialDir = Assert-SafeLocalChild -Root $LocalBackupRoot -Child (Join-Path $LocalBackupRoot $partialName)

  if (Test-Path -LiteralPath $finalDir -PathType Container) {
    if (Test-LocalBackupVerified -Directory $finalDir -SelectedBackupId $selectedBackupId) {
      Write-BackupLog "already_current backupId=$selectedBackupId"
      return
    }
    throw "existing_backup_failed_verification"
  }
  if (Test-Path -LiteralPath $partialDir) {
    throw "local_partial_collision"
  }

  $partialCreated = $false
  try {
    Invoke-PullStage P03_REMOTE_VALIDATE remote_validate {
      Invoke-TrustedBashScript -Script (Get-RemoteValidationScript -SelectedBackupId $selectedBackupId) | Out-Null
    } | Out-Null
    Invoke-PullStage P04_PARTIAL_CREATE partial_create {
      New-Item -ItemType Directory -Path $partialDir | Out-Null
      $partialCreated = $true
      Protect-LocalBackupDirectory -Path $partialDir -Root $LocalBackupRoot
    } | Out-Null
    Invoke-PullStage P05_DOWNLOAD download {
      foreach ($file in $RequiredFiles) {
        Invoke-TrustedScp -RemoteFile "$ServerBackupRoot/$selectedBackupId/$file" -LocalFile (Join-Path $partialDir $file)
        Protect-LocalBackupFile -Path (Join-Path $partialDir $file) -Root $LocalBackupRoot
      }
    } | Out-Null
    $manifest = Invoke-PullStage P06_LOCAL_VERIFY local_verify {
      Verify-DownloadedBackup -Directory $partialDir -SelectedBackupId $selectedBackupId
    }
    Invoke-PullStage P07_FINALIZE finalize {
      Move-Item -LiteralPath $partialDir -Destination $finalDir
      Protect-LocalBackupDirectory -Path $finalDir -Root $LocalBackupRoot
      foreach ($file in $RequiredFiles) {
        Protect-LocalBackupFile -Path (Join-Path $finalDir $file) -Root $LocalBackupRoot
      }
      Verify-DownloadedBackup -Directory $finalDir -SelectedBackupId $selectedBackupId | Out-Null
      if (Test-Path -LiteralPath $partialDir) {
        throw "local_partial_remained_after_finalization"
      }
    } | Out-Null
    Invoke-PullStage P08_RETENTION retention {
      Invoke-LocalRetention -Root $LocalBackupRoot
    } | Out-Null
    Write-BackupLog ("downloaded backupId={0} database={1} mediaFiles={2} mediaBytes={3}" -f
      $selectedBackupId,
      $manifest.databaseName,
      $manifest.sourceMediaRegularFileCount,
      $manifest.sourceMediaLogicalBytes
    )
  } catch {
    $original = $_
    if ($partialCreated -or (Test-Path -LiteralPath $partialDir)) {
      try {
        Remove-SafePartialDirectory -Root $LocalBackupRoot -PartialPath $partialDir
      } catch {
        Write-BackupLog ("cleanup_failed original={0} cleanup={1}" -f $original.Exception.Message, $_.Exception.Message)
      }
    }
    throw $original
  }
}

if ($MyInvocation.InvocationName -ne ".") {
  Invoke-BackupPull
}
