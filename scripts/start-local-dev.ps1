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

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "backend"
$envPath = Join-Path $backendDir ".env"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$frontendUrl = "http://127.0.0.1:4173/login.html"

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

if (-not (Test-Path $venvPython)) {
  Invoke-LoggedStep "Creating backend virtual environment" {
    python -m venv (Join-Path $backendDir ".venv")
  }
}

Invoke-LoggedStep "Installing backend requirements into backend/.venv" {
  & $venvPython -m pip install -r (Join-Path $backendDir "requirements.txt")
}

Push-Location $backendDir
try {
  Invoke-LoggedStep "Running Alembic migrations" {
    & $venvPython -m alembic upgrade head
  }

  try {
    Invoke-LoggedStep "Seeding local development auth users" {
      & $venvPython -m app.scripts.seed_dev_auth_users
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

$backendCommand = @"
`$ErrorActionPreference = 'Stop'
Set-Location '$backendDir'
Get-Content '.env' | ForEach-Object {
  `$line = `$_.Trim()
  if (`$line -and -not `$line.StartsWith('#')) {
    `$parts = `$line -split '=', 2
    if (`$parts.Count -eq 2) {
      [System.Environment]::SetEnvironmentVariable(`$parts[0].Trim(), `$parts[1].Trim().Trim('"').Trim("'"), 'Process')
    }
  }
}
Write-Host 'Backend API: http://127.0.0.1:8000'
& '$venvPython' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
"@

Write-Info "Starting backend server window on 127.0.0.1:8000"
Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  $backendCommand
) -WindowStyle Normal

$backendReady = $false
for ($i = 0; $i -lt 30; $i += 1) {
  Start-Sleep -Seconds 1
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/health" -UseBasicParsing -TimeoutSec 2
    if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
      $backendReady = $true
      break
    }
  } catch {
    Write-Info "Waiting for backend readiness..."
  }
}

if (-not $backendReady) {
  Write-Host "Backend did not become ready within 30 seconds."
  Write-Host "Check the Backend PowerShell window for database/configuration errors."
}

$frontendCommand = @"
Set-Location '$repoRoot'
Write-Host 'Frontend: http://127.0.0.1:4173'
python -m http.server 4173 --bind 127.0.0.1
"@

Write-Info "Starting frontend static server window on 127.0.0.1:4173"
Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-NoProfile",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  $frontendCommand
) -WindowStyle Normal

Start-Sleep -Seconds 2
Write-Info "Opening login page: $frontendUrl"
Start-Process $frontendUrl

Write-Host ""
Write-Host "Local development accounts:"
Write-Host "Admin: username 1, password 1"
Write-Host "User:  username 2, password 2"
Write-Host ""
Write-Host "These are local development accounts only."
Write-Host "Do not use them in production."
Write-Host ""
Write-Host "Stop instructions:"
Write-Host "* Close the Backend and Frontend PowerShell windows, or"
Write-Host "* Run scripts/stop-local-dev.ps1 from the repository root."
