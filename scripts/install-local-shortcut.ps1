$ErrorActionPreference = "Stop"

function ConvertFrom-CodePoint {
  param([int[]]$CodePoints)

  $builder = New-Object System.Text.StringBuilder
  foreach ($codePoint in $CodePoints) {
    $null = $builder.Append([char]$codePoint)
  }
  return $builder.ToString()
}

function Write-Zh {
  param([int[]]$CodePoints)

  Write-Host (ConvertFrom-CodePoint -CodePoints $CodePoints)
}

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$shortcutScript = Join-Path $repoRoot "scripts\create-local-launch-shortcut.ps1"

Write-Host ""
Write-Host "$((ConvertFrom-CodePoint @(0x6B63, 0x5728, 0x521B, 0x5EFA))) Personal Web Local $((ConvertFrom-CodePoint @(0x684C, 0x9762, 0x5FEB, 0x6377, 0x65B9, 0x5F0F)))..."
Write-Host ""

try {
  & $shortcutScript
  if (-not $?) {
    throw "Shortcut script failed"
  }

  Write-Host ""
  Write-Zh @(0x521B, 0x5EFA, 0x6210, 0x529F, 0x3002)
  Write-Host "$((ConvertFrom-CodePoint @(0x4EE5, 0x540E, 0x53EF, 0x4EE5, 0x76F4, 0x63A5, 0x53CC, 0x51FB, 0x684C, 0x9762, 0x7684))) Personal Web Local $((ConvertFrom-CodePoint @(0x56FE, 0x6807, 0x542F, 0x52A8, 0x672C, 0x5730, 0x7F51, 0x7AD9, 0x3002)))"
  Write-Zh @(0x5982, 0x679C, 0x79FB, 0x52A8, 0x4E86, 0x9879, 0x76EE, 0x6587, 0x4EF6, 0x5939, 0xFF0C, 0x8BF7, 0x91CD, 0x65B0, 0x8FD0, 0x884C, 0x672C, 0x5B89, 0x88C5, 0x5668, 0x3002)
  Write-Host ""
} catch {
  Write-Host ""
  Write-Zh @(0x521B, 0x5EFA, 0x5FEB, 0x6377, 0x65B9, 0x5F0F, 0x5931, 0x8D25, 0x3002)
  Write-Host $_.Exception.Message
  Write-Host "$((ConvertFrom-CodePoint @(0x8BF7, 0x628A, 0x8FD9, 0x4E2A, 0x7A97, 0x53E3, 0x622A, 0x56FE, 0x53D1, 0x7ED9))) ChatGPT$((ConvertFrom-CodePoint @(0x3002)))"
  Write-Host ""
  exit 1
}
