"""Schemas for API-token administration."""

import uuid
from datetime import datetime

from pydantic import BaseModel

from personal_api.schemas.common import Entity, TokenRole


class ApiTokenCreate(BaseModel):
    label: str
    person_id: uuid.UUID | None = None
    role: TokenRole = "worker"


class ApiTokenRead(Entity):
    label: str
    person_id: uuid.UUID | None = None
    role: str
    revoked_at: datetime | None = None


class ApiTokenCreated(ApiTokenRead):
    """Returned once on creation — carries the raw token (never stored)."""

    token: str
