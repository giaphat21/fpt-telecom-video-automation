param(
    [Parameter(Mandatory=$true)][ValidatePattern('^(?=.{4,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$')][string]$Domain,
    [ValidatePattern('^[a-zA-Z0-9_-]{3,40}$')][string]$AdminUser = 'admin'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$envPath = Join-Path $projectRoot '.env'
$nodePath = (Get-Command node -ErrorAction Stop).Source
$password = Read-Host 'Mat khau dang nhap web (it nhat 16 ky tu)' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
try {
    $plainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($plainPassword.Length -lt 16) { throw 'Password must contain at least 16 characters.' }
    $processInfo = New-Object Diagnostics.ProcessStartInfo
    $processInfo.FileName = $nodePath
    $processInfo.Arguments = '"' + (Join-Path $PSScriptRoot 'hash_password.js') + '"'
    $processInfo.UseShellExecute = $false
    $processInfo.CreateNoWindow = $true
    $processInfo.RedirectStandardInput = $true
    $processInfo.RedirectStandardOutput = $true
    $processInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($processInfo)
    $process.StandardInput.WriteLine($plainPassword)
    $process.StandardInput.Close()
    $passwordHash = $process.StandardOutput.ReadToEnd().Trim()
    $errorText = $process.StandardError.ReadToEnd()
    $process.WaitForExit()
    if ($process.ExitCode -ne 0 -or $passwordHash -notmatch '^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$') { throw "Password setup failed: $errorText" }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    $plainPassword = $null
    $password.Dispose()
}
$settings = [ordered]@{
    FPT_WEB_MODE='1'; FPT_PUBLIC_URL="https://$Domain"; FPT_ADMIN_USER=$AdminUser
    FPT_ADMIN_PASSWORD_HASH=$passwordHash; FPT_STUDIO_HOST='127.0.0.1'; FPT_STUDIO_PORT='3457'
    FPT_MAX_UPLOAD_MB='2048'; FPT_RENDER_THREADS='4'
}
$existing = @()
if (Test-Path -LiteralPath $envPath) {
    Copy-Item -LiteralPath $envPath -Destination ($envPath + '.backup.' + (Get-Date -Format 'yyyyMMddHHmmss'))
    $existing = @(Get-Content -LiteralPath $envPath | Where-Object {
        $lineKey = ($_ -split '=',2)[0].Trim()
        -not $settings.Contains($lineKey)
    })
}
$content = @($existing) + @($settings.GetEnumerator() | ForEach-Object { $_.Key + '=' + $_.Value })
[IO.File]::WriteAllLines($envPath, [string[]]$content, [Text.UTF8Encoding]::new($false))
$caddyTemplate = Get-Content -LiteralPath (Join-Path $projectRoot 'config/Caddyfile.example') -Raw
$generated = Join-Path $projectRoot 'var/deploy'
[IO.Directory]::CreateDirectory($generated) | Out-Null
[IO.File]::WriteAllText((Join-Path $generated 'Caddyfile'), $caddyTemplate.Replace('__DOMAIN__',$Domain), [Text.UTF8Encoding]::new($false))
Write-Host "Configured https://$Domain. Password is stored only as a salted scrypt hash."
Write-Host 'Run scripts/server/install_windows_server.ps1 as Administrator on the VPS.'
