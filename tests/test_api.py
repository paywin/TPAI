import importlib

import pytest
from fastapi.testclient import TestClient

SCRIPT = {
    "id": "test",
    "title": "Teste",
    "blocks": [{"id": "b", "text": "boa noite está começando o panorama"}],
}
ORIGIN = {"origin": "http://127.0.0.1:8765"}


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("PULSO_DATA_DIR", str(tmp_path))
    import backend.app as module

    importlib.reload(module)
    with TestClient(module.app) as client:
        yield client


def test_storage_and_validation(client):
    assert client.put("/api/scripts/test", json=SCRIPT).status_code == 200
    assert client.get("/api/scripts").json()[0]["title"] == "Teste"
    assert client.put("/api/scripts/other", json=SCRIPT).status_code == 400
    assert (
        client.put("/api/scripts/test", json={**SCRIPT, "blocks": []}).status_code
        == 422
    )
    assert (
        client.get(
            "/api/scripts", headers={"origin": "https://evil.example"}
        ).status_code
        == 403
    )
    assert client.delete("/api/scripts/test").status_code == 200
    assert client.get("/api/scripts").json() == []


def test_session_simulator_manual_and_disconnect(client):
    with client.websocket_connect("/ws?role=presenter", headers=ORIGIN) as presenter:
        presenter.receive_json()
        with client.websocket_connect("/ws?role=operator", headers=ORIGIN) as ws:
            ws.receive_json()
            ws.send_json({"type": "load", "script": SCRIPT})
            assert ws.receive_json()["script"]["id"] == "test"
            presenter.receive_json()
            ws.send_json({"type": "settings", "settings": {"provider": "simulator"}})
            ws.receive_json()
            presenter.receive_json()
            ws.send_json({"type": "auto"})
            ws.receive_json()
            presenter.receive_json()
            ws.send_json(
                {
                    "type": "simulate",
                    "text": "boa noite está começando",
                    "utterance": "1",
                }
            )
            assert ws.receive_json()["reading"]["position"] == 3
            assert presenter.receive_json()["reading"]["position"] == 3
            ws.send_json({"type": "silence"})
            assert ws.receive_json()["reading"]["state"] == "SILENCE"
            presenter.receive_json()
            ws.send_json({"type": "manual", "position": 2})
            assert ws.receive_json()["reading"]["state"] == "MANUAL"
            presenter.receive_json()
        assert presenter.receive_json()["reading"]["state"] == "MANUAL"


def test_invalid_ws_command_does_not_crash(client):
    with client.websocket_connect("/ws?role=operator", headers=ORIGIN) as ws:
        ws.receive_json()
        ws.send_json({"type": "settings", "settings": {"fontSize": 9999}})
        assert ws.receive_json()["type"] == "error"
        ws.send_json({"type": "ping", "sent": 123})
        assert ws.receive_json() == {"type": "pong", "sent": 123}


def test_persistence_reopen(tmp_path):
    from backend.storage import Store

    store = Store(tmp_path / "test.db")
    store.save(SCRIPT)
    store.preferences({"mirror": True})
    other = Store(tmp_path / "test.db")
    assert other.scripts() == [SCRIPT]
    assert other.preferences()["mirror"] is True


def test_manual_wins_over_inflight_recognition(client, monkeypatch):
    import asyncio
    import threading

    import backend.app as module
    from backend.providers import Transcript
    from backend.tracker import ScriptTracker

    entered = threading.Event()
    release = threading.Event()
    original = ScriptTracker.transcript

    def slow(self, *args):
        entered.set()
        release.wait(2)
        return original(self, *args)

    class FakeProvider:
        async def run(self, audio, emit):
            await emit(Transcript("boa noite está começando", True, "1"))

    monkeypatch.setattr(module, "VoskProvider", FakeProvider)
    monkeypatch.setattr(ScriptTracker, "transcript", slow)

    async def scenario():
        s = module.Session()
        s.tracker = ScriptTracker("boa noite está começando o panorama")
        s.tracker.automatic()
        task = asyncio.create_task(s.run_audio())
        await asyncio.to_thread(entered.wait, 2)
        s.revision += 1
        s.tracker.manual(1)
        release.set()
        await task
        assert s.tracker.reading.state == "MANUAL"
        assert s.tracker.reading.position == 1

    asyncio.run(scenario())
