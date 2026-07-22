"""Global cross-entity search: GET /search?q=&types=&limit=.

Ranked substring search across every entity's curated text fields (see
``query.SEARCH_FIELDS``). Returns a flat, ranked list of {type, id, label,
snippet} — the "find anything" endpoint for external clients and the UI combobox.
"""

import re
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from wild_life.db.session import get_session
from wild_life.query import SEARCH_FIELDS, TYPE_TO_MODEL, q_clause

router = APIRouter(prefix="/search", tags=["search"])


_MENTION = re.compile(r"\[@([^\]]+)\]\(\w+:[0-9a-fA-F-]+\)")
_IMAGE = re.compile(r"!\[[^\]]*\]\(note-image:[^)]+\)")


def _clean(text: str) -> str:
    """Strip @-mention / image markdown so snippets read as plain text."""
    return _IMAGE.sub("", _MENTION.sub(r"@\1", text)).strip()


def _window(raw: str, q: str, pad: int = 32) -> str:
    text = _clean(raw)
    low = text.lower()
    i = low.find(q.lower())
    if i < 0:
        return text[: pad * 2] + ("…" if len(text) > pad * 2 else "")
    start = max(0, i - pad)
    end = min(len(text), i + len(q) + pad)
    return (
        ("…" if start else "")
        + text[start:end].strip()
        + ("…" if end < len(text) else "")
    )


@router.get("", operation_id="search")
async def search(
    q: str = Query(..., min_length=1),
    types: str | None = None,
    exclude_id: UUID | None = None,
    limit: int = Query(20, ge=1, le=100),
    session: AsyncSession = Depends(get_session),
) -> list[dict]:
    wanted = (
        [t.strip() for t in types.split(",") if t.strip() in SEARCH_FIELDS]
        if types
        else list(SEARCH_FIELDS.keys())
    )
    ql = q.lower()
    results: list[dict[str, Any]] = []

    for t in wanted:
        model = TYPE_TO_MODEL[t]
        label_col, text_cols = SEARCH_FIELDS[t]
        cols = model.__table__.columns
        present = [c for c in text_cols if c in cols]
        clause = q_clause(model, q)
        if clause is None:
            continue
        sel = select(cols["id"], *[cols[c] for c in present]).where(clause).limit(25)
        for row in (await session.execute(sel)).all():
            d = row._mapping
            if exclude_id is not None and d["id"] == exclude_id:
                continue
            label_val = str(d.get(label_col) or "").strip()
            lv = label_val.lower()
            rank = 0 if lv == ql else 1 if lv.startswith(ql) else 2 if ql in lv else 3
            snippet = None
            for c in present:
                if c == label_col:
                    continue
                v = d.get(c)
                if v and ql in str(v).lower():
                    snippet = _window(str(v), q)
                    break
            results.append(
                {
                    "type": t,
                    "id": str(d["id"]),
                    "label": label_val or (snippet or f"({t})"),
                    "snippet": snippet,
                    "rank": rank,
                }
            )

    results.sort(key=lambda r: (r["rank"], r["label"].lower()))
    return results[:limit]
