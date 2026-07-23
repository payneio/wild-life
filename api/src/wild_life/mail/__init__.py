"""Generic email transport + iMIP calendar mail for wild-life-api."""

from wild_life.mail.service import (
    fetch_messages,
    is_enabled,
    mark_handled,
    send_email,
)

__all__ = ["is_enabled", "send_email", "fetch_messages", "mark_handled"]
