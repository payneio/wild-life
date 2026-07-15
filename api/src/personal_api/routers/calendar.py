"""Calendar routes: events."""

from personal_api.models.calendar import Event
from personal_api.routers.crud import crud_router
from personal_api.schemas.calendar import EventCreate, EventRead, EventUpdate

router = crud_router(
    prefix="/events",
    tag="calendar",
    model=Event,
    create_schema=EventCreate,
    read_schema=EventRead,
    update_schema=EventUpdate,
    order_by=Event.start_at,
)
