$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
node scripts/validate_project.js
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
node src/server.js
