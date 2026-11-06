import asyncio
import pytest
from fastapi.testclient import TestClient
from backend.app import app
from backend import gestures


def test_single_double_and_ambiguous_hands():
    for signal in gestures.SINGLES:
        assert gestures.combine([(signal, .95)])['gesture'] == signal
    for signal, double in gestures.DOUBLES.items():
        assert gestures.combine([(signal, .95), (signal, .9)])['gesture'] == double
    assert gestures.combine([('Victory', .95), ('Open_Palm', .95)])['gesture'] is None
    assert gestures.combine([('Victory', .69)])['gesture'] is None
    assert gestures.combine([])['gesture'] is None


def test_vision_endpoint_limits_and_independent_health(monkeypatch):
    with TestClient(app) as client:
        assert client.post('/api/gestures/recognize?provider=invalid', content=b'x').status_code == 400
        assert client.post('/api/gestures/recognize', content=b'x' * 250001).status_code == 413
        assert client.post('/api/gestures/recognize', headers={'Origin':'https://invalid.test'}, content=b'x').status_code == 403
        monkeypatch.setattr(gestures, 'local', lambda raw: {'gesture':'Victory', 'confidence':.95, 'neutral':False})
        assert client.post('/api/gestures/recognize', content=b'frame').json()['gesture'] == 'Victory'
        assert client.get('/api/health').status_code == 200


def test_gemini_missing_key(monkeypatch):
    from fastapi import HTTPException
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    with pytest.raises(HTTPException) as error:
        asyncio.run(gestures.gemini(b'frame'))
    assert error.value.status_code == 503


def test_slow_vision_does_not_block_server(monkeypatch):
    import threading
    import httpx
    entered, release = threading.Event(), threading.Event()
    def slow(raw):
        entered.set()
        release.wait(3)
        return {'gesture': None, 'confidence': 0, 'neutral': True}
    monkeypatch.setattr(gestures, 'local', slow)
    async def run():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://testserver') as client:
            pending = asyncio.create_task(client.post('/api/gestures/recognize', content=b'frame'))
            try:
                assert await asyncio.to_thread(entered.wait, 2)
                assert (await asyncio.wait_for(client.get('/api/health'), 1)).status_code == 200
            finally:
                release.set()
            assert (await pending).status_code == 200
    asyncio.run(run())
