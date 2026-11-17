param([ValidateSet('app','proxy')][string]$Mode='app')
$ErrorActionPreference='Stop'
$projectRoot=Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$logPath=Join-Path $projectRoot ("var/logs/" + $Mode + ".log")
[IO.Directory]::CreateDirectory((Split-Path -Parent $logPath)) | Out-Null
if ((Test-Path -LiteralPath $logPath) -and (Get-Item -LiteralPath $logPath).Length -gt 20MB) {
    Move-Item -LiteralPath $logPath -Destination ($logPath+'.previous') -Force
}
if ($Mode -eq 'app') {
    $settings=Get-Content -LiteralPath 'var/deploy/service.json' -Raw | ConvertFrom-Json
    & $settings.nodePath src/server.js *>> $logPath
} else {
    # Caddy certificates and state must survive reboots and updates.
    $env:XDG_DATA_HOME=Join-Path $projectRoot 'var/caddy/data'
    $env:XDG_CONFIG_HOME=Join-Path $projectRoot 'var/caddy/config'
    & runtime/caddy/caddy.exe run --config var/deploy/Caddyfile --adapter caddyfile *>> $logPath
}
exit $LASTEXITCODE
