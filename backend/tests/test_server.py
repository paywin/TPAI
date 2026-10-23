import asyncio
from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from backend import app as module
from backend.storage import Store
from backend.providers import ProviderError, gemini_stream

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(module, 'store', Store(tmp_path / 'test.db'))
    with TestClient(module.app) as client:
        yield client

def test_crud_persists_and_validates(client):
    script = dict(id='test', title='Roteiro', blocks=[dict(id='a', text='Boa noite')])
    assert client.put('/api/scripts/test', json=script).status_code == 200
    assert client.get('/api/scripts').json()[0]['title'] == 'Roteiro'
    assert client.put('/api/scripts/wrong', json=script).status_code == 400
    assert client.put('/api/scripts/test', json={**script, 'blocks': []}).status_code == 422
    assert client.delete('/api/scripts/test').status_code == 200
    assert client.get('/api/scripts').json() == []

def test_origin_rejected_and_secret_not_exposed(client, monkeypatch):
    monkeypatch.setenv('GEMINI_API_KEY', 'test-secret-must-not-leak')
    assert client.get('/api/health', headers={'Origin': 'https://attacker.invalid'}).status_code == 403
    response = client.get('/api/health')
    assert response.json()['gemini_configured'] is True
    assert 'test-secret' not in response.text
    with pytest.raises(Exception):
        with client.websocket_connect('/ws/audio', headers={'Origin': 'https://attacker.invalid'}):
            pass

def test_audio_protocol_uses_browser_pcm(client, monkeypatch):
    async def provider(chunks, emit):
        await emit({'type': 'ready'})
        async for chunk in chunks:
            assert chunk == bytes(640)
            await emit({'type': 'transcript', 'text': 'protocol fixture', 'final': True})
    monkeypatch.setattr(module, 'vosk_stream', provider)
    with client.websocket_connect('/ws/audio', headers={'Origin': 'http://localhost:8787'}) as ws:
        ws.send_json({'provider': 'vosk'})
        assert ws.receive_json()['type'] == 'ready'
        ws.send_bytes(bytes(640))
        assert ws.receive_json()['text'] == 'protocol fixture'
        ws.send_bytes(bytes(30))
        assert ws.receive_json()['type'] == 'error'

def test_provider_errors_are_sanitized(client, monkeypatch):
    async def provider(chunks, emit):
        raise RuntimeError('SECRET_KEY=value')
    monkeypatch.setattr(module, 'gemini_stream', provider)
    with client.websocket_connect('/ws/audio', headers={'Origin': 'http://localhost:8787'}) as ws:
        ws.send_json({'provider': 'gemini'})
        response = ws.receive_json()
        assert response['type'] == 'error'
        assert 'SECRET_KEY' not in response['message']

def test_missing_gemini_key_has_actionable_error(monkeypatch):
    monkeypatch.delenv('GEMINI_API_KEY', raising=False)
    async def chunks():
        yield bytes(640)
    async def emit(_):
        pass
    with pytest.raises(ProviderError, match='GEMINI_API_KEY'):
        asyncio.run(gemini_stream(chunks(), emit))
