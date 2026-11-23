# Dot-source in PowerShell:  . .\.claude\video-skills-env.ps1
# Adds the project-local runtimes used by .claude/skills to this shell only.
$r = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$env:PATH = "$r\var\video-skills\python;$r\var\video-skills\node\node_modules\.bin;$r\node_modules\ffmpeg-static;$r\node_modules\ffprobe-static\bin\win32\x64;$env:PATH"
$env:PYTHONUTF8 = '1'; $env:PYTHONDONTWRITEBYTECODE = '1'
$env:MOTION_NODE_MODULES = "$r\var\video-skills\node\node_modules"
$env:MOTION_CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
