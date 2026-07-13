param(
  [string]$OutputDir = "",
  [switch]$CreateBundle,
  [switch]$PathResolutionSelfTest
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$shortCommit = (& git -C $repoRoot rev-parse --short HEAD).Trim()
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$debugRoot = Join-Path $repoRoot ".runtime\journey-sticker-render-debug"

function Resolve-RepositoryContainedOutputPath {
  param(
    [string]$CandidatePath,
    [string]$RepositoryRoot,
    [string]$DefaultPath
  )

  $canonicalRepoRoot = [System.IO.Path]::GetFullPath($RepositoryRoot)
  if ([string]::IsNullOrWhiteSpace($CandidatePath)) {
    $candidate = $DefaultPath
  } elseif ([System.IO.Path]::IsPathRooted($CandidatePath)) {
    $candidate = $CandidatePath
  } else {
    $candidate = Join-Path $canonicalRepoRoot $CandidatePath
  }

  $resolved = [System.IO.Path]::GetFullPath($candidate)
  $separator = [System.IO.Path]::DirectorySeparatorChar
  $repoWithSeparator = $canonicalRepoRoot.TrimEnd(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  ) + $separator

  $comparison = [System.StringComparison]::Ordinal
  if ([System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT) {
    $comparison = [System.StringComparison]::OrdinalIgnoreCase
  }

  if (-not $resolved.StartsWith($repoWithSeparator, $comparison)) {
    throw "OutputDir must stay inside the repository: $resolved"
  }

  return $resolved
}

function Invoke-PathResolutionSelfTest {
  param(
    [string]$RepositoryRoot,
    [string]$DefaultPath
  )

  $scenarios = @(
    @{
      Name = "default absolute path"
      Path = ""
      ShouldPass = $true
    },
    @{
      Name = "repository relative path"
      Path = ".runtime\journey-sticker-render-debug\path-self-test-relative"
      ShouldPass = $true
    },
    @{
      Name = "absolute path inside repository"
      Path = Join-Path $RepositoryRoot ".runtime\journey-sticker-render-debug\path-self-test-absolute"
      ShouldPass = $true
    },
    @{
      Name = "sibling prefix confusion path"
      Path = Join-Path (Split-Path $RepositoryRoot -Parent) "$((Split-Path $RepositoryRoot -Leaf))_other\path-self-test"
      ShouldPass = $false
    },
    @{
      Name = "absolute path outside repository"
      Path = Join-Path (Split-Path $RepositoryRoot -Parent) "outside-personal-web-path-self-test"
      ShouldPass = $false
    }
  )

  foreach ($scenario in $scenarios) {
    try {
      $resolved = Resolve-RepositoryContainedOutputPath `
        -CandidatePath $scenario.Path `
        -RepositoryRoot $RepositoryRoot `
        -DefaultPath $DefaultPath
      if (-not $scenario.ShouldPass) {
        throw "Scenario should have failed but resolved to $resolved"
      }
      if ($resolved -match [regex]::Escape($RepositoryRoot) + ".*" + [regex]::Escape($RepositoryRoot)) {
        throw "Scenario produced a double-root path: $resolved"
      }
    } catch {
      if ($scenario.ShouldPass) {
        throw "Path self-test failed for $($scenario.Name): $($_.Exception.Message)"
      }
      if ($_.Exception.Message -notmatch "OutputDir must stay inside the repository") {
        throw "Path self-test rejected $($scenario.Name) with unclear error: $($_.Exception.Message)"
      }
    }
  }

  Write-Host "JOURNEY_STICKER_OUTPUT_PATH_SELF_TEST_PASS"
}

$defaultOutputDir = Join-Path $debugRoot "run-$timestamp-$shortCommit"
if ($PathResolutionSelfTest) {
  Invoke-PathResolutionSelfTest -RepositoryRoot $repoRoot -DefaultPath $defaultOutputDir
  exit 0
}

$OutputDir = Resolve-RepositoryContainedOutputPath `
  -CandidatePath $OutputDir `
  -RepositoryRoot $repoRoot `
  -DefaultPath $defaultOutputDir

$tempRoot = Join-Path $repoRoot ".runtime\temp\journey-sticker-rendering"
$chromeProfile = Join-Path $tempRoot "chrome-profile-$timestamp"
New-Item -ItemType Directory -Force -Path $OutputDir, $tempRoot, $chromeProfile | Out-Null

function Write-DiagnosticInfo {
  param([string]$Message)
  Write-Host "[JourneyStickerRendering] $Message"
}

function Resolve-PythonCommand {
  $candidates = @(
    @{ Command = "py"; Args = @("-3.12") },
    @{ Command = "python"; Args = @() },
    @{ Command = (Join-Path $repoRoot "backend\.venv\Scripts\python.exe"); Args = @() }
  )
  foreach ($candidate in $candidates) {
    try {
      if ($candidate.Command -like "*\*" -and -not (Test-Path $candidate.Command)) {
        continue
      }
      & $candidate.Command @($candidate.Args) -c "import sys; print(sys.version)" | Out-Null
      if ($LASTEXITCODE -eq 0) {
        return $candidate
      }
    } catch {
      continue
    }
  }
  throw "No usable Python command was found for the stdlib diagnostic helper."
}

function Resolve-BrowserPath {
  $candidates = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe"
  )
  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return $candidate
    }
  }
  return $null
}

Set-Location $repoRoot
Write-DiagnosticInfo "Repository: $repoRoot"
Write-DiagnosticInfo "OutputDir: $OutputDir"

$trackedTestPng = $false
$previousErrorActionPreference = $ErrorActionPreference
$ErrorActionPreference = "Continue"
& git -C $repoRoot ls-files --error-unmatch test.png > $null 2> $null
$ErrorActionPreference = $previousErrorActionPreference
if ($LASTEXITCODE -eq 0) {
  $trackedTestPng = $true
}
if ($trackedTestPng) {
  throw "test.png is tracked; diagnostic fixture must remain untracked."
}

$productionTestPngReferences = & git -C $repoRoot grep -n "test.png" -- `
  journey.html journey.css journey.js index.html styles.css script.js 2> $null
if ($LASTEXITCODE -eq 0 -and $productionTestPngReferences) {
  throw "Production source references test.png: $productionTestPngReferences"
}

$trackedRuntimeArtifacts = & git -C $repoRoot ls-files ".runtime" 2> $null
if ($trackedRuntimeArtifacts) {
  throw "Runtime diagnostic artifacts are tracked: $trackedRuntimeArtifacts"
}

$python = Resolve-PythonCommand
$helper = Join-Path $repoRoot "scripts\analyze-journey-sticker-rendering.py"
Write-DiagnosticInfo "Generating PNG forensics and diagnostic harness"
& $python.Command @($python.Args) $helper generate --repo-root $repoRoot --output-dir $OutputDir
if ($LASTEXITCODE -ne 0) {
  throw "Diagnostic harness generation failed."
}

$browser = Resolve-BrowserPath
if ($browser) {
  Write-DiagnosticInfo "Running headless browser diagnostics with $browser"
  $harnessPath = Join-Path $OutputDir "journey-sticker-render-matrix.html"
  $harnessUri = ([System.Uri]$harnessPath).AbsoluteUri
  $domPath = Join-Path $OutputDir "browser-dump-dom.html"
  $browserLogPath = Join-Path $OutputDir "browser-stderr.log"
  $screenshotPath = Join-Path $OutputDir "journey-sticker-render-matrix.png"
  $browserArgs = @(
    "--headless",
    "--disable-gpu",
    "--allow-file-access-from-files",
    "--user-data-dir=$chromeProfile",
    "--dump-dom",
    $harnessUri
  )
  & $browser @browserArgs 2> $browserLogPath | Tee-Object -FilePath $domPath > $null
  if ($LASTEXITCODE -ne 0) {
    throw "Headless browser DOM diagnostic failed. See $browserLogPath"
  }
  $screenshotArgs = @(
    "--headless",
    "--disable-gpu",
    "--allow-file-access-from-files",
    "--user-data-dir=$chromeProfile",
    "--window-size=1400,1600",
    "--screenshot=$screenshotPath",
    $harnessUri
  )
  & $browser @screenshotArgs >> $browserLogPath 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "Headless browser screenshot diagnostic failed. See $browserLogPath"
  }
  & $python.Command @($python.Args) $helper extract-dom --dom-file $domPath --output-dir $OutputDir
  if ($LASTEXITCODE -ne 0) {
    throw "Computed-style extraction failed."
  }
} else {
  Write-DiagnosticInfo "Chrome/Edge was not found; browser computed-style diagnostics skipped."
  "Chrome/Edge was not found on this machine." | Set-Content -Encoding UTF8 (Join-Path $OutputDir "browser-unavailable.txt")
}

if ($CreateBundle) {
  $reviewDir = Join-Path $debugRoot "review-bundles"
  New-Item -ItemType Directory -Force -Path $reviewDir | Out-Null
  $bundlePath = Join-Path $reviewDir "journey-sticker-render-debug-$timestamp-$shortCommit.zip"
  if (Test-Path $bundlePath) {
    Remove-Item -LiteralPath $bundlePath -Force
  }
  Compress-Archive -Path (Join-Path $OutputDir "*") -DestinationPath $bundlePath -Force
  Write-DiagnosticInfo "Review bundle: $bundlePath"
}

Write-DiagnosticInfo "Report: $(Join-Path $OutputDir "diagnostic-report.md")"
Write-Host "JOURNEY_STICKER_RENDERING_CHECK_PASS"
