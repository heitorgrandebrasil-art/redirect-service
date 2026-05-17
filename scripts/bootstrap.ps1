<#
Bootstrap script for Windows development environment.
Run from project root in PowerShell (as user):
    .\scripts\bootstrap.ps1
#>

Set-StrictMode -Version Latest

Write-Host "Starting bootstrap..." -ForegroundColor Cyan

$envFile = Join-Path -Path (Get-Location) -ChildPath ".env"
if (-not (Test-Path $envFile)) {
    Copy-Item -Path .env.example -Destination .env -Force
    Write-Host "Copied .env.example -> .env"
} else {
    Write-Host ".env already exists"
}

Write-Host "Bringing up Docker Compose..."
docker compose up -d --build

# wait for db container
$retries = 30
$waitSeconds = 2
$dbId = ""
for ($i = 0; $i -lt $retries; $i++) {
    $dbId = docker compose ps -q db
    if ($dbId -and $dbId.Trim() -ne "") { break }
    Start-Sleep -Seconds $waitSeconds
}

if (-not $dbId) {
    Write-Error "Could not determine db container id. Check 'docker compose ps' output."; exit 1
}

Write-Host "DB container id: $dbId"

Write-Host "Waiting for Postgres to be ready..."
$ready = $false
for ($i = 0; $i -lt $retries; $i++) {
    docker exec $dbId pg_isready -U rs_user -d redirect_service > $null 2>&1
    if ($LASTEXITCODE -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds $waitSeconds
}

if (-not $ready) {
    Write-Error "Postgres did not become ready in time."; exit 1
}

if (Test-Path schema.sql) {
    Write-Host "Copying schema.sql to container and applying..."
    docker cp .\schema.sql ${dbId}:/schema.sql
    docker exec -i $dbId psql -U rs_user -d redirect_service -f /schema.sql
    Write-Host "Schema applied (if any)."
} else {
    Write-Host "No schema.sql found; skipping schema import." -ForegroundColor Yellow
}

Write-Host "Bootstrap complete." -ForegroundColor Green
Write-Host "Services: WordPress http://localhost:8000, Adminer http://localhost:8080, API http://localhost:4000/api/v1"
