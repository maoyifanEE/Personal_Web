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
  [string]$TestMutexName,
  [int]$TestPauseBeforeMetadataPushSeconds = 0
)

$ErrorActionPreference = "Stop"
$script:LogPath = $null
$script:RepoRoot = $null
$metadataBranch = "meta/work-handoff"
$metadataFile = "active-work.json"
$expectedRepository = "maoyifanEE/Personal_Web"
$forbiddenBranch = "meta/work-handoff"
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

function Write-HandoffLog {
  param([string]$Stage, [string]$Message)
  $line = "[Personal_Web handoff] $Stage $Message"
  Write-Host $line
  if ($script:LogPath) {
    Add-Content -LiteralPath $script:LogPath -Encoding utf8 -Value "[$((Get-Date).ToUniversalTime().ToString("o"))] $Stage $Message"
  }
}

function Initialize-HandoffLog {
  param([string]$Root)
  New-Item -ItemType Directory -Force -Path $Root | Out-Null
  $resolved = (Resolve-Path -LiteralPath $Root).Path
  if (-not $TestMode) {
    if ($TestPauseBeforeMetadataPushSeconds -gt 0) {
      throw "test_pause_requires_test_mode"
    }
    $production = Join-Path $script:RepoRoot ".local_logs\handoff"
    if (-not $resolved.Equals((Resolve-Path -LiteralPath (Split-Path -Parent $production)).Path + "\handoff", [System.StringComparison]::OrdinalIgnoreCase) -and $LogRoot) {
      throw "log_root_override_requires_test_mode"
    }
  }
  if ($TestMode) {
    $productionRepo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path
    if ($script:RepoRoot.Equals($productionRepo, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw "test_mode_rejects_production_repository"
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

function Invoke-Git {
  param([string[]]$Arguments, [string]$Stage, [switch]$AllowFailure)
  $env:GIT_TERMINAL_PROMPT = "0"
  Write-HandoffLog $Stage ("git {0}" -f ($Arguments -join " "))
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = "Continue"
  try {
    $result = & $GitExe @Arguments 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }
  if ($code -ne 0 -and -not $AllowFailure) {
    Write-HandoffLog $Stage ("failed exit=$code")
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
  if (-not (Test-AllowedBranch $Branch)) {
    throw "branch_not_allowed"
  }
  $check = Invoke-Git @("check-ref-format", "--branch", $Branch) $handoffStages.BranchValidate -AllowFailure
  if ($check.ExitCode -ne 0) {
    throw "branch_ref_invalid"
  }
}

function Assert-Origin {
  $origin = Get-GitText @("remote", "get-url", "origin") $handoffStages.LocalPreflight
  if ($TestMode) {
    if ([string]::IsNullOrWhiteSpace($origin)) {
      throw "origin_missing"
    }
    return
  }
  if ($origin -notmatch "^git@github\.com:maoyifanEE/Personal_Web(\.git)?$") {
    throw "origin_not_expected_ssh_repository"
  }
}

function Assert-NoGitOperation {
  $gitDir = Get-GitText @("rev-parse", "--git-dir") $handoffStages.LocalPreflight
  $paths = @("MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "BISECT_LOG", "rebase-merge", "rebase-apply")
  foreach ($item in $paths) {
    if (Test-Path -LiteralPath (Join-Path $gitDir $item)) {
      throw "git_operation_in_progress"
    }
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
  if (-not $branch) {
    throw "detached_head"
  }
  return $branch
}

function Get-HeadCommit {
  return Get-GitText @("rev-parse", "HEAD") $handoffStages.LocalPreflight
}

function Assert-CommitShape {
  param([string]$Commit)
  if ($Commit -notmatch "^[0-9a-f]{40}$") {
    throw "commit_invalid"
  }
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
    if ($exists.ExitCode -ne 0) {
      throw "handoff_contract_missing"
    }
  }
}

function Assert-PortsClosed {
  foreach ($port in @(8000, 4173, 15432)) {
    try {
      $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
    } catch {
      $listeners = @()
    }
    if ($listeners.Count -gt 0) {
      throw "shared_session_port_open:$port"
    }
  }
}

function Test-SharedSessionActive {
  try {
    foreach ($port in @(8000, 4173, 15432)) {
      $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction Stop)
      if ($listeners.Count -gt 0) { return $true }
    }
  } catch {
  }
  return $false
}

function Stop-SharedSessionIfNeeded {
  if (-not (Test-SharedSessionActive)) {
    Assert-PortsClosed
    return
  }
  if (-not $AssumeSaved -and -not $TestMode) {
    $answer = Read-Host "Confirm browser/Journey changes are saved before handoff (type YES)"
    if ($answer -ne "YES") {
      throw "browser_changes_not_confirmed"
    }
  }
  $stopper = Join-Path $script:RepoRoot "stop-shared-dev.bat"
  if (-not (Test-Path -LiteralPath $stopper -PathType Leaf)) {
    throw "stop_launcher_missing"
  }
  & $stopper
  if ($LASTEXITCODE -ne 0) {
    throw "shared_stop_failed"
  }
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
  $actualKeys = (@($names | Sort-Object) -join ",")
  $expectedKeys = (@($expected | Sort-Object) -join ",")
  if ($actualKeys -ne $expectedKeys) {
    throw "metadata_keys_invalid"
  }
  if ($Record.schemaVersion -ne 1 -or $Record.repository -ne $expectedRepository) {
    throw "metadata_identity_invalid"
  }
  Assert-BranchName ([string]$Record.branch)
  Assert-CommitShape ([string]$Record.commit)
  $parsed = [datetime]::ParseExact([string]$Record.recordedAtUtc, "yyyy-MM-ddTHH:mm:ss.fffffffZ", [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal)
  if ($parsed.Kind -eq [datetimekind]::Unspecified) {
    throw "metadata_timestamp_invalid"
  }
}

function Get-RemoteHandoffCommit {
  $ls = Invoke-Git @("ls-remote", "--heads", "origin", $metadataBranch) $handoffStages.Fetch -AllowFailure
  if ($ls.ExitCode -ne 0 -or -not (@($ls.Output) -join "`n").Trim()) {
    return $null
  }
  $line = (@($ls.Output) -join "`n").Trim().Split("`n")[0]
  return ($line -split "\s+")[0]
}

function Fetch-MetadataBranch {
  $remoteCommit = Get-RemoteHandoffCommit
  if (-not $remoteCommit) { return $null }
  Invoke-Git @("fetch", "origin", "refs/heads/${metadataBranch}:refs/remotes/origin/${metadataBranch}") $handoffStages.Fetch | Out-Null
  return $remoteCommit
}

function Read-HandoffJson {
  Fetch-MetadataBranch | Out-Null
  $json = Get-GitText @("show", "origin/${metadataBranch}:${metadataFile}") $handoffStages.ReadHandoff
  $record = $json | ConvertFrom-Json
  Assert-HandoffRecord $record
  return [pscustomobject]@{ Json = $json; Record = $record }
}

function Publish-Handoff {
  param([string]$Branch, [string]$Commit)
  $parent = Fetch-MetadataBranch
  $json = ConvertTo-CanonicalJson -Branch $Branch -Commit $Commit -RecordedAtUtc (Get-Date).ToUniversalTime()
  $tempRoot = if ($script:LogPath) { Split-Path -Parent $script:LogPath } else { $script:RepoRoot }
  $jsonPath = Join-Path $tempRoot ("active-work-{0}.json" -f [guid]::NewGuid().ToString("N"))
  $treePath = Join-Path $tempRoot ("active-work-tree-{0}.txt" -f [guid]::NewGuid().ToString("N"))
  try {
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($jsonPath, $json, $utf8NoBom)
    $blobText = Get-GitText @("hash-object", "--no-filters", "-w", $jsonPath) $handoffStages.HandoffBuild
    $blob = @($blobText -split "\s+" | Where-Object { $_ -match "^[0-9a-f]{40}$" })[-1]
    if (-not $blob) {
      throw "metadata_blob_failed"
    }
    $treeInput = "100644 blob $blob`t$metadataFile`n"
    [System.IO.File]::WriteAllText($treePath, $treeInput, [System.Text.Encoding]::ASCII)
    $quotedGit = '"' + $GitExe.Replace('"', '\"') + '"'
    $quotedTree = '"' + $treePath.Replace('"', '\"') + '"'
    $treeResult = & cmd.exe /d /c "$quotedGit mktree < $quotedTree" 2>&1
    if ($LASTEXITCODE -ne 0) {
      throw "metadata_tree_failed"
    }
    $tree = (@($treeResult) -join "`n").Trim()
  } finally {
    Remove-Item -LiteralPath $jsonPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $treePath -Force -ErrorAction SilentlyContinue
  }
  $commitArgs = @("commit-tree", $tree, "-m", "Update active Personal_Web work handoff")
  if ($parent) {
    $commitArgs += @("-p", $parent)
  }
  $newCommit = Get-GitText $commitArgs $handoffStages.HandoffBuild
  Assert-CommitShape $newCommit
  if ($TestMode -and $TestPauseBeforeMetadataPushSeconds -gt 0) {
    Start-Sleep -Seconds $TestPauseBeforeMetadataPushSeconds
  }
  $push = Invoke-Git @("push", "origin", "${newCommit}:refs/heads/${metadataBranch}") $handoffStages.HandoffPush -AllowFailure
  if ($push.ExitCode -ne 0) {
    throw "metadata_push_rejected"
  }
  Invoke-Git @("fetch", "origin", "refs/heads/${metadataBranch}:refs/remotes/origin/${metadataBranch}") $handoffStages.HandoffReadback | Out-Null
  $readback = Read-HandoffJson
  if ([string]$readback.Record.branch -ne $Branch -or [string]$readback.Record.commit -ne $Commit) {
    throw "metadata_readback_mismatch"
  }
  $remoteJson = ($readback.Json.TrimEnd() + "`n")
  if ($remoteJson -ne $json) {
    throw "metadata_json_readback_mismatch"
  }
  $files = Get-GitText @("ls-tree", "--name-only", "origin/${metadataBranch}") $handoffStages.HandoffReadback
  if ($files -ne $metadataFile) {
    throw "metadata_tree_not_single_file"
  }
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
  if ($commit -ne $remote) {
    throw "褰撳墠鍒嗘敮鎴?commit 灏氭湭瀹屾暣鎺ㄩ€侊紝浜ゆ帴宸插仠姝€?"
  }
  Assert-CommitContainsContract $commit
  return [pscustomobject]@{ Branch = $branch; Commit = $commit; Untracked = @(Get-UntrackedFiles) }
}

function Invoke-EndAndHandoff {
  Write-HandoffLog $handoffStages.LocalPreflight "start EndAndHandoff"
  $state = Assert-HandoffPreflight
  if ($state.Untracked.Count -gt 0) {
    Write-HandoffLog $handoffStages.LocalPreflight ("untracked_count={0}" -f $state.Untracked.Count)
  }
  Stop-SharedSessionIfNeeded
  Write-HandoffLog $handoffStages.HandoffBuild ("publishing branch={0} commit={1}" -f $state.Branch, $state.Commit.Substring(0, 12))
  Publish-Handoff -Branch $state.Branch -Commit $state.Commit | Out-Null
  Write-Host "宸ヤ綔宸蹭氦鎺?"
  Write-Host ("鍒嗘敮锛?{0}" -f $state.Branch)
  Write-Host ("Commit锛?{0}" -f $state.Commit.Substring(0, 12))
}

function Assert-UntrackedNoCollision {
  param([string]$Commit)
  $untracked = @(Get-UntrackedFiles)
  if ($untracked.Count -eq 0) { return }
  $trackedText = Get-GitText @("ls-tree", "-r", "--name-only", $Commit) $handoffStages.BranchValidate
  $tracked = @{}
  foreach ($path in @($trackedText -split "`n" | Where-Object { $_ })) {
    $tracked[$path] = $true
  }
  foreach ($path in $untracked) {
    if ($tracked.ContainsKey($path)) {
      throw "untracked_collision:$path"
    }
  }
}

function Assert-LocalBranchCanFastForward {
  param([string]$Branch, [string]$Target)
  $exists = Invoke-Git @("show-ref", "--verify", "--quiet", "refs/heads/${Branch}") $handoffStages.BranchValidate -AllowFailure
  if ($exists.ExitCode -ne 0) {
    return "missing"
  }
  $local = Get-GitText @("rev-parse", $Branch) $handoffStages.BranchValidate
  $remoteAncestor = Invoke-Git @("merge-base", "--is-ancestor", $local, $Target) $handoffStages.BranchValidate -AllowFailure
  if ($remoteAncestor.ExitCode -ne 0) {
    throw "local_branch_ahead_or_diverged"
  }
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
  if ($head -ne $commit -or $head -ne $remoteHead) {
    throw "head_verify_failed"
  }
  Assert-CleanTracked
  Write-HandoffLog $handoffStages.HeadVerify ("exact_head={0}" -f $head.Substring(0, 12))
  $launcher = if ($FakeLauncher) { $FakeLauncher } else { Join-Path $script:RepoRoot "start-shared-dev.bat" }
  if ($FakeLauncher -and -not $TestMode) { throw "fake_launcher_requires_test_mode" }
  if (-not (Test-Path -LiteralPath $launcher -PathType Leaf)) { throw "shared_launcher_missing" }
  $launcherArgs = @()
  if ($KeepSession) { $launcherArgs += "keep-session" }
  Write-HandoffLog $handoffStages.SharedStart ("launcher_start keep_session={0}" -f [bool]$KeepSession)
  & $launcher @launcherArgs
  if ($LASTEXITCODE -ne 0) {
    throw "shared_launcher_failed"
  }
}

function Invoke-Status {
  Write-HandoffLog $handoffStages.LocalPreflight "start Status"
  Read-Contract
  Assert-RepositoryRoot
  Assert-Origin
  $branch = Get-CurrentBranch
  $commit = Get-HeadCommit
  Write-Host ("Local branch: {0}" -f $branch)
  Write-Host ("Local commit: {0}" -f $commit)
  $dirty = "clean"
  try { Assert-CleanTracked } catch { $dirty = "dirty" }
  Write-Host ("Tracked worktree: {0}" -f $dirty)
  $remote = Fetch-MetadataBranch
  if ($remote) {
    $handoff = Read-HandoffJson
    Write-Host ("Handoff branch: {0}" -f $handoff.Record.branch)
    Write-Host ("Handoff commit: {0}" -f $handoff.Record.commit)
    Write-Host ("Handoff time: {0}" -f $handoff.Record.recordedAtUtc)
  } else {
    Write-Host "Handoff branch: (not initialized)"
  }
}

function Invoke-HandoffUi {
  if ($SuppressUi) {
    Invoke-Status
    return
  }
  Add-Type -AssemblyName System.Windows.Forms
  Add-Type -AssemblyName System.Drawing
  $form = New-Object System.Windows.Forms.Form
  $form.Text = "Personal_Web Work Handoff"
  $form.Size = New-Object System.Drawing.Size(520, 320)
  $form.StartPosition = "CenterScreen"
  $status = New-Object System.Windows.Forms.TextBox
  $status.Multiline = $true
  $status.ReadOnly = $true
  $status.ScrollBars = "Vertical"
  $status.Location = New-Object System.Drawing.Point(12, 12)
  $status.Size = New-Object System.Drawing.Size(480, 180)
  $sync = New-Object System.Windows.Forms.Button
  $sync.Text = "鍚屾骞跺紑濮嬪伐浣?"
  $sync.Location = New-Object System.Drawing.Point(12, 210)
  $sync.Size = New-Object System.Drawing.Size(220, 34)
  $handoff = New-Object System.Windows.Forms.Button
  $handoff.Text = "缁撴潫宸ヤ綔骞朵氦鎺?"
  $handoff.Location = New-Object System.Drawing.Point(250, 210)
  $handoff.Size = New-Object System.Drawing.Size(220, 34)
  $refresh = New-Object System.Windows.Forms.Button
  $refresh.Text = "Refresh"
  $refresh.Location = New-Object System.Drawing.Point(12, 250)
  $refresh.Size = New-Object System.Drawing.Size(100, 26)
  $refresh.Add_Click({
    try {
      $status.Text = "Status refreshed.`r`n"
      $status.Text += (& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Action Status 2>&1 | Out-String)
    } catch {
      $status.Text = $_.Exception.Message
    }
  })
  $sync.Add_Click({
    try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Action SyncAndStart; $status.Text = "SyncAndStart completed." } catch { $status.Text = $_.Exception.Message }
  })
  $handoff.Add_Click({
    try { & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $PSCommandPath -Action EndAndHandoff; $status.Text = "EndAndHandoff completed." } catch { $status.Text = $_.Exception.Message }
  })
  $form.Controls.AddRange(@($status, $sync, $handoff, $refresh))
  [void]$form.ShowDialog()
}

function Invoke-WithMutex {
  param([scriptblock]$Body)
  $name = if ($TestMode -and $TestMutexName) { $TestMutexName } else { "Global\Personal_Web_Work_Handoff_" + ([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script:RepoRoot)).TrimEnd("=")) }
  $created = $false
  $mutex = New-Object System.Threading.Mutex($false, $name, [ref]$created)
  try {
    if (-not $mutex.WaitOne(0)) {
      throw "handoff_operation_already_running"
    }
    & $Body
  } finally {
    try { $mutex.ReleaseMutex() | Out-Null } catch {}
    $mutex.Dispose()
  }
}

$script:RepoRoot = if ($RepositoryRoot) { (Resolve-Path -LiteralPath $RepositoryRoot).Path } else { (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).Path }
Set-Location -LiteralPath $script:RepoRoot
$effectiveLogRoot = if ($LogRoot) { $LogRoot } else { Join-Path $script:RepoRoot ".local_logs\handoff" }
Initialize-HandoffLog -Root $effectiveLogRoot

try {
  Invoke-WithMutex {
    switch ($Action) {
      "Ui" { Invoke-HandoffUi }
      "Status" { Invoke-Status }
      "EndAndHandoff" { Invoke-EndAndHandoff }
      "SyncAndStart" { Invoke-SyncAndStart }
    }
  }
  exit 0
} catch {
  Write-HandoffLog "FAIL" $_.Exception.Message
  Write-Host $_.Exception.Message
  exit 1
}
