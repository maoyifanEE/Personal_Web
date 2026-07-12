param(
  [Parameter(Mandatory = $true)]
  [string]$BaseUrl,

  [string]$HttpBaseUrl
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

function Invoke-RemoteRequest {
  param(
    [string]$Uri,
    [string]$Method = "GET"
  )

  try {
    return Invoke-WebRequest -Uri $Uri -Method $Method -UseBasicParsing -TimeoutSec 20
  } catch {
    $response = $_.Exception.Response
    if ($null -eq $response) {
      throw
    }
    return $response
  }
}

function Get-StatusCode {
  param($Response)

  return [int]$Response.StatusCode
}

function Assert-Status {
  param(
    [string]$Uri,
    [string]$Method,
    [int[]]$ExpectedStatuses
  )

  Write-CheckInfo "$Method $Uri"
  $response = Invoke-RemoteRequest -Uri $Uri -Method $Method
  $status = Get-StatusCode -Response $response
  if ($ExpectedStatuses -notcontains $status) {
    throw "Expected status $($ExpectedStatuses -join ',') from $Method $Uri, got $status"
  }
  return $response
}

function Assert-StatusOk {
  param([string]$Uri)

  return Assert-Status -Uri $Uri -Method "GET" -ExpectedStatuses @(200)
}

function Assert-Denied {
  param(
    [string]$Path,
    [string]$Method = "GET"
  )

  $uri = Join-Url -Root $BaseUrl -Path $Path
  Assert-Status -Uri $uri -Method $Method -ExpectedStatuses @(403, 404, 405) | Out-Null
}

$base = $BaseUrl.TrimEnd("/")
$homepageUrl = Join-Url -Root $base -Path "index.html"
$journeyUrl = Join-Url -Root $base -Path "journey.html?view=public"
$canvasUrl = Join-Url -Root $base -Path "api/homepage/canvas"

$homepage = Assert-StatusOk -Uri $homepageUrl
Assert-StatusOk -Uri $journeyUrl | Out-Null

$homepageText = [string]$homepage.Content
if ($homepageText -notmatch "2026013131" -or $homepageText -notmatch "36030202000491") {
  throw "Homepage filing text was not found."
}
if ($homepageText -notmatch [regex]::Escape("https://beian.mps.gov.cn/#/query/webSearch?code=36030202000491")) {
  throw "Homepage public security filing link was not found."
}
if ($homepageText -notmatch "留言" -or $homepageText -notmatch "暂未开放") {
  throw "Homepage message coming-soon entry was not found."
}
if ($homepageText -match "data-message-form" -or $homepageText -match "visitor-message-submit") {
  throw "Homepage exposed an enabled visitor message form."
}
if ($homepageText -match "留言会提交到服务器数据库" -or $homepageText -match "管理员登录后可查看") {
  throw "Homepage still contains obsolete visitor-message submission wording."
}

$canvasResponse = Assert-StatusOk -Uri $canvasUrl
$canvasText = [string]$canvasResponse.Content
if ($canvasText -match '"updated_by_user_id"') {
  throw "Public canvas response exposed updated_by_user_id."
}

$canvas = $canvasText | ConvertFrom-Json
foreach ($field in @("canvas_key", "schema_version", "canvas_data", "revision", "exists")) {
  if (-not ($canvas.PSObject.Properties.Name -contains $field)) {
    throw "Canvas response missing required field: $field"
  }
}
if ($canvas.revision -lt 0) {
  throw "Canvas revision must be non-negative."
}
if ($null -eq $canvas.exists) {
  throw "Canvas exists field must be present."
}

$mediaIds = New-Object System.Collections.Generic.List[int]
$json = $canvas.canvas_data | ConvertTo-Json -Depth 100
[regex]::Matches($json, '"mediaId"\s*:\s*"?([0-9]+)"?') | ForEach-Object {
  $mediaIds.Add([int]$_.Groups[1].Value)
}

if ($mediaIds.Count -gt 0) {
  $firstMediaId = ($mediaIds | Select-Object -First 1)
  $mediaUrl = Join-Url -Root $base -Path "api/homepage/media/$firstMediaId/file"
  $mediaResponse = Assert-StatusOk -Uri $mediaUrl
  if (-not $mediaResponse.Headers["Content-Type"]) {
    throw "Public media response did not include Content-Type."
  }
  Write-CheckInfo "Verified public media file for mediaId=$firstMediaId"
} else {
  Write-CheckInfo "Canvas contains no mediaId stickers; media file check skipped."
}

if ($HttpBaseUrl) {
  $httpResponse = Assert-Status -Uri (Join-Url -Root $HttpBaseUrl -Path "") -Method "GET" -ExpectedStatuses @(301, 302, 307, 308)
  $location = $httpResponse.Headers["Location"]
  if ($location -and $location -notmatch "^https://") {
    throw "HTTP redirect did not target HTTPS: $location"
  }
}

Write-Host "PUBLIC_POSITIVE_CHECK_PASS"

foreach ($path in @(
  "login.html",
  "hub.html",
  "debug-log.html",
  "apps/",
  "apps/tasks/",
  "apps/health/",
  "apps/messages/",
  "apps/admin-users/",
  "apps/homepage-admin/",
  "docs/",
  "scripts/",
  "backend/",
  ".git/",
  ".env",
  "data/uploads/",
  "not-a-real-file.txt",
  "api/auth/me",
  "api/debug/status",
  "api/messages",
  "api/messages/1",
  "api/admin/messages",
  "api/admin/data/summary",
  "api/dev/reset",
  "api/homepage/media",
  "api/homepage/media/1/admin-file",
  "api/homepage/items",
  "api/homepage/items/1",
  "api/homepage/publish-bundle/export",
  "api/unknown"
)) {
  Assert-Denied -Path $path
}

Assert-Denied -Path "api/homepage/media" -Method "POST"
Assert-Denied -Path "api/homepage/media/1" -Method "PATCH"
Assert-Denied -Path "api/homepage/canvas" -Method "PUT"
Assert-Denied -Path "api/homepage/canvas/reset" -Method "POST"
Assert-Denied -Path "api/homepage/publish-bundle/export" -Method "POST"
Assert-Denied -Path "api/messages" -Method "HEAD"
Assert-Denied -Path "api/messages" -Method "POST"
Assert-Denied -Path "api/messages" -Method "OPTIONS"
Assert-Denied -Path "api/messages" -Method "PUT"
Assert-Denied -Path "api/messages" -Method "PATCH"
Assert-Denied -Path "api/messages" -Method "DELETE"

Write-Host "PUBLIC_PRIVATE_ROUTE_DENY_CHECK_PASS"
Write-Host "PUBLIC_DEPLOYMENT_SURFACE_CHECK_PASS"
