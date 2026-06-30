$ErrorActionPreference = "Stop"

function Write-Info {
  param([string]$Message)
  Write-Host "[Personal_Web local dev] $Message"
}

function Read-EnvFile {
  param([string]$Path)

  $values = @{}
  Get-Content -Path $Path | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }
    $parts = $line -split "=", 2
    if ($parts.Count -eq 2) {
      $values[$parts[0].Trim()] = $parts[1].Trim().Trim('"').Trim("'")
    }
  }
  return $values
}

function Apply-EnvValues {
  param([hashtable]$Values)

  foreach ($key in $Values.Keys) {
    [System.Environment]::SetEnvironmentVariable($key, [string]$Values[$key], "Process")
  }
}

function Invoke-LoggedStep {
  param(
    [string]$Name,
    [scriptblock]$Script
  )

  Write-Info $Name
  & $Script
  if ($LASTEXITCODE -ne 0) {
    throw "$Name failed with exit code $LASTEXITCODE"
  }
}

function Get-PortListener {
  param([int]$Port)

  try {
    return Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop |
      Select-Object -First 1
  } catch {
    return $null
  }
}

function Test-UrlReady {
  param(
    [string]$Uri,
    [int[]]$AcceptedStatusCodes = @(200)
  )

  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 2
    return $AcceptedStatusCodes -contains [int]$response.StatusCode
  } catch {
    $statusCode = $null
    if ($_.Exception.Response) {
      $statusCode = $_.Exception.Response.StatusCode
    }
    if ($statusCode) {
      return $AcceptedStatusCodes -contains [int]$statusCode
    }
    return $false
  }
}

function Wait-ForUrl {
  param(
    [string]$Name,
    [string[]]$Uris,
    [int]$TimeoutSeconds,
    [int[]]$AcceptedStatusCodes = @(200)
  )

  for ($i = 0; $i -lt $TimeoutSeconds; $i += 1) {
    foreach ($uri in $Uris) {
      if (Test-UrlReady -Uri $uri -AcceptedStatusCodes $AcceptedStatusCodes) {
        Write-Info "$Name is ready at $uri"
        return $true
      }
    }
    Start-Sleep -Seconds 1
    if (($i + 1) % 5 -eq 0) {
      Write-Info "Waiting for $Name readiness... $($i + 1)s"
    }
  }
  return $false
}

function Describe-PortOwner {
  param([int]$Port)

  $listener = Get-PortListener -Port $Port
  if (-not $listener) {
    return "none"
  }
  $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
  if ($process) {
    return "PID $($listener.OwningProcess) - $($process.ProcessName)"
  }
  return "PID $($listener.OwningProcess)"
}

function Start-BackendWindow {
  param(
    [string]$BackendDir,
    [string]$BackendPython
  )

  $backendCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Personal_Web Backend 8000'
`$ErrorActionPreference = 'Stop'
Write-Host '[Personal_Web backend] Working directory: $BackendDir'
Write-Host '[Personal_Web backend] API: http://127.0.0.1:8000'
& '$BackendPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
Write-Host '[Personal_Web backend] Process exited. Review messages above.'
"@

  Write-Info "Starting backend server window on 127.0.0.1:8000"
  Start-Process powershell.exe -WorkingDirectory $BackendDir -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $backendCommand
  ) -WindowStyle Normal
}

function Start-FrontendWindow {
  param(
    [string]$RepoRoot,
    [string]$BackendPython
  )

  $frontendCommand = @"
`$Host.UI.RawUI.WindowTitle = 'Personal_Web Frontend 4173'
Write-Host '[Personal_Web frontend] Working directory: $RepoRoot'
Write-Host '[Personal_Web frontend] Homepage: http://127.0.0.1:4173/'
& '$BackendPython' -m http.server 4173 --bind 127.0.0.1
Write-Host '[Personal_Web frontend] Process exited. Review messages above.'
"@

  Write-Info "Starting frontend static server window on 127.0.0.1:4173"
  Start-Process powershell.exe -WorkingDirectory $RepoRoot -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    $frontendCommand
  ) -WindowStyle Normal
}

