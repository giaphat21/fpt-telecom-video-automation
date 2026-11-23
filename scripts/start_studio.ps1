param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$launcher = Join-Path $PSScriptRoot 'launch_studio.js'
if ($NoBrowser) { node $launcher --no-browser } else { node $launcher }
exit $LASTEXITCODE
