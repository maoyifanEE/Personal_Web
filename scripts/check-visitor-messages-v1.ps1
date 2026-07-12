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

Assert-Pattern `
  -Path "apps/messages/index.html" `
  -Pattern "data-message-delete-dialog" `
  -Message "Messages admin UI must include a dedicated delete confirmation dialog."

Assert-Pattern `
  -Path "apps/messages/index.html" `
  -Pattern "data-message-detail" `
  -Message "Messages admin UI must keep the detail dialog separate from delete confirmation."

Assert-Pattern `
  -Path "apps/messages/index.html" `
  -Pattern "data-message-delete-summary|data-message-delete-cancel|data-message-delete-confirm" `
  -Message "Delete confirmation dialog must expose summary, cancel, and confirm controls."

Assert-Pattern `
  -Path "apps/messages/messages.js" `
  -Pattern "openDeleteConfirmation" `
  -Message "Row delete action must open the delete confirmation flow."

$messagesJs = Get-Content -Path "apps/messages/messages.js" -Raw
$renderListBody = [regex]::Match(
  $messagesJs,
  "const renderList = \(\) => \{(?<body>[\s\S]*?)const initialize = async"
).Groups["body"].Value
if ($renderListBody -match "softDeleteMessage") {
  throw "Row rendering must not directly call softDeleteMessage before confirmation."
}

Assert-RawPattern `
  -Path "apps/messages/messages.js" `
  -Pattern "deleteConfirmButton\?\.addEventListener\(`"click`"[\s\S]*softDeleteMessage" `
  -Message "Delete confirm handler must be the point that calls softDeleteMessage."

Assert-RawPattern `
  -Path "apps/messages/messages.js" `
  -Pattern "deleteCancelButtons\.forEach[\s\S]*closeDeleteDialog" `
  -Message "Delete confirmation dialog must include a cancel path."

Assert-RawPattern `
  -Path "apps/messages/messages.js" `
  -Pattern "setDeleteDialogPending[\s\S]*deleteConfirmButton\.disabled = pending[\s\S]*state\.deletePending \|\| !state\.pendingDeleteMessage[\s\S]*setDeleteDialogPending\(true\)" `
  -Message "Delete confirmation must guard against duplicate pending submits."

Assert-RawPattern `
  -Path "apps/messages/messages.js" `
  -Pattern "const isDeleted = Boolean\(message\.deletedAt\)[\s\S]*const canMutate = state\.canManage && !isDeleted" `
  -Message "Deleted-message detail mutations must use deletedAt in their disabled/read-only condition."

Assert-RawPattern `
  -Path "apps/messages/messages.js" `
  -Pattern "noteInput\.(readOnly|disabled) = !canMutate[\s\S]*noteInput\.(readOnly|disabled) = !canMutate" `
  -Message "Deleted-message detail note input must be read-only or disabled."

Assert-RawPattern `
  -Path "apps/messages/messages.js" `
  -Pattern "isDeleted && state\.canManage[\s\S]*restoreMessage" `
  -Message "Deleted-message detail must offer restore when the admin can manage."

Assert-RawPattern `
  -Path "backend/app/schemas/visitor_message.py" `
  -Pattern "has_admin_note_update = `"admin_note`" in self\.model_fields_set" `
  -Message "Admin-note schema validation must use field-presence semantics."

Assert-RawPattern `
  -Path "backend/app/schemas/visitor_message.py" `
  -Pattern "if not has_status_update and not has_highlight_update and not has_admin_note_update" `
  -Message "Empty admin PATCH must remain invalid."

Assert-NoPattern `
  -Path "index.html" `
  -Pattern "front-end prototype|non-persistent|not saved" `
  -Message "Public message modal must not describe the feature as a non-persistent prototype."

Assert-RawPattern `
  -Path "script.js" `
  -Pattern "visitorMessagesEnabled: false" `
  -Message "Public homepage must mark visitor messages disabled."

Assert-RawPattern `
  -Path "script.js" `
  -Pattern '"message-entry": \{' `
  -Message "Public homepage must route message entry to the coming-soon dialog."

Assert-NoPattern `
  -Path "script.js" `
  -Pattern "/messages" `
  -Message "Public homepage script must not submit visitor messages while disabled."

Assert-NoPattern `
  -Path "index.html" `
  -Pattern "data-message-form|visitor-message-submit" `
  -Message "Public homepage must not expose the visitor message form or obsolete submission copy."

Assert-NoPattern `
  -Path "deploy/nginx/personal-web-public.conf.example" `
  -Pattern "location = /api/messages|proxy_pass http://127\.0\.0\.1:8000/api/messages;" `
  -Message "Public Nginx template must not expose /api/messages while disabled."

Write-Output "VISITOR_MESSAGES_V1_STATIC_CHECK_PASS"
