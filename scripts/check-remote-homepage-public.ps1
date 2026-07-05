param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl
)

$ErrorActionPreference = "Stop"

function Write-CheckInfo {
  param([string]$Message)
  Write-Host "[homepage public check] $Message"
}

function Join-Url {
  param(
    [string]$Root,
    [string]$Path
  )

  return $Root.TrimEnd("/") + "/" + $Path.TrimStart("/")
}

function Invoke-JsonGet {
  param([string]$Uri)

  Write-CheckInfo "GET $Uri"
  $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 20
  if ([int]$response.StatusCode -ne 200) {
    throw "Expected 200 from $Uri, got $($response.StatusCode)"
  }
  return $response.Content | ConvertFrom-Json
}

function Invoke-StatusGet {
  param([string]$Uri)

  Write-CheckInfo "GET $Uri"
  $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 20
  if ([int]$response.StatusCode -ne 200) {
    throw "Expected 200 from $Uri, got $($response.StatusCode)"
  }
  return $response
}

$journeyUrl = Join-Url -Root $BaseUrl -Path "journey.html?view=public"
$canvasUrl = Join-Url -Root $BaseUrl -Path "api/homepage/canvas"

Invoke-StatusGet -Uri $journeyUrl | Out-Null
$canvas = Invoke-JsonGet -Uri $canvasUrl

if (-not $canvas.exists -or -not $canvas.canvas_data) {
  throw "Canvas endpoint did not return existing canvas data."
}

$mediaIds = New-Object System.Collections.Generic.List[int]
$json = $canvas.canvas_data | ConvertTo-Json -Depth 100
[regex]::Matches($json, '"mediaId"\s*:\s*"?([0-9]+)"?') | ForEach-Object {
  $mediaIds.Add([int]$_.Groups[1].Value)
}

if ($mediaIds.Count -gt 0) {
  $firstMediaId = ($mediaIds | Select-Object -First 1)
  $mediaUrl = Join-Url -Root $BaseUrl -Path "api/homepage/media/$firstMediaId/file"
  Invoke-StatusGet -Uri $mediaUrl | Out-Null
  Write-CheckInfo "Verified public media file for mediaId=$firstMediaId"
} else {
  Write-CheckInfo "Canvas contains no mediaId stickers; media file check skipped."
}

Write-CheckInfo "PASS"
