$ErrorActionPreference = "Stop"

$checks = @(
  @{
    Path = "backend/app/api/routes/visitor_messages.py"
    Pattern = "@router\.get|@router\.patch|@router\.delete"
    Message = "Public visitor message router must expose create-only behavior."
    ShouldMatch = $false
  },
  @{
    Path = "backend/app/api/routes/admin_visitor_messages.py"
    Pattern = "prefix=`"/admin/messages`"|require_role\(`"admin`"\)|visitor_messages:read|visitor_messages:manage|require_csrf_token"
    Message = "Admin message router must use admin prefix, role, permissions, and CSRF."
    ShouldMatch = $true
  },
  @{
    Path = "backend/alembic/versions/20260712_0006_add_visitor_message_management.py"
    Pattern = "submitter_fingerprint|is_highlighted|highlighted_at|20260702_0005"
    Message = "Visitor message migration must add V1 management fields on the expected chain."
    ShouldMatch = $true
  },
  @{
    Path = "apps/messages/messages.js"
    Pattern = "innerHTML|localStorage|sessionStorage|document\.cookie"
    Message = "Messages admin UI must avoid innerHTML and browser persistence."
    ShouldMatch = $false
  },
  @{
    Path = "index.html"
    Pattern = "原型模式|提交留言（原型）|当前仅为前端原型"
    Message = "Public message modal must not describe the feature as a non-persistent prototype."
    ShouldMatch = $false
  }
)

foreach ($check in $checks) {
  $result = Select-String -Path $check.Path -Pattern $check.Pattern -AllMatches -ErrorAction SilentlyContinue
  if ($check.ShouldMatch -and -not $result) {
    throw $check.Message
  }
  if (-not $check.ShouldMatch -and $result) {
    $result | Select-Object Path, LineNumber, Line | Format-List
    throw $check.Message
  }
}

$schemaLeak = Select-String -Path "backend/app/schemas/visitor_message.py" -Pattern "submitter_fingerprint|submitterFingerprint" -ErrorAction SilentlyContinue
if ($schemaLeak) {
  $schemaLeak | Select-Object Path, LineNumber, Line | Format-List
  throw "Admin/public response schemas must not expose submitter fingerprints."
}

Write-Output "VISITOR_MESSAGES_V1_STATIC_CHECK_PASS"
