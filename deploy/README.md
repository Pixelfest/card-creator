# Deployment

Production runs on the Windows host with Docker Desktop (WSL 2). The owner's nginx terminates
TLS for `cards.heavyroad.nl` and proxies to `127.0.0.1:8100`. There is no staging environment.
The decisions behind this are in [`docs/spec.md`, section 13](../docs/spec.md#13-deployment).

| File | Purpose |
|---|---|
| `../docker-compose.yml` | `app` (built from this clone) and `postgres:17-alpine` |
| `production.env.example` | Template for the gitignored `production.env` (all secrets) |
| `release.ps1` | Backup, check out, build, start, health check |
| `backup.ps1` | Database dump and Artwork archive, verified and pruned |
| `restore.ps1` | Puts a backup back |
| `nginx.example.conf` | The nginx site, including `X-Forwarded-For` |

All scripts run from any directory, in Windows PowerShell 5.1 or PowerShell 7, and exit
non-zero on failure.

## First deploy

1. Clone the repository on the server.
2. Copy `deploy\production.env.example` to `deploy\production.env` and fill in every
   `REPLACE_ME`. The Postgres password appears twice. `BACKUP_DIR` is a Windows path.
3. Add the site from `nginx.example.conf` to nginx and reload it.
4. Run the release:

   ```powershell
   .\deploy\release.ps1
   ```

5. Check that `https://cards.heavyroad.nl/health` returns `Healthy`.

## Releasing

```powershell
.\deploy\release.ps1              # deploys main
.\deploy\release.ps1 -Ref v1.2.0  # a branch, tag or commit
```

The script refuses a dirty working tree, fetches and checks out the ref, takes a backup, runs
`docker compose build` and `up -d`, and waits up to 60 s for `/health`. Database migrations
apply on app startup.

If the health check fails, the script prints the app's logs and the commands to return to the
previous version with the backup it just took. There is no automatic rollback.

## Daily backup

`backup.ps1` writes two files to `BACKUP_DIR` and deletes both kinds older than
`BACKUP_RETENTION_DAYS` (default 14):

- `cardcreator_<timestamp>.dump`: `pg_dump --format=custom`, checked with `pg_restore --list`.
- `artwork_<timestamp>.tar.gz`: the `cardcreator_artwork_prod` volume, checked with `tar -t`.

Register it once with Task Scheduler, from an elevated PowerShell in the clone. Docker Desktop
runs per user, so the task runs as the user that runs Docker Desktop:

```powershell
$clone = (Get-Location).Path
$action = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$clone\deploy\backup.ps1`"" `
    -WorkingDirectory $clone
$trigger = New-ScheduledTaskTrigger -Daily -At 3:30am
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$cred = Get-Credential "$env:USERDOMAIN\$env:USERNAME"
Register-ScheduledTask -TaskName 'Card Creator backup' -Action $action -Trigger $trigger `
    -Settings $settings -User $cred.UserName -Password $cred.GetNetworkCredential().Password
```

With the password the task runs whether or not the user is logged on.

To check it: run it once with `Start-ScheduledTask -TaskName 'Card Creator backup'`, then
`Get-ScheduledTaskInfo -TaskName 'Card Creator backup'` shows `LastTaskResult` `0` and the two
new files are in `BACKUP_DIR`.

## Restoring

Restoring replaces production data. Pick the backup files, check out the version of the app
that matches them, and run:

```powershell
git checkout <commit>
.\deploy\restore.ps1 -Dump "<BACKUP_DIR>\cardcreator_<timestamp>.dump" `
    -Artwork "<BACKUP_DIR>\artwork_<timestamp>.tar.gz"
```

The script asks you to type `RESTORE`, stops the app, restores the database with
`pg_restore --clean`, empties the Artwork volume and unpacks the archive into it, then builds
and starts the app from the checkout. Leave out `-Artwork` to restore only the database.

Then check `/health`, and run `git checkout main` before the next release.

## Forwarded headers

The Collection allowlist needs each visitor's real IP. nginx sends it in `X-Forwarded-For`. The
app trusts that header only from the compose network `172.30.42.0/24` (the `networks` section of
`docker-compose.yml` and `ForwardedHeaders:TrustedNetworks` in `appsettings.Production.json`
must match), since that network's gateway is where proxied requests arrive from. If that subnet
clashes with another Docker network on the host, change both.
