from __future__ import annotations

import json
import re
from typing import Any

_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)


def extract_json(text: str) -> Any:
    """Parse the first JSON object in an LLM reply (handles fences and chatter)."""
    candidates = [m.group(1) for m in _FENCE.finditer(text)] + [text]
    for candidate in candidates:
        start = candidate.find("{")
        while start != -1:
            depth, in_str, escape = 0, False, False
            for i in range(start, len(candidate)):
                ch = candidate[i]
                if in_str:
                    if escape:
                        escape = False
                    elif ch == "\\":
                        escape = True
                    elif ch == '"':
                        in_str = False
                elif ch == '"':
                    in_str = True
                elif ch == "{":
                    depth += 1
                elif ch == "}":
                    depth -= 1
                    if depth == 0:
                        try:
                            return json.loads(candidate[start : i + 1])
                        except json.JSONDecodeError:
                            break
            start = candidate.find("{", start + 1)
    raise ValueError("No JSON object found in model reply")
