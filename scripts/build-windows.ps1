param([switch]$EngineOnly)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
& $python -m pip install pyinstaller
if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar PyInstaller.' }
Push-Location frontend
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw 'Build frontend falhou.' }
    npm run tauri -- icon src-tauri/icons/mark.svg --output src-tauri/icons/generated
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao gerar ícones.' }
} finally { Pop-Location }
& $python -m PyInstaller --noconfirm --onefile --name pulso-engine --paths . --additional-hooks-dir scripts/hooks --collect-all vosk --collect-all sounddevice --hidden-import _sounddevice_data --hidden-import webrtcvad --collect-submodules uvicorn --add-data 'frontend/dist;frontend/dist' backend/launch.py
if ($LASTEXITCODE -ne 0) { throw 'Build do motor falhou.' }
New-Item -ItemType Directory -Force frontend/src-tauri/binaries | Out-Null
Copy-Item dist/pulso-engine.exe frontend/src-tauri/binaries/pulso-engine-x86_64-pc-windows-msvc.exe -Force
if (!$EngineOnly) {
    if (!(Get-Command cargo -ErrorAction SilentlyContinue)) { throw 'Instale Rust estável MSVC e Microsoft C++ Build Tools para gerar o instalador Tauri.' }
    Push-Location frontend
    try { npm run tauri -- build; if ($LASTEXITCODE -ne 0) { throw 'Build Tauri falhou.' } } finally { Pop-Location }
}


