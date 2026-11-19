<#
.SYNOPSIS
    Deploys a version of Card Creator on the production host.

.DESCRIPTION
    1. Refuses to run if the working tree is dirty.
    2. git fetch, then checks out main (or -Ref: a branch, tag or commit).
    3. Runs backup.ps1 (skipped on the very first deploy, when postgres is not running yet).
    4. docker compose build and up -d.
    5. Polls /health for up to about 60 seconds. On failure it prints the app logs and the
       commands to go back to the previous version, and exits non-zero.

    There is no automatic rollback. See deploy/README.md.

.EXAMPLE
    .\deploy\release.ps1
    .\deploy\release.ps1 -Ref v1.2.0
#>
[CmdletBinding()]
param(
    [string]$Ref = 'main'
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"
Set-Location $RepoRoot

$healthUrl = 'http://127.0.0.1:8100/health'
$healthTimeoutSeconds = 60

Write-Step '[1/5] Checking the working tree'
$dirty = Invoke-Checked 'git status' { git status --porcelain }
if ($dirty) {
    $dirty | ForEach-Object { Write-Host "    $_" }
    throw 'The working tree has uncommitted changes. Commit, stash or discard them first.'
}
$config = Read-ProductionEnv
$backupDir = Get-RequiredSetting $config 'BACKUP_DIR'
$previousCommit = Invoke-Checked 'git rev-parse' { git rev-parse HEAD }

Write-Step "[2/5] Fetching and checking out $Ref"
Invoke-Checked 'git fetch' { git fetch --prune --tags origin }
$ErrorActionPreference = 'Continue'
git rev-parse --verify --quiet "refs/remotes/origin/$Ref" | Out-Null
$isRemoteBranch = $LASTEXITCODE -eq 0
$ErrorActionPreference = 'Stop'
if ($isRemoteBranch) {
    Invoke-Checked "git checkout $Ref" { git checkout $Ref }
    Invoke-Checked "Fast-forwarding $Ref" { git merge --ff-only "origin/$Ref" }
}
else {
    Invoke-Checked "git checkout $Ref" { git checkout --detach $Ref }
}
$newCommit = Invoke-Checked 'git log' { git log -1 --format='%h %s' }
Write-Host "    Now at $newCommit (was $($previousCommit.Substring(0, 7)))"

Write-Step '[3/5] Backing up'
$running = Invoke-Checked 'docker compose ps' { docker compose ps --status running --services }
$backupTaken = $false
if ($running -contains 'postgres') {
    & "$PSScriptRoot\backup.ps1"
    $backupTaken = $true
}
else {
    Write-Host '    Postgres is not running (first deploy?): nothing to back up.'
}

Write-Step '[4/5] Building and starting'
Invoke-Checked 'docker compose build' { docker compose build }
Invoke-Checked 'docker compose up' { docker compose up -d }

Write-Step "[5/5] Waiting up to $healthTimeoutSeconds s for $healthUrl"
$deadline = (Get-Date).AddSeconds($healthTimeoutSeconds)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) { $healthy = $true; break }
    }
    catch {
        # Not up yet.
    }
    Start-Sleep -Seconds 2
}

if ($healthy) {
    Write-Step "Release done: $newCommit is healthy"
    exit 0
}

Write-Host ''
Write-Host "Release FAILED: $healthUrl did not return 200 within $healthTimeoutSeconds s." -ForegroundColor Red
Write-Host '--- docker compose logs app (last 100 lines) ---'
$ErrorActionPreference = 'Continue'
docker compose logs --tail 100 app
docker compose ps
$ErrorActionPreference = 'Stop'
Write-Host '------------------------------------------------'
Write-Host ''
Write-Host 'There is no automatic rollback. To go back to the previous version and its data:' -ForegroundColor Yellow
Write-Host "    git checkout $previousCommit"
if ($backupTaken) {
    $dump = Get-ChildItem -Path $backupDir -Filter 'cardcreator_*.dump' | Sort-Object Name | Select-Object -Last 1
    $archive = Get-ChildItem -Path $backupDir -Filter 'artwork_*.tar.gz' | Sort-Object Name | Select-Object -Last 1
    Write-Host "    .\deploy\restore.ps1 -Dump `"$($dump.FullName)`" -Artwork `"$($archive.FullName)`""
}
else {
    Write-Host '    docker compose up -d --build'
    Write-Host '    (No backup was taken: this was the first deploy.)'
}
exit 1
