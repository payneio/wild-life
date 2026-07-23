"""Preferences schemas — typed validation over the generic Preference KV.

The ``"calendar"`` key holds invite/RSVP preferences "like a standard calendar".
"""

from pydantic import BaseModel, Field


class CalendarPrefs(BaseModel):
    """Invite/RSVP preferences (Preference key ``"calendar"``)."""

    # Ask guests to RSVP (adds RSVP=TRUE to outbound ATTENDEE lines).
    request_rsvp: bool = True
    # Which responses the received-invite RSVP control offers.
    rsvp_options: list[str] = Field(
        default_factory=lambda: ["accepted", "tentative", "declined"]
    )
    # True → adding guests / editing an invited event sends automatically
    # (skip the confirm dialog); False → always confirm first.
    auto_send: bool = False
    # Reminder lead times (minutes) offered on invites.
    default_reminders: list[int] = Field(default_factory=lambda: [1440, 60])
    # Organizer / From identity; empty → fall back to settings.mail_from.
    organizer_from: str = ""
    # Let guests propose a new time (COUNTER). Not handled yet in v1.
    allow_propose_new_time: bool = False


class PreferenceRead(BaseModel):
    key: str
    value: dict

    model_config = {"from_attributes": True}
