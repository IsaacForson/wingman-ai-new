"""Latency and token tracking per provider/model, persisted to SQLite."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ..db import Database


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _percentile(values: list[float], pct: float) -> float | None:
    if not values:
        return None
    values = sorted(values)
    k = (len(values) - 1) * pct
    lo, hi = int(k), min(int(k) + 1, len(values) - 1)
    return round(values[lo] + (values[hi] - values[lo]) * (k - lo), 1)


class UsageTracker:
    def __init__(self, db: Database):
        self.db = db

    async def record(
        self,
        *,
        provider: str,
        model: str,
        purpose: str,
        ok: bool,
        ttft_ms: float | None,
        total_ms: float | None,
        input_tokens: int | None,
        output_tokens: int | None,
        error: str | None = None,
    ) -> None:
        await self.db.execute(
            "INSERT INTO usage(created_at, provider, model, purpose, ok, ttft_ms, total_ms, input_tokens, output_tokens, error)"
            " VALUES (?,?,?,?,?,?,?,?,?,?)",
            (_now(), provider, model, purpose, int(ok), ttft_ms, total_ms, input_tokens, output_tokens, error),
        )

    async def summary(self, days: int = 7) -> dict:
        since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
        rows = await self.db.fetchall("SELECT * FROM usage WHERE created_at >= ? ORDER BY id", (since,))
        groups: dict[tuple[str, str], list[dict]] = {}
        for r in rows:
            groups.setdefault((r["provider"], r["model"]), []).append(r)
        models = []
        for (provider, model), items in groups.items():
            ok = [i for i in items if i["ok"]]
            models.append(
                {
                    "provider": provider,
                    "model": model,
                    "requests": len(items),
                    "errors": len(items) - len(ok),
                    "ttft_p50_ms": _percentile([i["ttft_ms"] for i in ok if i["ttft_ms"] is not None], 0.5),
                    "ttft_p95_ms": _percentile([i["ttft_ms"] for i in ok if i["ttft_ms"] is not None], 0.95),
                    "total_p50_ms": _percentile([i["total_ms"] for i in ok if i["total_ms"] is not None], 0.5),
                    "input_tokens": sum(i["input_tokens"] or 0 for i in items),
                    "output_tokens": sum(i["output_tokens"] or 0 for i in items),
                }
            )
        models.sort(key=lambda m: m["requests"], reverse=True)
        recent_errors = [
            {"at": r["created_at"], "provider": r["provider"], "model": r["model"], "error": r["error"]}
            for r in reversed(rows)
            if not r["ok"] and r["error"] and r["error"] != "cancelled"
        ][:10]
        return {"days": days, "models": models, "recent_errors": recent_errors}
