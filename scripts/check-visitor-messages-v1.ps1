$ErrorActionPreference = "Stop"

function Assert-Pattern {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Message
  )

  $result = Select-String -Path $Path -Pattern $Pattern -AllMatches -ErrorAction SilentlyContinue
  if (-not $result) {
    throw $Message
  }
}

function Assert-NoPattern {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Message
  )

  $result = Select-String -Path $Path -Pattern $Pattern -AllMatches -ErrorAction SilentlyContinue
  if ($result) {
    $result | Select-Object Path, LineNumber, Line | Format-List
    throw $Message
  }
}

function Assert-RawPattern {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$Message
  )

  $content = Get-Content -Path $Path -Raw
  if ($content -notmatch $Pattern) {
    throw $Message
  }
}

Assert-NoPattern `
  -Path "backend/app/api/routes/visitor_messages.py" `
  -Pattern "@router\.(get|patch|delete)" `
  -Message "Public visitor message router must expose create-only behavior."

Assert-Pattern `
  -Path "backend/app/api/routes/visitor_messages.py" `
  -Pattern "status_code=status\.HTTP_201_CREATED" `
  -Message "Public visitor message create must return HTTP 201 Created."

Assert-RawPattern `
  -Path "backend/app/schemas/visitor_message.py" `
  -Pattern "class VisitorMessageCreate\(BaseModel\):[\s\S]*ConfigDict\(extra=`"forbid`"\)" `
  -Message "Public visitor message request schema must forbid unknown fields."

$createSchema = Get-Content -Path "backend/app/schemas/visitor_message.py" -Raw
$createBody = [regex]::Match(
  $createSchema,
  "class VisitorMessageCreate\(BaseModel\):(?<body>[\s\S]*?)class VisitorMessagePublicAcceptedResponse"
).Groups["body"].Value
if ($createBody -match "data_scope|status|is_highlighted|source_app|submitter_fingerprint") {
  throw "Public visitor message create schema must not expose internal management fields."
}

Assert-RawPattern `
  -Path "backend/app/services/visitor_message_service.py" `
  -Pattern "if settings\.app_env == `"production`":[\s\S]*DataScope\.PRODUCTION\.value[\s\S]*DataScope\.TEST\.value" `
  -Message "Server must derive public data_scope as production only in production and test otherwise."

Assert-Pattern `
  -Path "backend/app/services/visitor_message_service.py" `
  -Pattern "VisitorMessageDeletedConflictError" `
  -Message "Normal admin update must reject soft-deleted visitor messages."

Assert-Pattern `
  -Path "backend/app/services/visitor_message_service.py" `
  -Pattern "VisitorMessageActiveConflictError" `
  -Message "Restore must reject active visitor messages."

Assert-Pattern `
  -Path "backend/app/api/routes/admin_visitor_messages.py" `
  -Pattern "status_code=409" `
  -Message "Admin route must map lifecycle conflicts to HTTP 409."

Assert-NoPattern `
  -Path "backend/app/services/visitor_message_service.py" `
  -Pattern "visitor_message\.admin_update" `
  -Message "Generic visitor_message.admin_update audit action must not remain."

Assert-Pattern `
  -Path "backend/app/services/visitor_message_service.py" `
  -Pattern "visitor_message\.status_update" `
  -Message "Specific status audit action is required."

Assert-Pattern `
  -Path "backend/app/services/visitor_message_service.py" `
  -Pattern "visitor_message\.highlight_update" `
  -Message "Specific highlight audit action is required."

Assert-Pattern `
  -Path "backend/app/services/visitor_message_service.py" `
  -Pattern "visitor_message\.admin_note_update" `
  -Message "Specific admin-note audit action is required."

Assert-NoPattern `
  -Path "backend/app/schemas/visitor_message.py" `
  -Pattern "submitter_fingerprint|submitterFingerprint" `
  -Message "Admin/public response schemas must not expose submitter fingerprints."

Assert-NoPattern `
  -Path "apps/messages/messages.js" `
  -Pattern "innerHTML|localStorage|sessionStorage|document\.cookie" `
  -Message "Messages admin UI must avoid innerHTML and browser persistence."

Assert-NoPattern `
  -Path "index.html" `
  -Pattern "front-end prototype|non-persistent|not saved" `
  -Message "Public message modal must not describe the feature as a non-persistent prototype."

Write-Output "VISITOR_MESSAGES_V1_STATIC_CHECK_PASS"
