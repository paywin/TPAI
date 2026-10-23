import asyncio
import copy
import os
import sys
import time
from contextlib import asynccontextmanager, suppress
from dataclasses import asdict
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ValidationError, model_validator

from backend.providers import GeminiProvider, VoskProvider, audio_events
from backend.storage import Store
from backend.tracker import ScriptTracker

load_dotenv()
DATA = Path(
    os.getenv(
        "PULSO_DATA_DIR",
        str(Path(os.getenv("LOCALAPPDATA", str(Path.home()))) / "Pulso"),
    )
)
load_dotenv(DATA / ".env")
store = Store(DATA / "pulso.db")
ORIGINS = {
    "http://127.0.0.1:8765",
    "http://localhost:8765",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://tauri.localhost",
    "https://tauri.localhost",
    "tauri://localhost",
}


class Block(BaseModel):
    id: str = Field(max_length=100)
    title: str = Field(default="Bloco", max_length=200)
    duration: str = Field(default="00:30", pattern=r"^\d{1,3}:[0-5]\d$")
    kind: str = Field(default="roteiro", max_length=100)
    text: str = Field(max_length=100000)


class Script(BaseModel):
    id: str = Field(max_length=100)
    title: str = Field(min_length=1, max_length=200)
    program: str = Field(default="", max_length=200)
    updated: str = Field(default="", max_length=100)
    status: str = Field(default="Em edição", pattern="^(Pronto|Em edição)$")
    blocks: list[Block] = Field(min_length=1, max_length=200)

    @model_validator(mode="after")
    def check_size(self):
        if (
            sum(len(b.text) for b in self.blocks) > 250000
            or sum(len(b.text.split()) for b in self.blocks) > 30000
        ):
            raise ValueError(
                "Limite por roteiro: 30 mil palavras / 250 mil caracteres."
            )
        return self


class Settings(BaseModel):
    fontSize: int = Field(default=56, ge=24, le=120)
    mirror: bool = False
    guide: int = Field(default=35, ge=15, le=70)
    speed: int = Field(default=35, ge=5, le=150)
    device: int | None = None
    provider: str = Field(default="vosk", pattern="^(vosk|gemini|simulator)$")
    silenceMs: int = Field(default=650, ge=200, le=3000)


class Session:
    def __init__(self):
        self.tracker = ScriptTracker()
        self.script = None
        self.settings = Settings(**store.preferences()).model_dump()
        self.clients = set()
        self.operator = None
        self.audio_task = None
        self.audio = False
        self.level = 0
        self.transcript = None
        self.error = ""
        self.playing = False
        self.last_recognition = 0
        self.revision = 0

    def snapshot(self):
        return dict(
            type="session",
            script=self.script,
            settings=self.settings,
            reading=self.tracker.snapshot(),
            audio=self.audio,
            level=self.level,
            transcript=self.transcript,
            error=self.error,
            playing=self.playing,
        )

    async def broadcast(self, include_script=False):
        data = self.snapshot()
        if not include_script:
            del data["script"]
        for ws in list(self.clients):
            try:
                await asyncio.wait_for(ws.send_json(data), timeout=0.5)
            except Exception:
                self.clients.discard(ws)

    async def stop_audio(self):
        if self.audio_task:
            self.audio_task.cancel()
            with suppress(asyncio.CancelledError):
                await self.audio_task
            self.audio_task = None
        self.audio = False
        self.level = 0

    async def run_audio(self):
        try:
            provider = (
                GeminiProvider()
                if self.settings["provider"] == "gemini"
                else VoskProvider()
            )

            async def report(active, level):
                self.level = level
                self.tracker.voice(active)
                if active and time.monotonic() - self.last_recognition > 2:
                    self.tracker.failure()
                await self.broadcast()

            async def emit(event):
                self.last_recognition = time.monotonic()
                self.transcript = asdict(event)
                revision = self.revision
                candidate = copy.copy(self.tracker)
                candidate.reading = copy.copy(self.tracker.reading)
                await asyncio.to_thread(
                    candidate.transcript, event.text, event.final, event.utterance
                )
                if self.revision == revision:
                    if (
                        self.tracker.reading.state == "SILENCE"
                        and candidate.reading.state == "READING"
                    ):
                        candidate.reading.state = "SILENCE"
                    self.tracker = candidate
                await self.broadcast()

            await provider.run(audio_events(self.settings["device"], report), emit)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            # Provider exceptions can contain URLs/credentials: never relay their raw text.
            self.error = (
                "Falha no áudio ou provedor. Verifique dispositivo, modelo local e configuração do backend. "
                + type(exc).__name__
            )
            self.tracker.failure()
        finally:
            self.audio = False
            self.level = 0
            await self.broadcast()


session = Session()


@asynccontextmanager
async def lifespan(app):
    yield
    await session.stop_audio()