function Find-LocalAppBrowser {
  $candidates = @(
    @{
      Name = "Google Chrome"
      Paths = @(
        (Join-Path $env:ProgramFiles "Google\Chrome\Application\chrome.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Google\Chrome\Application\chrome.exe"),
        (Join-Path $env:LocalAppData "Google\Chrome\Application\chrome.exe")
      )
    },
    @{
      Name = "Microsoft Edge"
      Paths = @(
        (Join-Path $env:ProgramFiles "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path ${env:ProgramFiles(x86)} "Microsoft\Edge\Application\msedge.exe"),
        (Join-Path $env:LocalAppData "Microsoft\Edge\Application\msedge.exe")
      )
    }
  )

  foreach ($candidate in $candidates) {
    foreach ($path in $candidate.Paths) {
      if ($path -and (Test-Path $path)) {
        return @{
          Name = $candidate.Name
          Path = $path
        }
      }
    }
  }

  return $null
}

function Open-PersonalWebBrowserWindow {
  param(
    [string]$HomepageUrl,
    [string]$ProfileDir
  )

  $browser = Find-LocalAppBrowser
  if ($browser) {
    if (-not (Test-Path $ProfileDir)) {
      New-Item -ItemType Directory -Path $ProfileDir -Force | Out-Null
    }

    Write-Info "Opening Personal_Web in an independent local app browser window."
    Write-Info "Browser: $($browser.Name)"
    Write-Info "Browser profile: $ProfileDir"

    Start-Process -FilePath $browser.Path -ArgumentList @(
      ('"--user-data-dir={0}"' -f $ProfileDir),
      ('"--app={0}"' -f $HomepageUrl),
      "--new-window"
    )

    return @{
      Browser = $browser.Name
      BrowserPath = $browser.Path
      ProfileDir = $ProfileDir
      AppMode = $true
    }
  }

  Write-Host "Chrome/Edge not found. Falling back to the default browser, which may open a new tab in an existing window."
  Start-Process $HomepageUrl

  return @{
    Browser = "Default browser fallback"
    BrowserPath = ""
    ProfileDir = $ProfileDir
    AppMode = $false
  }
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$envPath = Join-Path $backendDir ".env"
$backendPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$homepageUrl = "http://127.0.0.1:4173/"
$loginUrl = "http://127.0.0.1:4173/login.html"
$browserProfileDir = Join-Path $env:LocalAppData "Personal_Web\browser-profile"

Set-Location $repoRoot

Write-Info "Repository: $repoRoot"
$branch = git branch --show-current
$commit = git rev-parse --short HEAD
Write-Info "Current branch: $branch"
Write-Info "Current commit: $commit"

if (-not (Test-Path $envPath)) {
  Write-Host ""
  Write-Host "backend/.env is missing."
  Write-Host "Create it from backend/.env.example and configure your local PostgreSQL DATABASE_URL."
  Write-Host "Required local development values include:"
  Write-Host "  APP_ENV=development"
  Write-Host "  ALLOW_DEV_TOOLS=true"
  Write-Host ""
  throw "Missing backend/.env"
}

$envValues = Read-EnvFile -Path $envPath
Apply-EnvValues -Values $envValues

if ($env:APP_ENV -ne "development") {
  throw "Refusing to start: backend/.env must contain APP_ENV=development"
}

if ($env:ALLOW_DEV_TOOLS -ne "true") {
  throw "Refusing to seed local users: backend/.env must contain ALLOW_DEV_TOOLS=true"
}

if (-not (Test-Path $backendPython)) {
  Invoke-LoggedStep "Creating backend virtual environment" {
    python -m venv (Join-Path $backendDir ".venv")
  }
}

Invoke-LoggedStep "Installing backend requirements into backend/.venv" {
  & $backendPython -m pip install -r (Join-Path $backendDir "requirements.txt")
}

Push-Location $backendDir
try {
  Invoke-LoggedStep "Running Alembic migrations" {
    & $backendPython -m alembic upgrade head
  }

  try {
    Invoke-LoggedStep "Seeding local development auth users" {
      & $backendPython -m app.scripts.seed_dev_auth_users
    }
  } catch {
    Write-Host ""
    Write-Host "Development auth seed failed. Common causes:"
    Write-Host "* APP_ENV is not development."
    Write-Host "* ALLOW_DEV_TOOLS is not true."
    Write-Host "* DATABASE_URL points to the wrong database."
    Write-Host "* PostgreSQL is not running."
    Write-Host "* Alembic migration failed."
    throw
  }
} finally {
  Pop-Location
}

$backendListener = Get-PortListener -Port 8000
if ($backendListener) {
  if (Test-UrlReady -Uri "http://127.0.0.1:8000/api/health") {
    Write-Info "Reusing existing backend on port 8000 ($(Describe-PortOwner -Port 8000))."
  } else {
    Write-Host "Port 8000 is already in use by $(Describe-PortOwner -Port 8000), but backend health is not ready."
    Write-Host "Run .\scripts\stop-local-dev.ps1, then start again."
    throw "Backend port 8000 is occupied by an unexpected process"
  }
} else {
  Start-BackendWindow -BackendDir $backendDir -BackendPython $backendPython
}

$backendReady = Wait-ForUrl `
  -Name "Backend" `
  -Uris @("http://127.0.0.1:8000/api/health", "http://127.0.0.1:8000/docs", "http://127.0.0.1:8000/api/auth/me") `
  -TimeoutSeconds 60 `
  -AcceptedStatusCodes @(200, 401, 403)

if (-not $backendReady) {
  Write-Host ""
  Write-Host "Backend did not become ready within 60 seconds."
  Write-Host "Check the 'Personal_Web Backend 8000' PowerShell window for database/configuration errors."
  Write-Host "If port 8000 is occupied, run .\scripts\stop-local-dev.ps1 and try again."
  throw "Backend readiness failed"
}

$frontendListener = Get-PortListener -Port 4173
if ($frontendListener) {
  if (Test-UrlReady -Uri $homepageUrl) {
    Write-Info "Reusing existing frontend on port 4173 ($(Describe-PortOwner -Port 4173))."
  } else {
    Write-Host "Port 4173 is already in use by $(Describe-PortOwner -Port 4173), but homepage is not responding."
    Write-Host "Run .\scripts\stop-local-dev.ps1, then start again."
    throw "Frontend port 4173 is occupied by an unexpected process"
  }
} else {
  Start-FrontendWindow -RepoRoot $repoRoot -BackendPython $backendPython
}

$frontendReady = Wait-ForUrl -Name "Frontend" -Uris @($homepageUrl) -TimeoutSeconds 30

if (-not $frontendReady) {
  Write-Host ""
  Write-Host "Frontend did not become ready within 30 seconds."
  Write-Host "Check the 'Personal_Web Frontend 4173' PowerShell window for static server errors."
  Write-Host "Opening homepage anyway so the browser can retry if the server finishes startup late."
} else {
  Write-Info "Opening homepage: $homepageUrl"
}

$browserLaunch = Open-PersonalWebBrowserWindow -HomepageUrl $homepageUrl -ProfileDir $browserProfileDir

Write-Host ""
Write-Host "Personal_Web local development is ready."
Write-Host ""
Write-Host "Homepage:"
Write-Host $homepageUrl
Write-Host ""
Write-Host "Login:"
Write-Host $loginUrl
Write-Host ""
Write-Host "Browser profile:"
Write-Host $browserLaunch.ProfileDir
Write-Host ""
Write-Host "This local browser profile is for Personal_Web development only."
Write-Host ""
Write-Host "Local development accounts:"
Write-Host "Admin: username 1, password 1"
Write-Host "User:  username 2, password 2"
Write-Host ""
Write-Host "These are local development accounts only."
Write-Host "Do not use them in production."
Write-Host ""
Write-Host "Stop:"
Write-Host ".\scripts\stop-local-dev.ps1"
