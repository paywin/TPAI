$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
$modelRoot = Join-Path $projectRoot 'models'
New-Item -ItemType Directory -Force $modelRoot | Out-Null
$archive = Join-Path $modelRoot 'vosk-pt.zip'
Invoke-WebRequest 'https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip' -OutFile $archive
Expand-Archive -LiteralPath $archive -DestinationPath $modelRoot -Force
Remove-Item -LiteralPath $archive
Write-Host 'Modelo português instalado.'
