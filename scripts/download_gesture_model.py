from pathlib import Path
from urllib.request import urlopen

destination = Path(__file__).resolve().parents[1] / 'models' / 'gesture_recognizer.task'
destination.parent.mkdir(exist_ok=True)
if not destination.exists():
    url = 'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'
    with urlopen(url, timeout=120) as response:
        content = response.read()
    if len(content) < 1000000:
        raise RuntimeError('Download do modelo incompleto.')
    temporary = destination.with_suffix('.download')
    temporary.write_bytes(content)
    temporary.replace(destination)
print('Modelo de gestos local pronto:', destination)
