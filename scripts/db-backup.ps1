$ErrorActionPreference = "Stop"
$ts = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $PSScriptRoot "..\backups"
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
Write-Host "Prepare pg_dump execution here using DATABASE_URL environment variable."
Write-Host ("Suggested target: " + (Join-Path $backupDir ("marketplace-" + $ts + ".sql")))
Write-Host "Retention policy: keep last 7 daily backups."