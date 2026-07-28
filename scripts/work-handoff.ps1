param(
  [ValidateSet("Ui", "Status", "EndAndHandoff", "SyncAndStart")]
  [string]$Action = "Ui",
  [switch]$KeepSession,
  [switch]$TestMode,
  [string]$GitExe = "git",
  [string]$RepositoryRoot,
  [string]$LogRoot,
  [string]$FakeLauncher,
  [switch]$SuppressUi,
  [switch]$AssumeSaved,
  [switch]$InternalConfirmedSaved,
  [string]$TestMutexName,
  [string]$TestUiMutexName,
  [int]$TestPauseBeforeMetadataPushSeconds = 0,
  [string]$TestInvokeUiChildAction,
  [string]$TestChildExitCode,
  [switch]$TestUiCancelConfirmation,
  [switch]$TestPortInspectionFailure,
  [string]$TestNetstatOutput,
  [string]$TestQuoteArgumentsJson,
  [string]$TestQuoteArgumentsBase64,
  [string]$TestChildObservationPath
)

$ErrorActionPreference = "Stop"
$script:LogPath = $null
$script:RepoRoot = $null
$metadataBranch = "meta/work-handoff"
$metadataFile = "active-work.json"
$expectedRepository = "maoyifanEE/Personal_Web"
$forbiddenBranch = "meta/work-handoff"
$textSyncAndStart = "同步并开始工作"
$textEndAndHandoff = "结束工作并交接"
$textKeepSession = "保留当前登录状态"
$textHandoffSuccess = "工作已交接"
$textBranch = "分支"
$textUnpushed = "当前分支或 commit 尚未完整推送，交接已停止。"
$handoffStages = @{
  LocalPreflight = "H01_LOCAL_PREFLIGHT"
  Fetch = "H02_FETCH"
  ReadHandoff = "H03_READ_HANDOFF"
  BranchValidate = "H04_BRANCH_VALIDATE"
  BranchSwitch = "H05_BRANCH_SWITCH"
  FastForward = "H06_FAST_FORWARD"
  HeadVerify = "H07_HEAD_VERIFY"
  SharedStart = "H08_SHARED_START"
  HandoffBuild = "H09_HANDOFF_BUILD"
  HandoffPush = "H10_HANDOFF_PUSH"
  HandoffReadback = "H11_HANDOFF_READBACK"
}

