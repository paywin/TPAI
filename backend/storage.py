import json
import sqlite3
from pathlib import Path


class Store:
    def __init__(self, path):
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        self.path = path
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.execute(
                "CREATE TABLE IF NOT EXISTS scripts (id TEXT PRIMARY KEY, data TEXT NOT NULL)"
            )
            db.execute(
                "CREATE TABLE IF NOT EXISTS preferences (id INTEGER PRIMARY KEY, data TEXT NOT NULL)"
            )

    def connect(self):
        return sqlite3.connect(self.path, timeout=10)

    def scripts(self):
        with self.connect() as db:
            return [
                json.loads(row[0])
                for row in db.execute("SELECT data FROM scripts ORDER BY rowid DESC")
            ]

    def save(self, script):
        with self.connect() as db:
            db.execute(
                "INSERT INTO scripts VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                (script["id"], json.dumps(script, ensure_ascii=False)),
            )

    def delete(self, id):
        with self.connect() as db:
            db.execute("DELETE FROM scripts WHERE id=?", (id,))

    def preferences(self, data=None):
        with self.connect() as db:
            if data is not None:
                db.execute(
                    "INSERT INTO preferences VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data",
                    (json.dumps(data),),
                )
            row = db.execute("SELECT data FROM preferences WHERE id=1").fetchone()
            return json.loads(row[0]) if row else {}
