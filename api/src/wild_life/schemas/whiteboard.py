"""Whiteboard schemas — the single scratch buffer.

Deliberately not an ``Entity``: no id, no created_at. The buffer has no identity
to expose, which is the point of keeping it outside the entity model.
"""

from datetime import datetime

from pydantic import BaseModel


class WhiteboardRead(BaseModel):
    content: str
    # Null until the buffer has ever been written.
    updated_at: datetime | None = None


class WhiteboardWrite(BaseModel):
    content: str = ""
