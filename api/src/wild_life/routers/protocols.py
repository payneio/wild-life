"""Routes for protocols — grouped routines a program repeats toward an outcome."""

from fastapi import APIRouter

from wild_life.models.protocols import Protocol
from wild_life.routers.crud import crud_router
from wild_life.schemas.protocols import ProtocolCreate, ProtocolRead, ProtocolUpdate

router = APIRouter()

# Liveness is derived (not paused + in-window), so a protocol ending needs no
# ripple onto its steps — the regimen simply stops surfacing them.
router.include_router(
    crud_router(
        prefix="/protocols",
        tag="protocols",
        model=Protocol,
        create_schema=ProtocolCreate,
        read_schema=ProtocolRead,
        update_schema=ProtocolUpdate,
        order_by=Protocol.name,
    )
)
