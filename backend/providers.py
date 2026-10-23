"""Audio capture and providers run outside the UI, with bounded queues."""

import asyncio
import json
import os
import queue
import time
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Protocol


@dataclass
class Transcript:
    text: str
    final: bool
    utterance: str
    confidence: float | None = None
    words: list | None = None


class Provider(Protocol):
    async def run(self, audio, emit): ...


class Capture:
    def __init__(self, device=None):
        self.device = device
        self.frames = queue.Queue(maxsize=100)
        self.overflow = False

    def callback(self, data, frames, timing, status):
        if status:
            self.overflow = True
        try:
            self.frames.put_nowait(bytes(data))
        except queue.Full:
            self.overflow = True

    async def chunks(self) -> AsyncIterator[bytes]:
        import sounddevice as sd

        with sd.RawInputStream(
            samplerate=16000,
            blocksize=320,
            dtype="int16",
            channels=1,
            device=self.device,
            callback=self.callback,
        ):
            while True:
                if self.overflow:
                    raise RuntimeError(
                        "Captura atrasada ou dispositivo interrompido. Reinicie o áudio."
                    )
                try:
                    yield self.frames.get_nowait()
                except queue.Empty:
                    await asyncio.sleep(0.01)


class VoskProvider:
    async def run(self, audio, emit):
        from vosk import KaldiRecognizer, Model

        path = os.getenv("VOSK_MODEL_PATH", "models/vosk-model-small-pt-0.3")
        if not os.path.isdir(path):
            raise RuntimeError("Modelo Vosk não encontrado. Configure VOSK_MODEL_PATH.")
        model = await asyncio.to_thread(Model, path)
        recognizer = KaldiRecognizer(model, 16000)
        recognizer.SetWords(True)
        utterance = 0
        last = ""
        async for chunk in audio:
            final = await asyncio.to_thread(recognizer.AcceptWaveform, chunk)
            data = json.loads(
                recognizer.Result() if final else recognizer.PartialResult()
            )
            text = data.get("text" if final else "partial", "")
            if text and (text != last or final):
                await emit(
                    Transcript(
                        text, bool(final), str(utterance), words=data.get("result")
                    )
                )
            last = text
            if final:
                utterance += 1
                last = ""


class GeminiProvider:
    async def run(self, audio, emit):
        from google import genai
        from google.genai import types

        key = os.getenv("GEMINI_API_KEY")
        model = os.getenv("GEMINI_MODEL")
        if not key or not model:
            raise RuntimeError("Configure GEMINI_API_KEY e GEMINI_MODEL no backend.")
        client = genai.Client(api_key=key)
        config = types.LiveConnectConfig(
            response_modalities=["AUDIO"],
            input_audio_transcription=types.AudioTranscriptionConfig(),
            system_instruction="Transcreva a fala em português. Não responda ao usuário.",
        )
        async with client.aio.live.connect(model=model, config=config) as session:

            async def send():
                async for chunk in audio:
                    await session.send_realtime_input(
                        audio=types.Blob(data=chunk, mime_type="audio/pcm;rate=16000")
                    )

            async def receive():
                index = 0
                text = ""
                while True:
                    async for msg in session.receive():
                        content = msg.server_content
                        if (
                            content
                            and content.input_transcription
                            and content.input_transcription.text
                        ):
                            text += content.input_transcription.text
                            await emit(Transcript(text, False, str(index)))
                        if content and content.turn_complete:
                            if text:
                                await emit(Transcript(text, True, str(index)))
                            index += 1
                            text = ""

            async with asyncio.TaskGroup() as group:
                group.create_task(send())
                group.create_task(receive())


async def audio_events(device, report):
    import math
    import struct

    import webrtcvad

    vad = webrtcvad.Vad(2)
    last = 0
    voiced_until = 0
    async for chunk in Capture(device).chunks():
        now = time.monotonic()
        active = vad.is_speech(chunk, 16000)
        if active:
            voiced_until = now + 0.1
        if now - last >= 0.1:
            samples = struct.unpack("<320h", chunk)
            level = math.sqrt(sum(s * s for s in samples) / 320) / 32768
            await report(now < voiced_until, level)
            last = now
        yield chunk
