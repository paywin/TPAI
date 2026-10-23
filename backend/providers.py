"""Server-side recognizers consume PCM captured by the browser, not server microphone."""
import asyncio
import json
import os
from pathlib import Path
from functools import lru_cache

ROOT = Path(__file__).resolve().parents[1]

class ProviderError(Exception):
    """Safe user-facing error, never containing provider credentials."""


def model_path():
    path = Path(os.getenv('VOSK_MODEL_PATH', 'models/vosk-model-small-pt-0.3'))
    return path if path.is_absolute() else ROOT / path


@lru_cache(maxsize=2)
def load_model(path):
    from vosk import Model, SetLogLevel
    SetLogLevel(-1)
    return Model(path)


async def vosk_stream(chunks, emit):
    from vosk import KaldiRecognizer
    path = model_path()
    if not ((path / 'am' / 'final.mdl').exists() or (path / 'final.mdl').exists()):
        raise ProviderError('Modelo local ausente. Execute npm run setup na pasta do projeto.')
    model = await asyncio.to_thread(load_model, str(path))
    recognizer = KaldiRecognizer(model, 16000)
    recognizer.SetWords(True)
    utterance, last = 0, ''
    await emit({'type': 'ready', 'provider': 'vosk'})
    async for chunk in chunks:
        final = await asyncio.to_thread(recognizer.AcceptWaveform, chunk)
        result = json.loads(recognizer.Result() if final else recognizer.PartialResult())
        text = result.get('text' if final else 'partial', '')
        if text and (text != last or final):
            scores = [word['conf'] for word in result.get('result', [])]
            await emit({'type': 'transcript', 'text': text, 'final': bool(final),
                        'id': f'{utterance}:{bool(final)}',
                        'confidence': sum(scores) / len(scores) if scores else None})
        last = text
        if final:
            utterance += 1
            last = ''


async def gemini_stream(chunks, emit):
    from google import genai
    from google.genai import types
    key = os.getenv('GEMINI_API_KEY', '').strip()
    model = os.getenv('GEMINI_MODEL', 'gemini-3.5-transcribe-live').strip()
    if not key:
        raise ProviderError('Configure GEMINI_API_KEY no arquivo .env e reinicie o servidor, ou selecione Vosk local.')
    transcription_only = 'transcribe' in model
    config = types.LiveConnectConfig(
        response_modalities=['TEXT' if transcription_only else 'AUDIO'],
        input_audio_transcription=types.AudioTranscriptionConfig(),
    )
    async with genai.Client(api_key=key).aio as client:
        async with client.live.connect(model=model, config=config) as session:
            await emit({'type': 'ready', 'provider': 'gemini'})
            async def send():
                buffer = bytearray()
                async for chunk in chunks:
                    buffer.extend(chunk)
                    if len(buffer) >= 3200:
                        await session.send_realtime_input(audio=types.Blob(data=bytes(buffer), mime_type='audio/pcm;rate=16000'))
                        buffer.clear()
            async def receive():
                index, accumulated = 0, ''
                while True:
                    received = False
                    async for msg in session.receive():
                        received = True
                        if msg.go_away:
                            raise ProviderError('A sessão Gemini expirou. Ligue o microfone novamente para reconectar.')
                        content = msg.server_content
                        if not content:
                            continue
                        interim = getattr(content, 'interim_input_transcription', None)
                        if interim and interim.text:
                            await emit({'type': 'transcript', 'text': interim.text, 'final': False, 'id': str(index), 'confidence': None})
                        transcript = content.input_transcription
                        if transcript and transcript.text:
                            if transcription_only:
                                await emit({'type': 'transcript', 'text': transcript.text, 'final': True, 'id': str(index), 'confidence': None})
                                index += 1
                            else:
                                accumulated += transcript.text
                                await emit({'type': 'transcript', 'text': accumulated, 'final': False, 'id': str(index), 'confidence': None})
                        if content.turn_complete and not transcription_only:
                            if accumulated:
                                await emit({'type': 'transcript', 'text': accumulated, 'final': True, 'id': str(index), 'confidence': None})
                            accumulated = ''
                            index += 1
                    if not received:
                        raise ProviderError('Gemini encerrou a conexão. Ligue o microfone novamente.')
            tasks = [asyncio.create_task(send()), asyncio.create_task(receive())]
            try:
                done, _ = await asyncio.wait(tasks, return_when=asyncio.FIRST_COMPLETED)
                for task in done:
                    task.result()
            finally:
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)
