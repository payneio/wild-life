"""Who am I — the identity behind the calling token.

Read-only and deliberately not part of `/preferences`: that store is writable
user settings, whereas this is resolved from the token (owner → the configured
`WILD_LIFE_SELF_PERSON_ID`, worker → its own person). Nothing here is settable
by the client.
"""

from fastapi import APIRouter, Depends

from wild_life.identity import Identity, current_identity
from wild_life.schemas.common import IdentityRead

router = APIRouter(tags=["identity"])


@router.get("/me", response_model=IdentityRead, operation_id="identity_me")
def get_me(identity: Identity = Depends(current_identity)) -> IdentityRead:
    return IdentityRead(role=identity.role, person_id=identity.person_id)