function ConvertTo-HandoffLogMessage {
  param([string]$Message)
  if (-not $Message) { return "" }
  $safe = $Message
  foreach ($root in @($script:RepoRoot, $env:USERPROFILE) | Where-Object { $_ }) {
    $safe = [regex]::Replace($safe, [regex]::Escape($root), "<path>", "IgnoreCase")
    $safe = [regex]::Replace($safe, [regex]::Escape($root.Replace("\", "/")), "<path>", "IgnoreCase")
  }
  $safe = [regex]::Replace($safe, "[A-Za-z]:[\\/][^`r`n ]+", "<path>")
  $safe = [regex]::Replace($safe, "\b/tmp/[^`r`n ]+", "<path>")
  $safe = [regex]::Replace($safe, "untracked_collision:[^`r`n]+", "untracked_collision:<path>")
  return $safe
}

function ConvertTo-HandoffDisplayText {
  param([string]$Text)
  if (-not $Text) { return "" }
  $safe = $Text
  foreach ($root in @($script:RepoRoot, $env:USERPROFILE) | Where-Object { $_ }) {
    $safe = [regex]::Replace($safe, [regex]::Escape($root), "<path>", "IgnoreCase")
    $safe = [regex]::Replace($safe, [regex]::Escape($root.Replace("\", "/")), "<path>", "IgnoreCase")
  }
  return $safe
}

function ConvertTo-NativeWindowsArgument {
  param([AllowEmptyString()][string]$Argument)
  if ($null -eq $Argument) { $Argument = "" }
  if ($Argument -notmatch '[\s"]' -and $Argument.Length -gt 0) { return $Argument }
  $result = '"'
  $backslashes = 0
  foreach ($ch in $Argument.ToCharArray()) {
    if ($ch -eq "\") {
      $backslashes += 1
      continue
    }
    if ($ch -eq '"') {
      $result += ("\" * (($backslashes * 2) + 1))
      $result += '"'
      $backslashes = 0
      continue
    }
    if ($backslashes -gt 0) {
      $result += ("\" * $backslashes)
      $backslashes = 0
    }
    $result += $ch
  }
  if ($backslashes -gt 0) {
    $result += ("\" * ($backslashes * 2))
  }
  $result += '"'
  return $result
}

function ConvertTo-NativeWindowsArgumentList {
  param([string[]]$Arguments)
  return (@($Arguments | ForEach-Object { ConvertTo-NativeWindowsArgument $_ }) -join " ")
}

function Write-HandoffLog {
  param([string]$Stage, [string]$Message)
  $safeMessage = ConvertTo-HandoffLogMessage $Message
  $line = "[Personal_Web handoff] $Stage $safeMessage"
  Write-Host $line
  if ($script:LogPath) {
    Add-Content -LiteralPath $script:LogPath -Encoding utf8 -Value "[$((Get-Date).ToUniversalTime().ToString("o"))] $Stage $safeMessage"
  }
}

function Initialize-HandoffLog {
  param([string]$Root)
  Assert-HandoffRuntimeSafety -Root $Root -ValidateLogRoot
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  $resolved = (Resolve-Path -LiteralPath $Root).Path
  if (-not $TestMode) {
    $production = Join-Path $script:RepoRoot ".local_logs\handoff"
    $productionParent = Split-Path -Parent $production
    if (Test-Path -LiteralPath $productionParent) {
      $expected = (Resolve-Path -LiteralPath $productionParent).Path + "\handoff"
      if ($LogRoot -and -not $resolved.Equals($expected, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "log_root_override_requires_test_mode"
      }
    }
  } else {
    $productionRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    if ($script:RepoRoot.Equals($productionRepo, [System.StringComparison]::OrdinalIgnoreCase)) {
      $originProbe = & $GitExe -C $script:RepoRoot remote get-url origin 2>$null
      if ($LASTEXITCODE -eq 0 -and $originProbe -match "^git@github\.com:maoyifanEE/Personal_Web(\.git)?$") {
        throw "test_mode_rejects_production_repository"
      }
    }
    $productionLog = Join-Path $productionRepo ".local_logs\handoff"
    if ($resolved.Equals($productionLog, [System.StringComparison]::OrdinalIgnoreCase) -or $resolved.StartsWith($productionLog + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "test_mode_rejects_production_log_root"
    }
  }
  Get-ChildItem -LiteralPath $resolved -Filter "work-handoff-*.log" -File -ErrorAction SilentlyContinue |
    Where-Object { $_.LastWriteTimeUtc -lt (Get-Date).ToUniversalTime().AddDays(-7) } |
    Remove-Item -Force -ErrorAction SilentlyContinue
  $script:LogPath = Join-Path $resolved ("work-handoff-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
  New-Item -ItemType File -Path $script:LogPath -Force | Out-Null
}

function Assert-HandoffRuntimeSafety {
  param([string]$Root, [switch]$ValidateLogRoot)
  if (-not $TestMode -and $TestPauseBeforeMetadataPushSeconds -gt 0) { throw "test_pause_requires_test_mode" }
  if (-not $TestMode -and $AssumeSaved) { throw "assume_saved_requires_test_mode" }
  if (-not $TestMode) { return }
  $resolved = if (Test-Path -LiteralPath $Root) { (Resolve-Path -LiteralPath $Root).Path } else { [System.IO.Path]::GetFullPath($Root) }
  $productionRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
  if ($script:RepoRoot.Equals($productionRepo, [System.StringComparison]::OrdinalIgnoreCase)) {
    $originProbe = & $GitExe -C $script:RepoRoot remote get-url origin 2>$null
    if ($LASTEXITCODE -eq 0 -and $originProbe -match "^git@github\.com:maoyifanEE/Personal_Web(\.git)?$") {
      throw "test_mode_rejects_production_repository"
    }
  }
  if ($ValidateLogRoot) {
    $productionLog = Join-Path $productionRepo ".local_logs\handoff"
    if ($resolved.Equals($productionLog, [System.StringComparison]::OrdinalIgnoreCase) -or $resolved.StartsWith($productionLog + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "test_mode_rejects_production_log_root"
    }
  }
}

function Get-GitActionCategory {
  param([string[]]$Arguments)
  if (-not $Arguments -or $Arguments.Count -eq 0) { return "unknown" }
  switch ($Arguments[0]) {
    "fetch" { return "fetch" }
    "show" { return "show" }
    "merge" { return "fast_forward" }
    "switch" { return "branch_switch" }
    "push" { return "metadata_push" }
    "hash-object" { return "metadata_build" }
    "mktree" { return "metadata_build" }
    "commit-tree" { return "metadata_build" }
    "ls-remote" { return "remote_probe" }
    "ls-tree" { return "tree_read" }
    "rev-parse" { return "revision_read" }
    "branch" { return "branch_read" }
    "diff" { return "worktree_check" }
    "cat-file" { return "object_check" }
    "check-ref-format" { return "branch_validate" }
    "remote" { return "remote_validate" }
    "show-ref" { return "ref_check" }
    "merge-base" { return "ancestor_check" }
    default { return "other" }
  }
}

function Invoke-Git {
  param([string[]]$Arguments, [string]$Stage, [switch]$AllowFailure)
  $env:GIT_TERMINAL_PROMPT = "0"
  Write-HandoffLog $Stage ("git_action={0}" -f (Get-GitActionCategory -Arguments $Arguments))
  $previous = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $result = & $GitExe @Arguments 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($code -ne 0 -and -not $AllowFailure) {
    Write-HandoffLog $Stage ("failed exit=$code git_action={0}" -f (Get-GitActionCategory -Arguments $Arguments))
    throw "git_command_failed:$($Arguments[0])"
  }
  return [pscustomobject]@{ ExitCode = $code; Output = @($result) }
}

function Get-GitText {
  param([string[]]$Arguments, [string]$Stage)
  $result = Invoke-Git -Arguments $Arguments -Stage $Stage
  return (@($result.Output) -join "`n").Trim()
}

function Assert-RepositoryRoot {
  $actual = Get-GitText @("rev-parse", "--show-toplevel") $handoffStages.LocalPreflight
  $resolved = (Resolve-Path -LiteralPath $script:RepoRoot).Path
  $actualFull = [System.IO.Path]::GetFullPath($actual.Replace("/", "\")).TrimEnd("\")
  $resolvedFull = [System.IO.Path]::GetFullPath($resolved).TrimEnd("\")
  if (-not $actualFull.Equals($resolvedFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "repository_root_mismatch"
  }
}

function Test-AllowedBranch {
  param([string]$Branch)
  if ($Branch -eq "main") { return $true }
  if ($Branch -match "^Feature/[A-Za-z0-9][A-Za-z0-9._-]*$") { return $true }
  if ($Branch -match "^BugFix/[A-Za-z0-9][A-Za-z0-9._-]*$") { return $true }
  return $false
}

function Assert-BranchName {
  param([string]$Branch)
  if (-not (Test-AllowedBranch $Branch)) { throw "branch_not_allowed" }
  $check = Invoke-Git @("check-ref-format", "--branch", $Branch) $handoffStages.BranchValidate -AllowFailure
  if ($check.ExitCode -ne 0) { throw "branch_ref_invalid" }
}

function Assert-Origin {
  $origin = Get-GitText @("remote", "get-url", "origin") $handoffStages.LocalPreflight
  if ($TestMode) {
    if ([string]::IsNullOrWhiteSpace($origin)) { throw "origin_missing" }
    return
  }
  if ($origin -notmatch "^git@github\.com:maoyifanEE/Personal_Web(\.git)?$") {
    throw "origin_not_expected_ssh_repository"
  }
}

function Assert-NoGitOperation {
  $gitDir = Get-GitText @("rev-parse", "--git-dir") $handoffStages.LocalPreflight
  foreach ($item in @("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG", "rebase-merge", "rebase-apply")) {
    if (Test-Path -LiteralPath (Join-Path $gitDir $item)) { throw "git_operation_in_progress" }
  }
}

function Assert-CleanTracked {
  $cached = Invoke-Git @("diff", "--cached", "--quiet") $handoffStages.LocalPreflight -AllowFailure
  if ($cached.ExitCode -ne 0) { throw "staged_changes_present" }
  $unstaged = Invoke-Git @("diff", "--quiet") $handoffStages.LocalPreflight -AllowFailure
  if ($unstaged.ExitCode -ne 0) { throw "tracked_unstaged_changes_present" }
}

function Get-CurrentBranch {
  $branch = Get-GitText @("branch", "--show-current") $handoffStages.LocalPreflight
  if (-not $branch) { throw "detached_head" }
  return $branch
}

function Get-HeadCommit {
  return Get-GitText @("rev-parse", "HEAD") $handoffStages.LocalPreflight
}

function Assert-CommitShape {
  param([string]$Commit)
  if ($Commit -notmatch "^[0-9a-f]{40}$") { throw "commit_invalid" }
}

function Get-UntrackedFiles {
  $text = Get-GitText @("ls-files", "--others", "--exclude-standard") $handoffStages.LocalPreflight
  if (-not $text) { return @() }
  return @($text -split "`n" | Where-Object { $_ })
}

function Assert-CommitContainsContract {
  param([string]$Commit)
  foreach ($path in @("work-handoff.bat", "scripts/work-handoff.ps1", "config/work-handoff-contract.json")) {
    $exists = Invoke-Git @("cat-file", "-e", "${Commit}:${path}") $handoffStages.BranchValidate -AllowFailure
    if ($exists.ExitCode -ne 0) { throw "handoff_contract_missing" }
  }
}

function Get-PortListenersStrict {
  param([int]$Port)
  if ($TestMode -and $TestPortInspectionFailure) { throw "port_inspection_failed:$Port" }
  $primaryAvailable = $false
  $primaryOpen = $false
  try {
    $primary = @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop)
    $primaryAvailable = $true
    $primaryOpen = ($primary.Count -gt 0)
  } catch {
    $primaryAvailable = $false
  }
  $netstatAvailable = $false
  $netstatOpen = $false
  try {
    $lines = if ($TestMode -and $TestNetstatOutput) { @($TestNetstatOutput -split "`n") } else { @(netstat.exe -ano -p tcp 2>$null) }
    if (($TestMode -and $TestNetstatOutput) -or $LASTEXITCODE -eq 0) {
      $netstatAvailable = $true
      foreach ($line in $lines) {
        if ($line -match "^\s*TCP\s+\S+:$Port\s+\S+\s+LISTENING\s+\d+\s*$") { $netstatOpen = $true }
      }
    }
  } catch {
    $netstatAvailable = $false
  }
  if ($primaryAvailable -and $netstatAvailable -and $primaryOpen -ne $netstatOpen) { throw "port_inspection_failed:$Port" }
  if (-not $primaryAvailable -and -not $netstatAvailable) { throw "port_inspection_failed:$Port" }
  if (($primaryAvailable -and $primaryOpen) -or (-not $primaryAvailable -and $netstatOpen)) { return @("listener") }
  return @()
}

function Assert-PortsClosed {
  foreach ($port in @(8000, 4173, 15432)) {
    $listeners = @(Get-PortListenersStrict -Port $port)
    if ($listeners.Count -gt 0) { throw "shared_session_port_open:$port" }
  }
}

function Test-SharedSessionActive {
  foreach ($port in @(8000, 4173, 15432)) {
    $listeners = @(Get-PortListenersStrict -Port $port)
    if ($listeners.Count -gt 0) { return $true }
  }
  return $false
}

function Stop-SharedSessionIfNeeded {
  if (-not (Test-SharedSessionActive)) {
    Assert-PortsClosed
    return
  }
  if (-not $AssumeSaved -and -not $InternalConfirmedSaved -and -not $TestMode) {
    $answer = Read-Host "请确认浏览器和 Journey 变更已保存；输入 YES 继续交接"
    if ($answer -ne "YES") { throw "browser_changes_not_confirmed" }
  }
  $stopper = Join-Path $script:RepoRoot "stop-shared-dev.bat"
  if (-not (Test-Path -LiteralPath $stopper -PathType Leaf)) { throw "stop_launcher_missing" }
  & $stopper
  if ($LASTEXITCODE -ne 0) { throw "shared_stop_failed" }
  Assert-PortsClosed
}

function Read-Contract {
  $path = Join-Path $script:RepoRoot "config\work-handoff-contract.json"
  $contract = Get-Content -LiteralPath $path -Raw | ConvertFrom-Json
  if ($contract.schemaVersion -ne 1 -or $contract.repository -ne $expectedRepository -or $contract.metadataBranch -ne $metadataBranch -or $contract.metadataFile -ne $metadataFile) {
    throw "contract_invalid"
  }
}

function ConvertTo-CanonicalJson {
  param([string]$Branch, [string]$Commit, [datetime]$RecordedAtUtc)
  $timestamp = $RecordedAtUtc.ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffffffZ", [Globalization.CultureInfo]::InvariantCulture)
  return "{`n  `"schemaVersion`": 1,`n  `"repository`": `"maoyifanEE/Personal_Web`",`n  `"branch`": `"$Branch`",`n  `"commit`": `"$Commit`",`n  `"recordedAtUtc`": `"$timestamp`"`n}`n"
}

function Assert-HandoffRecord {
  param([object]$Record)
  $names = @($Record.PSObject.Properties.Name)
  $expected = @("schemaVersion", "repository", "branch", "commit", "recordedAtUtc")
  if ((@($names | Sort-Object) -join ",") -ne (@($expected | Sort-Object) -join ",")) { throw "metadata_keys_invalid" }
  if ($Record.schemaVersion -ne 1 -or $Record.repository -ne $expectedRepository) { throw "metadata_identity_invalid" }
  Assert-BranchName ([string]$Record.branch)
  Assert-CommitShape ([string]$Record.commit)
  [void][datetime]::ParseExact([string]$Record.recordedAtUtc, "yyyy-MM-ddTHH:mm:ss.fffffffZ", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal)
}

function Get-RemoteHandoffState {
  $ls = Invoke-Git @("ls-remote", "--heads", "origin", $metadataBranch) $handoffStages.Fetch -AllowFailure
  if ($ls.ExitCode -ne 0) { throw "metadata_remote_probe_failed" }
  $text = (@($ls.Output) -join "`n").Trim()
  if (-not $text) { return [pscustomobject]@{ State = "Absent"; Commit = $null } }
  $lines = @($text -split "`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  if ($lines.Count -ne 1) { throw "metadata_remote_probe_failed" }
  $parts = @($lines[0] -split "\s+" | Where-Object { $_ })
  if ($parts.Count -ne 2) { throw "metadata_remote_probe_failed" }
  if ($parts[0] -notmatch "^[0-9a-f]{40}$") { throw "metadata_remote_probe_failed" }
  if ($parts[1] -ne "refs/heads/${metadataBranch}") { throw "metadata_remote_probe_failed" }
  return [pscustomobject]@{ State = "Present"; Commit = $parts[0] }
}

function Assert-MetadataCommitContract {
  param([string]$MetadataCommit)
  Assert-CommitShape $MetadataCommit
  $type = Get-GitText @("cat-file", "-t", $MetadataCommit) $handoffStages.ReadHandoff
  if ($type -ne "commit") { throw "metadata_object_type_invalid" }

  $commitText = Get-GitText @("cat-file", "-p", $MetadataCommit) $handoffStages.ReadHandoff
  $parents = @()
  foreach ($line in @($commitText -split "`n")) {
    $cleanLine = $line.TrimEnd("`r")
    if (-not $cleanLine) { break }
    if ($cleanLine -match "^parent\s+([0-9a-f]{40})$") {
      $parents += $Matches[1]
    }
  }
  if ($parents.Count -gt 1) { throw "metadata_parent_count_invalid" }
  foreach ($parent in $parents) { Assert-CommitShape $parent }

  $treeResult = Invoke-Git @("ls-tree", "-r", "-z", "--full-tree", $MetadataCommit) $handoffStages.ReadHandoff
  $treeText = [string](@($treeResult.Output) -join "`n")
  if (-not $treeText) { throw "metadata_tree_contract_invalid" }
  $entries = @($treeText -split "`0" | Where-Object { $_ })
  if ($entries.Count -ne 1) { throw "metadata_tree_contract_invalid" }
  $entry = $entries[0]
  if ($entry -notmatch "^([0-9]{6})\s+(\S+)\s+[0-9a-f]{40}`t(.+)$") { throw "metadata_tree_contract_invalid" }
  if ($Matches[1] -ne "100644") { throw "metadata_tree_contract_invalid" }
  if ($Matches[2] -ne "blob") { throw "metadata_tree_contract_invalid" }
  if ($Matches[3] -ne $metadataFile) { throw "metadata_tree_contract_invalid" }
}

function Fetch-MetadataBranch {
  param([string]$AuthoritativeCommit, [switch]$ReadOnly)
  if ($ReadOnly) {
    Invoke-Git @("fetch", "--no-write-fetch-head", "origin", $AuthoritativeCommit) $handoffStages.Fetch | Out-Null
    $resolved = Invoke-Git @("rev-parse", $AuthoritativeCommit) $handoffStages.Fetch -AllowFailure
    if ($resolved.ExitCode -ne 0) { throw "metadata_fetch_readback_mismatch" }
    $fetched = (@($resolved.Output) -join "`n").Trim()
  } else {
    Invoke-Git @("fetch", "origin", "refs/heads/${metadataBranch}:refs/remotes/origin/${metadataBranch}") $handoffStages.Fetch | Out-Null
    $fetched = Get-GitText @("rev-parse", "origin/${metadataBranch}") $handoffStages.Fetch
  }
  if ($fetched -ne $AuthoritativeCommit) { throw "metadata_fetch_readback_mismatch" }
  Assert-MetadataCommitContract -MetadataCommit $fetched
  return $fetched
}

function Read-HandoffJson {
  param([switch]$ReadOnly)
  $remote = Get-RemoteHandoffState
  if ($remote.State -eq "Absent") { throw "handoff_not_initialized" }
  $fetched = Fetch-MetadataBranch -AuthoritativeCommit $remote.Commit -ReadOnly:$ReadOnly
  $revision = if ($ReadOnly) { $fetched } else { "origin/${metadataBranch}" }
  $json = Get-GitText @("show", "${revision}:${metadataFile}") $handoffStages.ReadHandoff
  $record = $json | ConvertFrom-Json
  Assert-HandoffRecord $record
  return [pscustomobject]@{ Json = $json; Record = $record; MetadataCommit = $fetched; AuthoritativeCommit = $remote.Commit }
}

function Publish-Handoff {
  param([string]$Branch, [string]$Commit)
  $remote = Get-RemoteHandoffState
  $parent = $null
  if ($remote.State -eq "Present") {
    $parent = Fetch-MetadataBranch -AuthoritativeCommit $remote.Commit
  }
  $json = ConvertTo-CanonicalJson -Branch $Branch -Commit $Commit -RecordedAtUtc (Get-Date).ToUniversalTime()
  $tempRoot = if ($script:LogPath) { Split-Path -Parent $script:LogPath } else { $script:RepoRoot }
  $jsonPath = Join-Path $tempRoot ("active-work-{0}.json" -f [guid]::NewGuid().ToString("N"))
  $treePath = Join-Path $tempRoot ("active-work-tree-{0}.txt" -f [guid]::NewGuid().ToString("N"))
  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($jsonPath, $json, $utf8NoBom)
    $blobText = Get-GitText @("hash-object", "--no-filters", "-w", $jsonPath) $handoffStages.HandoffBuild
    $blob = @($blobText -split "\s+" | Where-Object { $_ -match "^[0-9a-f]{40}$" })[-1]
    if (-not $blob) { throw "metadata_blob_failed" }
    [System.IO.File]::WriteAllText($treePath, "100644 blob $blob`t$metadataFile`n", [System.Text.Encoding]::ASCII)
    $quotedGit = '"' + $GitExe.Replace('"', '\"') + '"'
    $quotedTree = '"' + $treePath.Replace('"', '\"') + '"'
    $treeResult = & cmd.exe /d /c "$quotedGit mktree < $quotedTree" 2>&1
    if ($LASTEXITCODE -ne 0) { throw "metadata_tree_failed" }
    $tree = (@($treeResult) -join "`n").Trim()
  } finally {
    Remove-Item -LiteralPath $jsonPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $treePath -Force -ErrorAction SilentlyContinue
  }
  $commitArgs = @("commit-tree", $tree, "-m", "Update active Personal_Web work handoff")
  if ($parent) { $commitArgs += @("-p", $parent) }
  $newCommit = Get-GitText $commitArgs $handoffStages.HandoffBuild
  Assert-CommitShape $newCommit
  if ($TestMode -and $TestPauseBeforeMetadataPushSeconds -gt 0) { Start-Sleep -Seconds $TestPauseBeforeMetadataPushSeconds }
  $push = Invoke-Git @("push", "origin", "${newCommit}:refs/heads/${metadataBranch}") $handoffStages.HandoffPush -AllowFailure
  if ($push.ExitCode -ne 0) { throw "metadata_push_rejected" }
  $readback = Read-HandoffJson
  if ([string]$readback.Record.branch -ne $Branch -or [string]$readback.Record.commit -ne $Commit) { throw "metadata_readback_mismatch" }
  if (($readback.Json.TrimEnd() + "`n") -ne $json) { throw "metadata_json_readback_mismatch" }
  return $newCommit
}

function Assert-HandoffPreflight {
  Read-Contract
  Assert-RepositoryRoot
  Assert-Origin
  Assert-NoGitOperation
  Assert-CleanTracked
  $branch = Get-CurrentBranch
  if ($branch -eq $forbiddenBranch) { throw "metadata_branch_forbidden" }
  Assert-BranchName $branch
  $commit = Get-HeadCommit
  Assert-CommitShape $commit
  Invoke-Git @("fetch", "origin", $branch) $handoffStages.Fetch | Out-Null
  $remote = Get-GitText @("rev-parse", "origin/${branch}") $handoffStages.Fetch
  if ($commit -ne $remote) { throw $textUnpushed }
  Assert-CommitContainsContract $commit
  return [pscustomobject]@{ Branch = $branch; Commit = $commit; Untracked = @(Get-UntrackedFiles) }
}

function Invoke-EndAndHandoff {
  Write-HandoffLog $handoffStages.LocalPreflight "start EndAndHandoff"
  $state = Assert-HandoffPreflight
  if ($state.Untracked.Count -gt 0) { Write-HandoffLog $handoffStages.LocalPreflight ("untracked_count={0}" -f $state.Untracked.Count) }
  Stop-SharedSessionIfNeeded
  Write-HandoffLog $handoffStages.HandoffBuild ("handoff_publish branch={0} commit={1}" -f $state.Branch, $state.Commit.Substring(0, 12))
  Publish-Handoff -Branch $state.Branch -Commit $state.Commit | Out-Null
  Write-Host $textHandoffSuccess
  Write-Host ("{0}: {1}" -f $textBranch, $state.Branch)
  Write-Host ("Commit: {0}" -f $state.Commit.Substring(0, 12))
}

function Assert-UntrackedNoCollision {
  param([string]$Commit)
  $untracked = @(Get-UntrackedFiles)
  if ($untracked.Count -eq 0) { return }
  $trackedText = Get-GitText @("ls-tree", "-r", "--name-only", $Commit) $handoffStages.BranchValidate
  $tracked = @{}
  foreach ($path in @($trackedText -split "`n" | Where-Object { $_ })) { $tracked[$path] = $true }
  foreach ($path in $untracked) {
    if ($tracked.ContainsKey($path)) { throw "untracked_collision:$path" }
  }
}

function Assert-LocalBranchCanFastForward {
  param([string]$Branch, [string]$Target)
  $exists = Invoke-Git @("show-ref", "--verify", "--quiet", "refs/heads/${Branch}") $handoffStages.BranchValidate -AllowFailure
  if ($exists.ExitCode -ne 0) { return "missing" }
  $local = Get-GitText @("rev-parse", $Branch) $handoffStages.BranchValidate
  $remoteAncestor = Invoke-Git @("merge-base", "--is-ancestor", $local, $Target) $handoffStages.BranchValidate -AllowFailure
  if ($remoteAncestor.ExitCode -ne 0) { throw "local_branch_ahead_or_diverged" }
  return "exists"
}

function Invoke-SyncAndStart {
  Write-HandoffLog $handoffStages.LocalPreflight "start SyncAndStart"
  Read-Contract
  Assert-RepositoryRoot
  Assert-Origin
  Assert-NoGitOperation
  Assert-CleanTracked
  Assert-PortsClosed
  $current = Get-CurrentBranch
  if ($current -eq $forbiddenBranch) { throw "metadata_branch_forbidden" }
  Invoke-Git @("fetch", "origin") $handoffStages.Fetch | Out-Null
  $handoff = Read-HandoffJson
  $branch = [string]$handoff.Record.branch
  $commit = [string]$handoff.Record.commit
  $remoteBranch = Invoke-Git @("show-ref", "--verify", "--quiet", "refs/remotes/origin/${branch}") $handoffStages.BranchValidate -AllowFailure
  if ($remoteBranch.ExitCode -ne 0) { throw "remote_branch_missing" }
  $remoteHead = Get-GitText @("rev-parse", "origin/${branch}") $handoffStages.BranchValidate
  if ($remoteHead -ne $commit) { throw "remote_branch_moved_after_handoff" }
  Assert-CommitContainsContract $commit
  Assert-UntrackedNoCollision $commit
  $localState = Assert-LocalBranchCanFastForward -Branch $branch -Target $commit
  if ($localState -eq "missing") {
    Invoke-Git @("switch", "--track", "-c", $branch, "origin/${branch}") $handoffStages.BranchSwitch | Out-Null
  } else {
    Invoke-Git @("switch", $branch) $handoffStages.BranchSwitch | Out-Null
    Invoke-Git @("merge", "--ff-only", "origin/${branch}") $handoffStages.FastForward | Out-Null
  }
  $head = Get-HeadCommit
  if ($head -ne $commit -or $head -ne $remoteHead) { throw "head_verify_failed" }
  Assert-CleanTracked
  Write-HandoffLog $handoffStages.HeadVerify ("exact_head={0}" -f $head.Substring(0, 12))
  $launcher = if ($FakeLauncher) { $FakeLauncher } else { Join-Path $script:RepoRoot "start-shared-dev.bat" }
  if ($FakeLauncher -and -not $TestMode) { throw "fake_launcher_requires_test_mode" }
  if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw "shared_launcher_missing" }
  $launcherArgs = @()
  if ($KeepSession) { $launcherArgs += "keep-session" }
  Write-HandoffLog $handoffStages.SharedStart ("launcher_start keep_session={0}" -f [bool]$KeepSession)
  & $launcher @launcherArgs
  if ($LASTEXITCODE -ne 0) { throw "shared_launcher_failed" }
}

function Invoke-Status {
  Write-HandoffLog $handoffStages.LocalPreflight "start Status"
  Read-Contract
  Assert-RepositoryRoot
  Assert-Origin
  $branch = Get-CurrentBranch
  $commit = Get-HeadCommit
  Write-Host ("Local branch: {0}" -f $branch)
  Write-Host ("Local commit: {0}" -f $commit.Substring(0, 12))
  if ($TestMode) {
    Write-Host ("TEST_SCRIPT_PATH={0}" -f $PSCommandPath)
    Write-Host ("TEST_REPO_ROOT={0}" -f $script:RepoRoot)
    if ($TestChildObservationPath) {
      $observation = "SCRIPT={0}`nREPO={1}`n" -f $PSCommandPath, $script:RepoRoot
      $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
      [System.IO.File]::AppendAllText($TestChildObservationPath, $observation, $utf8NoBom)
    }
  }
  $dirty = "clean"
  try { Assert-CleanTracked } catch { $dirty = "dirty" }
  Write-Host ("Tracked worktree: {0}" -f $dirty)
  $remote = Get-RemoteHandoffState
  if ($remote.State -eq "Present") {
    $handoff = Read-HandoffJson -ReadOnly
    Write-Host ("Handoff branch: {0}" -f $handoff.Record.branch)
    Write-Host ("Handoff commit: {0}" -f ([string]$handoff.Record.commit).Substring(0, 12))
    Write-Host ("Handoff time: {0}" -f $handoff.Record.recordedAtUtc)
  } else {
    Write-Host "Handoff branch: (not initialized)"
  }
}

function Invoke-HandoffChildProcess {
  param([string]$ChildAction, [bool]$ChildKeepSession, [bool]$ConfirmedSaved)
  if ($TestMode -and $TestChildExitCode -ne "") {
    $exit = [int]$TestChildExitCode
    return [pscustomobject]@{
      ExitCode = $exit
      Output = "synthetic_child action=$ChildAction keep_session=$ChildKeepSession confirmed=$ConfirmedSaved"
      StatusText = if ($exit -eq 0) { "success" } else { "failure" }
    }
  }
  $args = @("-NoProfile", "-ExecutionPolicy", "Bypass", "-File", $PSCommandPath, "-Action", $ChildAction)
  if ($TestMode) {
    $args += @("-TestMode", "-RepositoryRoot", $script:RepoRoot)
    if ($script:LogPath) { $args += @("-LogRoot", (Split-Path -Parent $script:LogPath)) }
    if ($GitExe) { $args += @("-GitExe", $GitExe) }
    if ($FakeLauncher) { $args += @("-FakeLauncher", $FakeLauncher) }
    if ($TestChildObservationPath) { $args += @("-TestChildObservationPath", $TestChildObservationPath) }
  }
  if ($ChildKeepSession) { $args += "-KeepSession" }
  if ($ConfirmedSaved) { $args += "-InternalConfirmedSaved" }
  $operationId = [guid]::NewGuid().ToString("N")
  $outPath = Join-Path $env:TEMP ("personal-web-handoff-out-{0}.txt" -f $operationId)
  $errPath = Join-Path $env:TEMP ("personal-web-handoff-err-{0}.txt" -f $operationId)
  $output = ""
  try {
    $argumentText = ConvertTo-NativeWindowsArgumentList -Arguments $args
    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $argumentText -NoNewWindow -Wait -PassThru -RedirectStandardOutput $outPath -RedirectStandardError $errPath
    if (Test-Path -LiteralPath $outPath) { $output += Get-Content -LiteralPath $outPath -Raw -ErrorAction SilentlyContinue }
    if (Test-Path -LiteralPath $errPath) { $output += "`n" + (Get-Content -LiteralPath $errPath -Raw -ErrorAction SilentlyContinue) }
    $exitCode = [int]$process.ExitCode
  } finally {
    Remove-Item -LiteralPath $outPath, $errPath -Force -ErrorAction SilentlyContinue
  }
  return [pscustomobject]@{
    ExitCode = $exitCode
    Output = ConvertTo-HandoffDisplayText $output
    StatusText = if ($exitCode -eq 0) { "success" } else { "failure" }
  }
}

function Invoke-TestUiChildOperation {
  if (-not $TestMode) { throw "test_ui_child_requires_test_mode" }
  if ($TestUiCancelConfirmation -and $TestInvokeUiChildAction -eq "EndAndHandoff") {
    Write-Host "UI_CHILD_CANCELLED"
    Write-Host "UI_CHILD_INVOKED=False"
    return
  }
  $childKeepSession = ($KeepSession -and $TestInvokeUiChildAction -eq "SyncAndStart")
  $confirmed = ($TestInvokeUiChildAction -eq "EndAndHandoff")
  $result = Invoke-HandoffChildProcess -ChildAction $TestInvokeUiChildAction -ChildKeepSession:$childKeepSession -ConfirmedSaved:$confirmed
  Write-Host ("UI_CHILD_STATUS={0}" -f $result.StatusText)
  Write-Host ("UI_CHILD_EXIT={0}" -f $result.ExitCode)
  Write-Host ("UI_CHILD_KEEP_SESSION={0}" -f $childKeepSession)
  Write-Host "UI_BUTTONS_REENABLED=True"
  Write-Host $result.Output
  if ($result.ExitCode -ne 0) { throw "ui_child_failed" }
}

function Invoke-HandoffUi {
  if ($SuppressUi) {
    Write-Host "UI suppressed"
    $initial = Invoke-HandoffChildProcess -ChildAction "Status" -ChildKeepSession:$false -ConfirmedSaved:$false
    Write-Host ("UI_INITIAL_STATUS={0}" -f $initial.StatusText)
    Write-Host $initial.Output
    if ($initial.ExitCode -ne 0) { throw "ui_initial_status_failed" }
    return
  }
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form = New-Object System.Windows.Forms.Form
  $form.Text = "Personal_Web 工作交接"
  $form.Size = New-Object System.Drawing.Size(540, 350)
  $form.StartPosition = "CenterScreen"
  $status = New-Object System.Windows.Forms.TextBox
  $status.Multiline = $true
  $status.ReadOnly = $true
  $status.ScrollBars = "Vertical"
  $status.Location = New-Object System.Drawing.Point(12, 12)
  $status.Size = New-Object System.Drawing.Size(500, 180)
  $keep = New-Object System.Windows.Forms.CheckBox
  $keep.Text = $textKeepSession
  $keep.Checked = $false
  $keep.Location = New-Object System.Drawing.Point(12, 198)
  $keep.Size = New-Object System.Drawing.Size(220, 24)
  $sync = New-Object System.Windows.Forms.Button
  $sync.Text = $textSyncAndStart
  $sync.Location = New-Object System.Drawing.Point(12, 230)
  $sync.Size = New-Object System.Drawing.Size(220, 34)
  $handoff = New-Object System.Windows.Forms.Button
  $handoff.Text = $textEndAndHandoff
  $handoff.Location = New-Object System.Drawing.Point(250, 230)
  $handoff.Size = New-Object System.Drawing.Size(220, 34)
  $refresh = New-Object System.Windows.Forms.Button
  $refresh.Text = "刷新"
  $refresh.Location = New-Object System.Drawing.Point(12, 275)
  $refresh.Size = New-Object System.Drawing.Size(100, 26)
  $buttons = @($sync, $handoff, $refresh)
  $setStatusFromResult = {
    param($Result)
    if ($Result.ExitCode -eq 0) {
      $status.Text = $Result.Output
    } else {
      $status.Text = "失败`r`n" + $Result.Output
    }
  }
  $runChild = {
    param([string]$ChildAction, [bool]$ChildKeepSession, [bool]$ConfirmedSaved)
    foreach ($button in $buttons) { $button.Enabled = $false }
    try {
      $result = Invoke-HandoffChildProcess -ChildAction $ChildAction -ChildKeepSession:$ChildKeepSession -ConfirmedSaved:$ConfirmedSaved
      if ($result.ExitCode -eq 0) {
        $status.Text = "成功`r`n" + $result.Output
      } else {
        $status.Text = "失败`r`n" + $result.Output
      }
    } catch {
      $status.Text = "失败`r`n" + (ConvertTo-HandoffDisplayText $_.Exception.Message)
    } finally {
      foreach ($button in $buttons) { $button.Enabled = $true }
    }
  }
  $refresh.Add_Click({
    $result = Invoke-HandoffChildProcess -ChildAction "Status" -ChildKeepSession:$false -ConfirmedSaved:$false
    & $setStatusFromResult $result
  })
  $sync.Add_Click({ & $runChild "SyncAndStart" ([bool]$keep.Checked) $false })
  $handoff.Add_Click({
    $answer = [System.Windows.Forms.MessageBox]::Show("请确认浏览器和 Journey 变更已经保存。", "确认交接", [System.Windows.Forms.MessageBoxButtons]::OKCancel, [System.Windows.Forms.MessageBoxIcon]::Warning)
    if ($answer -ne [System.Windows.Forms.DialogResult]::OK) {
      $status.Text = "已取消，未执行交接。"
      return
    }
    & $runChild "EndAndHandoff" $false $true
  })
  $form.Controls.AddRange(@($status, $keep, $sync, $handoff, $refresh))
  try {
    $initial = Invoke-HandoffChildProcess -ChildAction "Status" -ChildKeepSession:$false -ConfirmedSaved:$false
    & $setStatusFromResult $initial
  } catch {
    $status.Text = "失败`r`n" + (ConvertTo-HandoffDisplayText $_.Exception.Message)
  }
  [void]$form.ShowDialog()
}

function Invoke-WithOperationMutex {
  param([scriptblock]$Body)
  $name = if ($TestMode -and $TestMutexName) { $TestMutexName } else { "Global\Personal_Web_Work_Handoff_Operation_" + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script:RepoRoot)).TrimEnd("=")) }
  Invoke-WithNamedMutex -Name $name -BusyError "handoff_operation_already_running" -Body $Body
}

function Invoke-WithUiMutex {
  param([scriptblock]$Body)
  $name = if ($TestMode -and $TestUiMutexName) { $TestUiMutexName } else { "Global\Personal_Web_Work_Handoff_UI_" + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script:RepoRoot)).TrimEnd("=")) }
  Invoke-WithNamedMutex -Name $name -BusyError "handoff_ui_already_open" -Body $Body
}

function Invoke-WithNamedMutex {
  param([string]$Name, [string]$BusyError, [scriptblock]$Body)
  $created = $false
  $mutex = New-Object System.Threading.Mutex($false, $Name, [ref]$created)
  try {
    if (-not $mutex.WaitOne(0)) { throw $BusyError }
    & $Body
  } finally {
    try { $mutex.ReleaseMutex() | Out-Null } catch {}
    $mutex.Dispose()
  }
}

$script:RepoRoot = if ($RepositoryRoot) { (Resolve-Path -LiteralPath $RepositoryRoot).Path } else { (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
Set-Location -LiteralPath $script:RepoRoot
$effectiveLogRoot = if ($LogRoot) { $LogRoot } else { Join-Path $script:RepoRoot ".local_logs\handoff" }
$statusOnlyInvocation = ($Action -eq "Status") -or ($TestInvokeUiChildAction -eq "Status") -or ($SuppressUi -and $Action -eq "Ui")
if ($statusOnlyInvocation) {
  Assert-HandoffRuntimeSafety -Root $effectiveLogRoot
} else {
  Initialize-HandoffLog -Root $effectiveLogRoot
}

try {
  if ($TestMode -and ($TestQuoteArgumentsJson -or $TestQuoteArgumentsBase64)) {
    $quoteJson = $TestQuoteArgumentsJson
    if ($TestQuoteArgumentsBase64) {
      $quoteJson = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($TestQuoteArgumentsBase64))
    }
    $parsedQuoteArguments = ConvertFrom-Json -InputObject $quoteJson
    $quoteArguments = New-Object System.Collections.Generic.List[string]
    foreach ($argument in $parsedQuoteArguments) {
      $quoteArguments.Add([string]$argument)
    }
    Write-Host ("TEST_QUOTED_ARGUMENTS={0}" -f (ConvertTo-NativeWindowsArgumentList -Arguments $quoteArguments))
  } elseif ($TestInvokeUiChildAction) {
    Invoke-TestUiChildOperation
  } else {
    switch ($Action) {
      "Ui" { Invoke-WithUiMutex { Invoke-HandoffUi } }
      "Status" { Invoke-Status }
      "EndAndHandoff" { Invoke-WithOperationMutex { Invoke-EndAndHandoff } }
      "SyncAndStart" { Invoke-WithOperationMutex { Invoke-SyncAndStart } }
    }
  }
  exit 0
} catch {
  Write-HandoffLog "FAIL" $_.Exception.Message
  Write-Host $_.Exception.Message
  exit 1
}
