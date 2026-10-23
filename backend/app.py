import asyncio
import math
import os
import struct
from contextlib import suppress
from pathlib import Path
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from urllib.parse import urlparse
from pydantic import BaseModel, Field, model_validator
from backend.storage import Store
from backend.providers import ProviderError, gemini_stream, model_path, vosk_stream

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / '.env')
data = Path(os.getenv('PULSO_DATA_DIR', str(ROOT / 'data')))
if not data.is_absolute():
    data = ROOT / data
store = Store(data / 'pulso.db')
ORIGINS = {'http://localhost:8787', 'http://127.0.0.1:8787', 'http://localhost:5173', 'http://127.0.0.1:5173', 'http://testserver'}
ORIGINS.update(o.strip() for o in os.getenv('PULSO_ORIGINS', '').split(',') if o.strip())
app = FastAPI(title='PULSO Web backend', version='0.3.0')
app.add_middleware(TrustedHostMiddleware, allowed_hosts=sorted({urlparse(o).hostname for o in ORIGINS if urlparse(o).hostname}))

class Block(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(default='Bloco', max_length=200)
    text: str = Field(max_length=100000)
    kind: str = Field(default='roteiro', max_length=100)
    duration: str = Field(default='00:30', pattern=r'^\d{1,3}:[0-5]\d$')

class Script(BaseModel):
    id: str = Field(min_length=1, max_length=100)
    title: str = Field(min_length=1, max_length=200)
    program: str = Field(default='', max_length=200)
    updated: str = Field(default='', max_length=100)
    status: str = Field(default='Em edição', pattern='^(Pronto|Em edição)$')
    blocks: list[Block] = Field(min_length=1, max_length=200)
    @model_validator(mode='after')
    def bounded(self):
        if sum(len(b.text) for b in self.blocks) > 250000:
            raise ValueError('Limite de 250 mil caracteres por roteiro.')
        return self

@app.middleware('http')
async def origins(request: Request, call_next):
    if request.headers.get('origin') and request.headers['origin'] not in ORIGINS:
        return JSONResponse({'detail': 'Origem não permitida. Use localhost ou configure PULSO_ORIGINS.'}, status_code=403)
    response = await call_next(request)
    if request.url.path in {'/', '/index.html', '/api/health'}:
        response.headers['Cache-Control'] = 'no-store'
    return response

@app.get('/api/health')
def health():
    return {'status': 'ok', 'version': '0.3.0',
            'vosk_ready': ((model_path() / 'am' / 'final.mdl').is_file() or (model_path() / 'final.mdl').is_file()),
            'gemini_configured': bool(os.getenv('GEMINI_API_KEY', '').strip()),
            'gemini_model': os.getenv('GEMINI_MODEL', 'gemini-3.5-transcribe-live')}

@app.get('/api/scripts')
def scripts():
    return store.scripts()

@app.put('/api/scripts/{id}')
def save(id: str, script: Script):
    if id != script.id:
        raise HTTPException(400, 'ID inválido')
    store.save(script.model_dump())
    return script

@app.delete('/api/scripts/{id}')
def delete(id: str):
    store.delete(id)
    return {'ok': True}

@app.websocket('/ws/audio')
async def audio(ws: WebSocket):
    if ws.headers.get('origin') not in ORIGINS:
        await ws.close(code=1008)
        return
    await ws.accept()
    queue = asyncio.Queue(maxsize=100)
    tasks = []
    lock = asyncio.Lock()
    async def emit(event):
        async with lock:
            await asyncio.wait_for(ws.send_json(event), 3)
    async def incoming():
        while True:
            packet = await asyncio.wait_for(ws.receive(), 15)
            if packet['type'] == 'websocket.disconnect':
                return
            chunk = packet.get('bytes')
            if chunk is None or len(chunk) != 640:
                raise ProviderError('Formato de áudio inválido. Esperado PCM mono 16 kHz em quadros de 20 ms.')
            try:
                queue.put_nowait(chunk)
            except asyncio.QueueFull:
                raise ProviderError('O processamento ficou atrasado. Reinicie o microfone.') from None
    async def chunks():
        import webrtcvad
        vad = webrtcvad.Vad(2)
        count, active = 0, False
        while True:
            chunk = await queue.get()
            active = vad.is_speech(chunk, 16000) or active
            count += 1
            if count % 5 == 0:
                samples = struct.unpack('<320h', chunk)
                level = math.sqrt(sum(s*s for s in samples) / 320) / 32768
                await emit({'type': 'voice', 'active': active, 'level': level})
                active = False
            yield chunk
    try:
        config = await asyncio.wait_for(ws.receive_json(), 10)
        provider = config.get('provider')
        if provider not in {'vosk', 'gemini'}:
            raise ProviderError('Selecione Vosk local ou Gemini.')
        # Capture starts only after ready, so load the model before the input timeout.
        ready = asyncio.Event()
        async def report(event):
            await emit(event)
            if event.get('type') == 'ready':
                ready.set()
        async def read_after_ready():
            await asyncio.wait_for(ready.wait(), 60)
            await incoming()
        runner = gemini_stream if provider == 'gemini' else vosk_stream
        tasks = [asyncio.create_task(read_after_ready()), asyncio.create_task(runner(chunks(), report))]
        done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
        for task in done:
            task.result()
    except WebSocketDisconnect:
        pass
    except ProviderError as exc:
        with suppress(Exception):
            await emit({'type': 'error', 'message': str(exc)})
    except Exception as exc:
        # SDK exceptions may include URLs/keys; send only controlled diagnostics.
        code = getattr(exc, 'code', None)
        message = ('Gemini recusou a conexão. Confira a chave, o modelo e a cota no .env.'
                   if code in (400, 401, 403, 404, 429) else
                   'Falha no serviço de áudio. Confira o modelo local ou a configuração Gemini e reinicie o microfone.')
        with suppress(Exception):
            await emit({'type': 'error', 'message': message})
    finally:
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        with suppress(Exception):
            await ws.close()

DIST = ROOT / 'frontend' / 'dist'
if DIST.exists():
    app.mount('/', StaticFiles(directory=DIST, html=True), name='frontend')
