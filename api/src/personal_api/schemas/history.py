"""Read schema for the change log."""

import uuid
from datetime import datetime
from typing import Any

from personal_api.schemas.common import ORMModel


class ChangeLogRead(ORMModel):
    """A recorded change to an entity."""

    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID | None
    entity_label: str | None
    action: str
    changes: dict[str, Any]
    created_at: datetime
