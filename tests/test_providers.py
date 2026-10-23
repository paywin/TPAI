import asyncio
import json
import sys
import types

import pytest

from backend.providers import Capture, VoskProvider


def test_capture_queue_is_bounded():
    capture = Capture()
    for _ in range(101):
        capture.callback(bytes(640), 320, None, None)
    assert capture.frames.qsize() == 100
    assert capture.overflow is True


def test_vosk_preserves_real_word_metadata(monkeypatch, tmp_path):
    class Recognizer:
        def __init__(self, *args):
            pass

        def SetWords(self, *args):
            pass

        def AcceptWaveform(self, data):
            return True

        def Result(self):
            return json.dumps(
                {
                    "text": "boa noite",
                    "result": [{"word": "boa", "conf": 0.91, "start": 0.1, "end": 0.4}],
                }
            )

    monkeypatch.setenv("VOSK_MODEL_PATH", str(tmp_path))
    monkeypatch.setitem(
        sys.modules,
        "vosk",
        types.SimpleNamespace(Model=lambda path: object(), KaldiRecognizer=Recognizer),
    )
    events = []

    async def audio():
        yield bytes(640)

    async def emit(event):
        events.append(event)

    asyncio.run(VoskProvider().run(audio(), emit))
    assert events[0].confidence is None
    assert events[0].words[0]["conf"] == 0.91
    assert events[0].final


def test_missing_model_is_explicit(monkeypatch, tmp_path):
    monkeypatch.setenv("VOSK_MODEL_PATH", str(tmp_path / "absent"))

    async def audio():
        yield bytes(640)

    async def emit(event):
        pass

    with pytest.raises(RuntimeError, match="Modelo Vosk"):
        asyncio.run(VoskProvider().run(audio(), emit))
