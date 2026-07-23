"""Schemas for the calendar-mail tick + per-event invite send."""

from pydantic import BaseModel


class MailTickResult(BaseModel):
    """Outcome of one POST /calendar/mail/tick."""

    disabled: bool = False
    requests_sent: int = 0
    cancels_sent: int = 0
    replies_sent: int = 0
    invites_ingested: int = 0
    responses_ingested: int = 0
    errors: int = 0


class SendInvitesResult(BaseModel):
    """Outcome of POST /events/{id}/invites/send."""

    disabled: bool = False
    requests_sent: int = 0
    cancels_sent: int = 0


class RsvpBody(BaseModel):
    """Set my response to a received invite (and email it to the organizer)."""

    status: str  # accepted | declined | tentative | needs-action


class AttendeeResponseRead(BaseModel):
    """A guest's RSVP to a hosted event."""

    attendee_email: str
    partstat: str
    comment: str | None = None

    model_config = {"from_attributes": True}


class GuestStatus(BaseModel):
    """One guest's invite state on a hosted event (drives the Guests panel)."""

    email: str
    name: str | None = None
    # False = pending (no REQUEST sent yet); True = invited.
    invited: bool = False
    # needs-action | accepted | declined | tentative | None (no reply yet)
    partstat: str | None = None
