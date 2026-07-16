"""Routes for commitments, waiting items, and delegations."""

from fastapi import APIRouter

from personal_api.models.tracking import Commitment, Delegation, WaitingItem
from personal_api.routers.crud import crud_router
from personal_api.schemas.tracking import (
    CommitmentCreate,
    CommitmentRead,
    CommitmentUpdate,
    DelegationCreate,
    DelegationRead,
    DelegationUpdate,
    WaitingItemCreate,
    WaitingItemRead,
    WaitingItemUpdate,
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
        prefix="/waiting-items",
        tag="waiting",
        model=WaitingItem,
        create_schema=WaitingItemCreate,
        read_schema=WaitingItemRead,
        update_schema=WaitingItemUpdate,
        order_by=WaitingItem.created_at.desc(),
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
