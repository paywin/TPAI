$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location $projectRoot
$python = Join-Path $projectRoot '.venv\Scripts\python.exe'
if (!(Test-Path $python)) { throw 'Execute scripts/setup.ps1 primeiro.' }
$engine = Start-Process -FilePath $python -ArgumentList '-m','backend.launch' -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru
try {
    Set-Location (Join-Path $projectRoot 'frontend')
    npm run dev
} finally {
    if (!$engine.HasExited) { Stop-Process -Id $engine.Id }
    Set-Location $projectRoot
}
