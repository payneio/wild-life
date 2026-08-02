"""Whiteboard schemas — the single scratch buffer.

Deliberately not an ``Entity``: no id, no created_at. The buffer has no identity
to expose, which is the point of keeping it outside the entity model.
"""

import uuid
from datetime import datetime

from pydantic import BaseModel


class WhiteboardRead(BaseModel):
    content: str
    # The token a writer must echo back. 0 before the buffer has ever been
    # written, so "I read an empty whiteboard" is a statable claim rather than
    # the absence of one.
    version: int = 0
    # Null until the buffer has ever been written.
    updated_at: datetime | None = None


class WhiteboardWrite(BaseModel):
    content: str = ""
    # Required, and required *without a default*: a writer that never read
    # cannot name a version, so it cannot form this request. That is the whole
    # protection — an editor rendered over a buffer it failed to load has
    # nothing to send, instead of sending an empty string over your notes.
    base_version: int


class WhiteboardRevisionRead(BaseModel):
    id: uuid.UUID
    version: int
    replaced_at: datetime
    # Enough to recognise a revision without shipping every one of them in full.
    size: int
    preview: str

    model_config = {"from_attributes": True}


class WhiteboardRevisionContent(BaseModel):
    id: uuid.UUID
    version: int
    replaced_at: datetime
    content: str

    model_config = {"from_attributes": True}
