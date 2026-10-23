$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
py -3 -m venv .venv
if ($LASTEXITCODE -ne 0) { throw 'Instale Python 3.11+ x64.' }
& .\.venv\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências Python.' }
Push-Location frontend
try { npm ci; if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências Node.' } } finally { Pop-Location }
& "$PSScriptRoot\download-model.ps1"
if (!(Test-Path .env)) { Copy-Item .env.example .env }
