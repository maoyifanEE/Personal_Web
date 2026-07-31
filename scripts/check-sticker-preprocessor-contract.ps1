param(
    [string]$StickerPreprocessorRoot = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
if (-not $StickerPreprocessorRoot) {
    $candidate = Join-Path (Split-Path $repoRoot -Parent) "script\Sticker_Preprocessor"
    if (Test-Path $candidate) {
        $StickerPreprocessorRoot = $candidate
    }
}

if (-not $StickerPreprocessorRoot -or -not (Test-Path $StickerPreprocessorRoot)) {
    throw "Sticker_Preprocessor root not found. Pass -StickerPreprocessorRoot."
}

$providerRoot = Resolve-Path $StickerPreprocessorRoot
$clientContracts = Join-Path $repoRoot "docs\contracts"
$providerContracts = Join-Path $providerRoot "docs\contracts"

if (-not (Test-Path $clientContracts)) {
    throw "Personal_Web contract folder missing: $clientContracts"
}
if (-not (Test-Path $providerContracts)) {
    throw "Sticker_Preprocessor contract folder missing: $providerContracts"
}

$files = @(
    "sticker-preprocessor-handoff-v1.md",
    "sticker-preprocessor-capabilities-v1.schema.json",
    "sticker-preprocessor-request-v1.schema.json",
    "sticker-preprocessor-result-v1.schema.json",
    "sticker-preprocessor-response-v1.schema.json"
)

foreach ($file in $files) {
    $clientPath = Join-Path $clientContracts $file
    $providerPath = Join-Path $providerContracts $file
    if (-not (Test-Path $clientPath)) {
        throw "Missing Personal_Web contract file: $file"
    }
    if (-not (Test-Path $providerPath)) {
        throw "Missing Sticker_Preprocessor contract file: $file"
    }
    $clientText = (Get-Content -Raw -Encoding UTF8 $clientPath) -replace "`r`n", "`n"
    $providerText = (Get-Content -Raw -Encoding UTF8 $providerPath) -replace "`r`n", "`n"
    if ($clientText -ne $providerText) {
        throw "Contract mismatch: $file"
    }
    Write-Host "CONTRACT_MATCH $file"
}

$python = Join-Path $providerRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $python)) {
    throw "Sticker_Preprocessor virtualenv python missing: $python"
}

$capabilities = & $python -m sticker_preprocessor --bridge-capabilities
if ($LASTEXITCODE -ne 0) {
    throw "Capabilities command failed with exit code $LASTEXITCODE"
}

$json = $capabilities | ConvertFrom-Json
if ($json.schemaVersion -ne "sticker-preprocessor-capabilities-v1") {
    throw "Capabilities schema version mismatch."
}
if ($json.contractVersions -notcontains "personal-web-sticker-handoff-v1") {
    throw "Capabilities contract version missing."
}
Write-Host "CAPABILITIES_CONTRACT_PASS"
Write-Host "STICKER_PREPROCESSOR_CONTRACT_CHECK_PASS"
