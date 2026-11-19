<#
.SYNOPSIS
    Backs up the production database and Artwork volume into BACKUP_DIR.

.DESCRIPTION
    1. pg_dump (custom format) inside the postgres container, verified with pg_restore --list
       and the PGDMP header, then copied out as cardcreator_<timestamp>.dump.
    2. A tar.gz of the cardcreator_artwork_prod volume made by a helper container, verified
       with tar -t, saved as artwork_<timestamp>.tar.gz.
    3. Prunes both kinds of backup older than BACKUP_RETENTION_DAYS (default 14).

    Settings come from deploy/production.env. Runs daily from Task Scheduler and before every
    release (release.ps1). Exits non-zero if anything fails. See deploy/README.md.
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\common.ps1"
Set-Location $RepoRoot

$config = Read-ProductionEnv
$backupDir = Get-RequiredSetting $config 'BACKUP_DIR'
$database = Get-RequiredSetting $config 'POSTGRES_DB'
$user = Get-RequiredSetting $config 'POSTGRES_USER'
$retentionDays = 14
if ($config['BACKUP_RETENTION_DAYS']) { $retentionDays = [int]$config['BACKUP_RETENTION_DAYS'] }

New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupDir = (Resolve-Path $backupDir).Path
$stamp = Get-Date -Format 'yyyy-MM-dd_HHmmss'

Write-Step "[1/3] Dumping database $database"
Invoke-Checked 'Checking that postgres is running' {
    docker compose exec -T postgres pg_isready --username $user --dbname $database
}
$containerDump = '/tmp/cardcreator-backup.dump'
$dumpPath = Join-Path $backupDir "cardcreator_$stamp.dump"
try {
    Invoke-Checked 'pg_dump' {
        docker compose exec -T postgres pg_dump --username $user --dbname $database --format=custom --file $containerDump
    }
    Invoke-Checked 'Verifying the dump with pg_restore --list' {
        docker compose exec -T postgres pg_restore --list $containerDump
    } | Out-Null
    Invoke-Checked 'Copying the dump out of the container' {
        docker compose cp "postgres:$containerDump" "$dumpPath.partial"
    }
}
finally {
    $ErrorActionPreference = 'Continue'
    docker compose exec -T postgres rm -f $containerDump
    $ErrorActionPreference = 'Stop'
}

$header = New-Object byte[] 5
$stream = [System.IO.File]::OpenRead("$dumpPath.partial")
try { $read = $stream.Read($header, 0, 5) } finally { $stream.Dispose() }
if ($read -ne 5 -or [System.Text.Encoding]::ASCII.GetString($header) -ne 'PGDMP') {
    throw "$dumpPath.partial does not start with the PGDMP header. Treating this backup as failed."
}
Move-Item "$dumpPath.partial" $dumpPath
Write-Host "    Wrote $dumpPath ($([math]::Round((Get-Item $dumpPath).Length / 1KB)) KB)"

Write-Step "[2/3] Archiving the Artwork volume $ArtworkVolume"
$archiveName = "artwork_$stamp.tar.gz"
$archivePath = Join-Path $backupDir $archiveName
Invoke-Checked 'Archiving Artwork' {
    docker run --rm -v "${ArtworkVolume}:/data:ro" -v "${backupDir}:/backup" $HelperImage `
        tar czf "/backup/$archiveName.partial" -C /data .
}
Invoke-Checked 'Verifying the Artwork archive with tar -t' {
    docker run --rm -v "${backupDir}:/backup:ro" $HelperImage tar tzf "/backup/$archiveName.partial"
} | Out-Null
Move-Item "$archivePath.partial" $archivePath
Write-Host "    Wrote $archivePath ($([math]::Round((Get-Item $archivePath).Length / 1KB)) KB)"

Write-Step "[3/3] Pruning backups older than $retentionDays days in $backupDir"
$cutoff = (Get-Date).AddDays(-$retentionDays)
Get-ChildItem -Path $backupDir -File |
    Where-Object {
        ($_.Name -like 'cardcreator_*.dump' -or $_.Name -like 'artwork_*.tar.gz' -or $_.Name -like '*.partial') -and
        $_.LastWriteTime -lt $cutoff
    } |
    ForEach-Object {
        Write-Host "    Removing $($_.Name)"
        Remove-Item $_.FullName
    }

Write-Step 'Backup done'