app = FastAPI(title="PULSO", lifespan=lifespan)
app.add_middleware(
    TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"]
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(ORIGINS),
    allow_methods=["GET", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def protect(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and origin not in ORIGINS:
        return JSONResponse({"detail": "Origem não permitida"}, status_code=403)
    return await call_next(request)


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "gemini_configured": bool(
            os.getenv("GEMINI_API_KEY") and os.getenv("GEMINI_MODEL")
        ),
        "vosk_model": os.path.isdir(
            os.getenv("VOSK_MODEL_PATH", "models/vosk-model-small-pt-0.3")
        ),
    }


@app.get("/api/scripts")
def scripts():
    return store.scripts()


@app.put("/api/scripts/{id}")
def save(id: str, script: Script):
    if id != script.id:
        raise HTTPException(400, "ID inválido")
    store.save(script.model_dump())
    return script


@app.delete("/api/scripts/{id}")
def delete(id: str):
    store.delete(id)
    return {"ok": True}


@app.get("/api/devices")
def devices():
    try:
        import sounddevice as sd

        return [
            {"id": i, "name": d["name"]}
            for i, d in enumerate(sd.query_devices())
            if d["max_input_channels"] > 0
        ]
    except Exception:
        return []


@app.websocket("/ws")
async def websocket(ws: WebSocket):
    if ws.headers.get("origin") not in ORIGINS:
        await ws.close(code=1008)
        return
    operator = ws.query_params.get("role") == "operator"
    if operator and session.operator is not None:
        await ws.close(code=1008, reason="Já existe um operador conectado")
        return
    await ws.accept()
    session.clients.add(ws)
    if operator:
        session.operator = ws
    await ws.send_json(session.snapshot())
    try:
        while True:
            raw = await ws.receive_text()
            if len(raw) > 1500000:
                await ws.close(code=1009)
                break
            import json

            try:
                data = json.loads(raw)
                cmd = data.get("type")
                if cmd == "ping":
                    await ws.send_json({"type": "pong", "sent": data.get("sent")})
                    continue
                if not operator:
                    continue
                if cmd in {"load", "manual", "auto", "settings", "audio_stop"}:
                    session.revision += 1
                if cmd == "load":
                    script = Script(**data["script"]).model_dump()
                    await session.stop_audio()
                    session.script = script
                    session.tracker = ScriptTracker(
                        " ".join(b["text"] for b in script["blocks"]),
                        session.settings["silenceMs"],
                    )
                    session.playing = False
                    session.transcript = None
                elif cmd == "manual":
                    session.tracker.manual(data.get("position"))
                    session.playing = bool(data.get("playing", False))
                elif cmd == "auto":
                    session.playing = False
                    session.tracker.automatic()
                elif cmd == "settings":
                    settings = Settings(
                        **{**session.settings, **data["settings"]}
                    ).model_dump()
                    if (
                        settings["provider"] != session.settings["provider"]
                        or settings["device"] != session.settings["device"]
                    ):
                        await session.stop_audio()
                        session.tracker.manual()
                    session.settings = settings
                    session.tracker.silence_ms = settings["silenceMs"]
                    store.preferences(settings)
                elif cmd == "audio_start" and not session.audio:
                    if session.settings["provider"] != "simulator":
                        session.error = ""
                        session.audio = True
                        session.last_recognition = time.monotonic()
                        session.audio_task = asyncio.create_task(session.run_audio())
                elif cmd == "audio_stop":
                    await session.stop_audio()
                    session.tracker.failure()
                elif cmd == "simulate" and session.settings["provider"] == "simulator":
                    text = str(data.get("text", ""))[:3000]
                    session.tracker.voice(True)
                    session.tracker.transcript(
                        text,
                        bool(data.get("final", True)),
                        str(data.get("utterance", "test")),
                    )
                    session.transcript = {
                        "text": text,
                        "final": bool(data.get("final", True)),
                        "confidence": None,
                    }
                elif cmd == "silence" and session.settings["provider"] == "simulator":
                    session.tracker.voice(
                        False,
                        time.monotonic() + session.settings["silenceMs"] / 1000 + 1,
                    )
                await session.broadcast(include_script=cmd == "load")
            except (ValidationError, ValueError, KeyError, TypeError):
                await ws.send_json(
                    {
                        "type": "error",
                        "message": "Comando inválido. Verifique os campos.",
                    }
                )
    except WebSocketDisconnect:
        pass
    finally:
        session.clients.discard(ws)
        if session.operator is ws:
            session.operator = None
            session.revision += 1
            await session.stop_audio()
            session.tracker.manual()
            session.playing = False
            await session.broadcast()


root = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parents[1]))
dist = root / "frontend" / "dist"
if dist.exists():
    app.mount("/", StaticFiles(directory=dist, html=True), name="frontend")
