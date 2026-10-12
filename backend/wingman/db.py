"""Tiny SQLite layer.

One connection guarded by a lock, used from a worker thread so the event loop
never blocks on disk I/O. Schema changes are append-only migrations.
"""

from __future__ import annotations

import asyncio
import sqlite3
import threading
from collections.abc import Iterable
from pathlib import Path
from typing import Any

MIGRATIONS: list[str] = [
    # 1 - initial schema
    """
    CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        mode TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
    );
    CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        source TEXT,
        answer_id TEXT,
        provider TEXT,
        model TEXT,
        created_at TEXT NOT NULL
    );
    CREATE INDEX idx_messages_conv ON messages(conversation_id, id);
    CREATE TABLE feedback (
        answer_id TEXT PRIMARY KEY,
        rating INTEGER NOT NULL CHECK (rating IN (-1, 1)),
        created_at TEXT NOT NULL
    );
    CREATE TABLE usage (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        purpose TEXT NOT NULL,
        ok INTEGER NOT NULL,
        ttft_ms REAL,
        total_ms REAL,
        input_tokens INTEGER,
        output_tokens INTEGER,
        error TEXT
    );
    CREATE TABLE documents (
        id TEXT PRIMARY KEY,
        kind TEXT NOT NULL,
        name TEXT NOT NULL,
        chars INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    );
    CREATE TABLE chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        idx INTEGER NOT NULL,
        text TEXT NOT NULL
    );
    CREATE TABLE practice_attempts (
        id TEXT PRIMARY KEY,
        question_id TEXT,
        question TEXT NOT NULL,
        category TEXT NOT NULL,
        answer TEXT NOT NULL,
        score REAL,
        feedback_json TEXT NOT NULL,
        duration_s REAL,
        created_at TEXT NOT NULL
    );
    CREATE TABLE meetings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        summary_json TEXT
    );
    CREATE TABLE meeting_lines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        meeting_id TEXT NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
        speaker TEXT NOT NULL,
        text TEXT NOT NULL,
        ts TEXT NOT NULL
    );
    CREATE TABLE kv (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    """,
]


class Database:
    def __init__(self, path: Path | str):
        self.path = str(path)
        if self.path != ":memory:":
            Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(self.path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys = ON")
        self._conn.execute("PRAGMA journal_mode = WAL")
        self._lock = threading.Lock()
        self._migrate()

    def _migrate(self) -> None:
        with self._lock:
            version = self._conn.execute("PRAGMA user_version").fetchone()[0]
            for i, script in enumerate(MIGRATIONS[version:], start=version + 1):
                self._conn.executescript(script)
                self._conn.execute(f"PRAGMA user_version = {i}")
            self._conn.commit()

    # -- sync primitives (run in a worker thread) --------------------------
    def _execute(self, sql: str, params: Iterable[Any] = ()) -> int:
        with self._lock:
            cur = self._conn.execute(sql, tuple(params))
            self._conn.commit()
            return cur.lastrowid or cur.rowcount

    def _executemany(self, sql: str, rows: Iterable[Iterable[Any]]) -> None:
        with self._lock:
            self._conn.executemany(sql, [tuple(r) for r in rows])
            self._conn.commit()

    def _fetchall(self, sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
        with self._lock:
            return [dict(r) for r in self._conn.execute(sql, tuple(params)).fetchall()]

    def _fetchone(self, sql: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
        with self._lock:
            row = self._conn.execute(sql, tuple(params)).fetchone()
            return dict(row) if row else None

    # -- async API ---------------------------------------------------------
    async def execute(self, sql: str, params: Iterable[Any] = ()) -> int:
        return await asyncio.to_thread(self._execute, sql, params)

    async def executemany(self, sql: str, rows: Iterable[Iterable[Any]]) -> None:
        await asyncio.to_thread(self._executemany, sql, rows)

    async def fetchall(self, sql: str, params: Iterable[Any] = ()) -> list[dict[str, Any]]:
        return await asyncio.to_thread(self._fetchall, sql, params)

    async def fetchone(self, sql: str, params: Iterable[Any] = ()) -> dict[str, Any] | None:
        return await asyncio.to_thread(self._fetchone, sql, params)

    def close(self) -> None:
        with self._lock:
            self._conn.close()
