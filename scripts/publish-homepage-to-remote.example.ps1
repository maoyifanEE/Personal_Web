param(
  [string]$RemoteHost = "REMOTE_HOST",
  [string]$RemoteUser = "REMOTE_USER",
  [string]$RemoteRepoPath = "REMOTE_REPO_PATH",
  [string]$RemoteBundlePath = "REMOTE_BUNDLE_PATH",
  [string]$Domain = "DOMAIN",
  [string]$SshKeyPath = "SSH_KEY_PATH"
)

$ErrorActionPreference = "Stop"

Write-Host "[homepage publish example] This is a placeholder example only."
Write-Host "[homepage publish example] Do not store real hosts, users, keys, or domains in this file."

$exportScript = ".\scripts\export-homepage-public-bundle.ps1"
$importScript = ".\scripts\import-homepage-public-bundle.ps1"
$healthScript = ".\scripts\check-remote-homepage-public.ps1"

Write-Host "[homepage publish example] Step 1: export locally."
Write-Host "$exportScript -CreateZip"

Write-Host "[homepage publish example] Step 2: upload bundle with scp or rsync."
Write-Host "scp -i $SshKeyPath -r .local_exports\homepage-publish-bundle-* $RemoteUser@$RemoteHost`:$RemoteBundlePath"

Write-Host "[homepage publish example] Step 3: dry-run remote import."
Write-Host "ssh -i $SshKeyPath $RemoteUser@$RemoteHost `"cd $RemoteRepoPath; $importScript -BundlePath $RemoteBundlePath -DryRun`""

Write-Host "[homepage publish example] Step 4: run real remote import after dry-run review."
Write-Host "ssh -i $SshKeyPath $RemoteUser@$RemoteHost `"cd $RemoteRepoPath; $importScript -BundlePath $RemoteBundlePath`""

Write-Host "[homepage publish example] Step 5: run public health check."
Write-Host "$healthScript -BaseUrl https://$Domain"

Write-Host "[homepage publish example] Step 6: final public URL."
Write-Host "https://$Domain/journey.html?view=public"
