#Requires -RunAsAdministrator
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
Set-Location -LiteralPath $projectRoot
foreach ($file in @('.env','var/deploy/Caddyfile','runtime/caddy/caddy.exe')) {
    if (!(Test-Path -LiteralPath (Join-Path $projectRoot $file))) { throw "Missing $file. Run configure_web.ps1 first." }
}
$nodePath = (Get-Command node -ErrorAction Stop).Source
$nodeVersion = & $nodePath -p 'Number(process.versions.node.split(".")[0])'
if ([int]$nodeVersion -lt 22) { throw 'Install Node.js LTS 22.16+ (recommended 24 LTS).' }
git lfs pull
if ($LASTEXITCODE -ne 0) { throw 'git lfs pull failed. Authenticate the private repository first.' }
npm ci
if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
node scripts/validate_project.js
if ($LASTEXITCODE -ne 0) { throw 'Project validation failed.' }
& runtime/caddy/caddy.exe validate --config var/deploy/Caddyfile --adapter caddyfile
if ($LASTEXITCODE -ne 0) { throw 'Caddy configuration invalid.' }
foreach ($directory in @('var/logs','var/cache','var/caddy','output')) { [IO.Directory]::CreateDirectory((Join-Path $projectRoot $directory)) | Out-Null }
# App/service account can read code and write only media and runtime state.
& icacls.exe $projectRoot /grant '*S-1-5-19:(OI)(CI)RX' /T /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant project read permissions.' }
foreach ($directory in @('assets','var','output')) {
    & icacls.exe (Join-Path $projectRoot $directory) /grant '*S-1-5-19:(OI)(CI)M' /T /Q | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not grant write permissions: $directory" }
}
$nodeConfig = @{ nodePath=$nodePath } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $projectRoot 'var/deploy/service.json'),$nodeConfig,[Text.UTF8Encoding]::new($false))
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount -RunLevel Limited
$trigger = New-ScheduledTaskTrigger -AtStartup
$taskSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
foreach ($mode in @('app','proxy')) {
    $taskName = if ($mode -eq 'app') { 'FPT Video Studio' } else { 'FPT Video HTTPS' }
    $arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + (Join-Path $PSScriptRoot 'run_web.ps1') + '" -Mode ' + $mode
    $action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -Argument $arguments -WorkingDirectory $projectRoot
    Register-ScheduledTask -TaskName $taskName -Action $action -Principal $principal -Trigger $trigger -Settings $taskSettings -Force | Out-Null
}
# Only the HTTPS proxy is exposed; Node stays on 127.0.0.1.
if (!(Get-NetFirewallRule -DisplayName 'FPT Video HTTPS' -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName 'FPT Video HTTPS' -Direction Inbound -Protocol TCP -LocalPort 80,443 -Action Allow | Out-Null
}
Start-ScheduledTask -TaskName 'FPT Video Studio'
Start-ScheduledTask -TaskName 'FPT Video HTTPS'
Write-Host 'Startup tasks installed under Local Service. Open the configured HTTPS domain and sign in.'
Write-Host 'DNS A record and cloud firewall TCP 80/443 must point to this VPS. Restrict RDP to your IP.'
