<#
.SYNOPSIS
    Restores the production database (and optionally the Artwork volume) from backup.ps1 files.

.DESCRIPTION
    Stops the app, replaces the database contents with the dump, optionally replaces the
    Artwork volume with the archive, then builds and starts the app from the current checkout.
    Check out the version that matches the backup first (release.ps1 prints the commit when a
    release fails). This overwrites production data, so it asks for confirmation unless -Force.

.EXAMPLE
    .\deploy\restore.ps1 -Dump D:\Backups\cardcreator\cardcreator_2026-11-19_030000.dump `
        -Artwork D:\Backups\cardcreator\artwork_2026-11-19_030000.tar.gz
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Dump,
    [string]$Artwork,
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"
Set-Location $RepoRoot

$config = Read-ProductionEnv
$database = Get-RequiredSetting $config 'POSTGRES_DB'
$user = Get-RequiredSetting $config 'POSTGRES_USER'

$Dump = (Resolve-Path $Dump).Path
if ($Artwork) { $Artwork = (Resolve-Path $Artwork).Path }

if (-not $Force) {
    Write-Host "This replaces the production database with $Dump"
    if ($Artwork) { Write-Host "and the Artwork volume with $Artwork" }
    $answer = Read-Host "Type RESTORE to continue"
    if ($answer -cne 'RESTORE') { throw 'Restore cancelled.' }
}

Write-Step 'Stopping the app'
Invoke-Checked 'Stopping the app' { docker compose stop app }

Write-Step "Restoring database $database"
Invoke-Checked 'Starting postgres' { docker compose up -d --wait postgres }
$containerDump = '/tmp/cardcreator-restore.dump'
try {
    Invoke-Checked 'Copying the dump into the container' { docker compose cp $Dump "postgres:$containerDump" }
    Invoke-Checked 'pg_restore' {
        docker compose exec -T postgres pg_restore --username $user --dbname $database --clean --if-exists --no-owner --single-transaction $containerDump
    }
}
finally {
    $ErrorActionPreference = 'Continue'
    docker compose exec -T postgres rm -f $containerDump
    $ErrorActionPreference = 'Stop'
}

if ($Artwork) {
    Write-Step "Restoring the Artwork volume $ArtworkVolume"
    $archiveDir = Split-Path -Parent $Artwork
    $archiveName = Split-Path -Leaf $Artwork
    Invoke-Checked 'Restoring Artwork' {
        docker run --rm -v "${ArtworkVolume}:/data" -v "${archiveDir}:/backup:ro" $HelperImage `
            sh -c "find /data -mindepth 1 -delete && tar xzf '/backup/$archiveName' -C /data"
    }
}

Write-Step 'Building and starting the app from the current checkout'
Invoke-Checked 'docker compose up' { docker compose up -d --build }
Write-Step 'Restore done'
