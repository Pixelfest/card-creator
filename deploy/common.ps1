# Shared helpers for release.ps1, backup.ps1 and restore.ps1. Dot-source it; not meant to be
# run on its own. Works in Windows PowerShell 5.1 (what Task Scheduler runs) and PowerShell 7.

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ProductionEnvPath = Join-Path $RepoRoot 'deploy\production.env'
$ArtworkVolume = 'cardcreator_artwork_prod'
$HelperImage = 'alpine:3.22'

function Write-Step([string]$Message) {
    Write-Host "==> $Message" -ForegroundColor Cyan
}

# Runs a native command and throws if it exits non-zero. Native stderr is not an error by
# itself (docker writes progress there), so the error preference is relaxed while it runs.
function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)][string]$Description,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        & $Command
    }
    finally {
        $ErrorActionPreference = $previous
    }
    if ($LASTEXITCODE -ne 0) {
        throw "$Description failed (exit code $LASTEXITCODE)."
    }
}

# Reads deploy/production.env (KEY=VALUE lines, # comments) into a hashtable.
function Read-ProductionEnv {
    if (-not (Test-Path $ProductionEnvPath)) {
        throw "Missing $ProductionEnvPath. Copy deploy\production.env.example to deploy\production.env and fill it in."
    }
    $values = @{}
    foreach ($line in Get-Content $ProductionEnvPath) {
        $trimmed = $line.Trim()
        if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
        $separator = $trimmed.IndexOf('=')
        if ($separator -lt 1) { continue }
        $key = $trimmed.Substring(0, $separator).Trim()
        $value = $trimmed.Substring($separator + 1).Trim()
        if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
            $value = $value.Substring(1, $value.Length - 2)
        }
        $values[$key] = $value
    }
    return $values
}

function Get-RequiredSetting([hashtable]$Config, [string]$Key) {
    $value = $Config[$Key]
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "$Key is not set in $ProductionEnvPath."
    }
    return $value
}
