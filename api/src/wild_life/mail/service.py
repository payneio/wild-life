"""Generic email service — transport-agnostic send/fetch, async-wrapped.

Knows nothing about calendars: an ``.ics`` invite is just one kind of attachment.
The blocking ``MailTransport`` calls are pushed onto a thread so they never stall
the event loop (mirrors how ``push.py`` is a plain sync sender). ``is_enabled()``
gates the whole feature the way ``push.is_enabled()`` gates web push.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable, Sequence
from email.message import EmailMessage

from wild_life.config import settings
from wild_life.mail.transport import FetchedMessage, MailTransport

log = logging.getLogger("wild_life.mail")

# One attachment = (payload, maintype, subtype, params, filename). An iMIP part
# is e.g. (ics_bytes, "text", "calendar", {"method": "REQUEST", "charset": "UTF-8"},
# "invite.ics").
Attachment = tuple[bytes, str, str, dict[str, str], str]


def is_enabled() -> bool:
    """True when calendar mail is configured (flag + SMTP creds present)."""
    return bool(settings.mail_enabled and settings.smtp_user and settings.smtp_password)


def build_message(
    *,
    to: str | Sequence[str],
    subject: str,
    text_body: str,
    attachments: Iterable[Attachment] = (),
    from_addr: str | None = None,
) -> EmailMessage:
    """Assemble an ``EmailMessage`` (kept sync + pure so tests can inspect it)."""
    recipients = [to] if isinstance(to, str) else list(to)
    msg = EmailMessage()
    msg["From"] = from_addr or settings.mail_from
    msg["To"] = ", ".join(recipients)
    msg["Subject"] = subject
    msg.set_content(text_body)
    for payload, maintype, subtype, params, filename in attachments:
        msg.add_attachment(
            payload,
            maintype=maintype,
            subtype=subtype,
            params=params,
            filename=filename,
        )
    return msg


async def send_email(
    transport: MailTransport,
    *,
    to: str | Sequence[str],
    subject: str,
    text_body: str,
    attachments: Iterable[Attachment] = (),
    from_addr: str | None = None,
) -> None:
    """Build and deliver one email over ``transport`` off the event loop."""
    msg = build_message(
        to=to,
        subject=subject,
        text_body=text_body,
        attachments=attachments,
        from_addr=from_addr,
    )
    await asyncio.to_thread(transport.send, msg)


async def fetch_messages(
    transport: MailTransport, mailbox: str, unkeyword: str
) -> list[FetchedMessage]:
    """Fetch not-yet-handled messages off the event loop."""
    return await asyncio.to_thread(transport.fetch, mailbox, unkeyword)


async def mark_handled(
    transport: MailTransport, mailbox: str, imap_id: bytes, keyword: str
) -> None:
    """Flag a message as handled off the event loop."""
    await asyncio.to_thread(transport.mark_handled, mailbox, imap_id, keyword)
