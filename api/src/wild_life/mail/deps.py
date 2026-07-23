"""FastAPI dependency providing the mail transport.

Real requests get a `BridgeTransport` built from settings; tests override
``get_transport`` with a fake so nothing touches a real Bridge.
"""

from __future__ import annotations

from wild_life.config import settings
from wild_life.mail.transport import BridgeTransport, MailTransport


def get_transport() -> MailTransport:
    return BridgeTransport(
        smtp_host=settings.smtp_host,
        smtp_port=settings.smtp_port,
        imap_host=settings.imap_host,
        imap_port=settings.imap_port,
        username=settings.smtp_user,
        password=settings.smtp_password,
    )
