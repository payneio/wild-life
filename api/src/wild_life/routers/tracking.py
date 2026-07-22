"""Routes for commitments, waiting items, and delegations."""

from fastapi import APIRouter

from wild_life.models.tracking import Commitment, Delegation
from wild_life.routers.crud import crud_router
from wild_life.schemas.tracking import (
    CommitmentCreate,
    CommitmentRead,
    CommitmentUpdate,
    DelegationCreate,
    DelegationRead,
    DelegationUpdate,
)

router = APIRouter()

router.include_router(
    crud_router(
        prefix="/commitments",
        tag="commitments",
        model=Commitment,
        create_schema=CommitmentCreate,
        read_schema=CommitmentRead,
        update_schema=CommitmentUpdate,
        order_by=Commitment.created_at.desc(),
    )
)
router.include_router(
    crud_router(
        prefix="/delegations",
        tag="delegations",
        model=Delegation,
        create_schema=DelegationCreate,
        read_schema=DelegationRead,
        update_schema=DelegationUpdate,
        order_by=Delegation.created_at.desc(),
    )
)
