"""Install official Portuguese Vosk model without depending on PowerShell/unzip."""
import os
import tempfile
import urllib.request
import zipfile
from pathlib import Path
from dotenv import load_dotenv
ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')
model = Path(os.getenv('VOSK_MODEL_PATH', 'models/vosk-model-small-pt-0.3'))
if not model.is_absolute():
    model = ROOT / model
if ((model / 'am' / 'final.mdl').exists() or (model / 'final.mdl').exists()):
    print('Modelo Vosk já instalado.')
else:
    if model.name != 'vosk-model-small-pt-0.3':
        raise SystemExit('Instale o modelo personalizado em VOSK_MODEL_PATH ou use o modelo padrão.')
    model.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as temp:
        archive = Path(temp) / 'model.zip'
        print('Baixando modelo português oficial (~31 MB)…', flush=True)
        urllib.request.urlretrieve('https://alphacephei.com/vosk/models/vosk-model-small-pt-0.3.zip', archive)
        with zipfile.ZipFile(archive) as z:
            for member in z.infolist():
                target = (model.parent / member.filename).resolve()
                if not target.is_relative_to(model.parent.resolve()):
                    raise ValueError('Caminho inválido no arquivo de modelo')
            z.extractall(model.parent)
    if not ((model / 'am' / 'final.mdl').exists() or (model / 'final.mdl').exists()):
        raise SystemExit('Download incompleto. Execute npm run setup novamente.')
    print('Modelo português instalado.')
