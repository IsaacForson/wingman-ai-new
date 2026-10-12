"""Conversation history in SQLite. Nothing expires unless the user deletes it."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from ..db import Database


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class ConversationStore:
    def __init__(self, db: Database):
        self.db = db

    async def create(self, mode: str, title: str = "") -> str:
        conv_id = uuid.uuid4().hex[:12]
        ts = now()
        await self.db.execute(
            "INSERT INTO conversations(id, title, mode, created_at, updated_at) VALUES (?,?,?,?,?)",
            (conv_id, title, mode, ts, ts),
        )
        return conv_id

    async def exists(self, conv_id: str) -> bool:
        return await self.db.fetchone("SELECT 1 FROM conversations WHERE id = ?", (conv_id,)) is not None

    async def add_message(
        self,
        conv_id: str,
        role: str,
        content: str,
        *,
        source: str | None = None,
        answer_id: str | None = None,
        provider: str | None = None,
        model: str | None = None,
    ) -> None:
        ts = now()
        await self.db.execute(
            "INSERT INTO messages(conversation_id, role, content, source, answer_id, provider, model, created_at)"
            " VALUES (?,?,?,?,?,?,?,?)",
            (conv_id, role, content, source, answer_id, provider, model, ts),
        )
        if role == "user":
            # First question becomes the title.
            await self.db.execute(
                "UPDATE conversations SET updated_at = ?, title = CASE WHEN title = '' THEN ? ELSE title END WHERE id = ?",
                (ts, content[:80], conv_id),
            )
        else:
            await self.db.execute("UPDATE conversations SET updated_at = ? WHERE id = ?", (ts, conv_id))

    async def history(self, conv_id: str, limit: int = 12) -> list[dict[str, str]]:
        rows = await self.db.fetchall(
            "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?",
            (conv_id, limit),
        )
        return [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]

    async def list(self, limit: int = 100, query: str | None = None) -> list[dict]:
        sql = (
            "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id) AS message_count"
            " FROM conversations c"
        )
        params: list = []
        if query:
            sql += " WHERE c.title LIKE ? OR c.id IN (SELECT conversation_id FROM messages WHERE content LIKE ?)"
            params += [f"%{query}%", f"%{query}%"]
        sql += " ORDER BY c.updated_at DESC LIMIT ?"
        params.append(limit)
        return await self.db.fetchall(sql, params)

    async def get(self, conv_id: str) -> dict | None:
        conv = await self.db.fetchone("SELECT * FROM conversations WHERE id = ?", (conv_id,))
        if not conv:
            return None
        conv["messages"] = await self.db.fetchall(
            "SELECT m.role, m.content, m.source, m.answer_id, m.provider, m.model, m.created_at, f.rating"
            " FROM messages m LEFT JOIN feedback f ON f.answer_id = m.answer_id"
            " WHERE m.conversation_id = ? ORDER BY m.id",
            (conv_id,),
        )
        return conv

    async def set_mode(self, conv_id: str, mode: str) -> None:
        await self.db.execute("UPDATE conversations SET mode = ? WHERE id = ?", (mode, conv_id))

    async def delete(self, conv_id: str) -> bool:
        return bool(await self.db.execute("DELETE FROM conversations WHERE id = ?", (conv_id,)))

    async def delete_all(self) -> None:
        await self.db.execute("DELETE FROM conversations")

    async def set_feedback(self, answer_id: str, rating: int | None) -> None:
        if rating is None:
            await self.db.execute("DELETE FROM feedback WHERE answer_id = ?", (answer_id,))
        else:
            await self.db.execute(
                "INSERT INTO feedback(answer_id, rating, created_at) VALUES (?,?,?)"
                " ON CONFLICT(answer_id) DO UPDATE SET rating = excluded.rating",
                (answer_id, rating, now()),
            )

    async def export_markdown(self, conv_id: str) -> str | None:
        conv = await self.get(conv_id)
        if not conv:
            return None
        lines = [f"# {conv['title'] or 'Conversation'}", "", f"_Mode: {conv['mode']} · {conv['created_at'][:16]}_", ""]
        for m in conv["messages"]:
            who = "**You**" if m["role"] == "user" else "**Wingman**"
            lines += [who, "", m["content"], ""]
        return "\n".join(lines)


async def import_v1(store: ConversationStore, path) -> int:
    """Import Wingman 1.x history (~/.wingman/conversations.json) once, then rename the file."""
    import json
    from pathlib import Path

    path = Path(path)
    if not path.exists():
        return 0
    try:
        data = json.loads(path.read_text())
    except (OSError, ValueError):
        return 0
    imported = 0
    for conv in data.get("conversations", []):
        conv_id = str(conv.get("id") or uuid.uuid4().hex[:12])
        if await store.exists(conv_id):
            continue
        created = conv.get("created_at") or now()
        await store.db.execute(
            "INSERT INTO conversations(id, title, mode, created_at, updated_at) VALUES (?,?,?,?,?)",
            (
                conv_id,
                conv.get("title") or "",
                conv.get("mode") or "interview",
                created,
                conv.get("updated_at") or created,
            ),
        )
        rows = [
            (conv_id, m["role"], m["content"], "manual", m.get("timestamp") or created)
            for m in conv.get("messages", [])
            if m.get("role") in ("user", "assistant") and m.get("content")
        ]
        await store.db.executemany(
            "INSERT INTO messages(conversation_id, role, content, source, created_at) VALUES (?,?,?,?,?)", rows
        )
        imported += 1
    path.rename(path.with_suffix(".json.imported"))
    return imported
