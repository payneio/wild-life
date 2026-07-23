"""Mail transport — the blocking SMTP/IMAP boundary against Proton Bridge.

`MailTransport` is a narrow `Protocol` so the service layer (and tests) can swap
in a fake. `BridgeTransport` is the real thing: stdlib ``smtplib``/``imaplib`` over
the local Proton Bridge (STARTTLS SMTP :1025 / IMAP :1143). Every method here is
**synchronous and blocking** — callers wrap them in ``asyncio.to_thread`` (see
``service.py``). Lifted from the calendar-mail sidecar's proven send/fetch paths.
"""

from __future__ import annotations

import email
import imaplib
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage, Message
from typing import Protocol


@dataclass
class FetchedMessage:
    """One fetched IMAP message: its server-side id plus the parsed email."""

    imap_id: bytes
    message: Message


class MailTransport(Protocol):
    """The minimal SMTP+IMAP surface the calendar-mail tick needs."""

    def send(self, msg: EmailMessage) -> None:
        """Deliver one already-built message over SMTP."""
        ...

    def fetch(self, mailbox: str, unkeyword: str) -> list[FetchedMessage]:
        """Return messages in ``mailbox`` not yet flagged with ``unkeyword``."""
        ...

    def mark_handled(self, mailbox: str, imap_id: bytes, keyword: str) -> None:
        """Flag a message so a later fetch skips it (best-effort)."""
        ...


class BridgeTransport:
    """Concrete transport over the local Proton Bridge."""

    def __init__(
        self,
        *,
        smtp_host: str,
        smtp_port: int,
        imap_host: str,
        imap_port: int,
        username: str,
        password: str,
    ) -> None:
        self._smtp_host = smtp_host
        self._smtp_port = smtp_port
        self._imap_host = imap_host
        self._imap_port = imap_port
        self._username = username
        self._password = password

    def send(self, msg: EmailMessage) -> None:
        smtp = smtplib.SMTP(self._smtp_host, self._smtp_port)
        try:
            smtp.starttls()
            smtp.login(self._username, self._password)
            smtp.send_message(msg)
        finally:
            smtp.quit()

    def _imap(self) -> imaplib.IMAP4:
        imap = imaplib.IMAP4(self._imap_host, self._imap_port)
        imap.starttls()
        imap.login(self._username, self._password)
        return imap

    def fetch(self, mailbox: str, unkeyword: str) -> list[FetchedMessage]:
        imap = self._imap()
        try:
            imap.select(mailbox)
            # Prefer a keyword filter so we only see not-yet-ingested mail; fall
            # back to ALL if the server rejects keyword search (dedup upstream
            # still makes reprocessing safe).
            typ, data = imap.search(None, "UNKEYWORD", unkeyword)
            if typ != "OK":
                typ, data = imap.search(None, "ALL")
            ids = data[0].split() if data and data[0] else []

            out: list[FetchedMessage] = []
            for num in ids:
                typ, msg_data = imap.fetch(num, "(RFC822)")
                if typ != "OK" or not msg_data or not msg_data[0]:
                    continue
                raw = msg_data[0][1]
                if not isinstance(raw, (bytes, bytearray)):
                    continue
                out.append(
                    FetchedMessage(
                        imap_id=num, message=email.message_from_bytes(bytes(raw))
                    )
                )
            return out
        finally:
            try:
                imap.logout()
            except imaplib.IMAP4.error:
                pass

    def mark_handled(self, mailbox: str, imap_id: bytes, keyword: str) -> None:
        imap = self._imap()
        try:
            imap.select(mailbox)
            try:
                mid = imap_id.decode() if isinstance(imap_id, bytes) else imap_id
                imap.store(mid, "+FLAGS", f"({keyword})")
            except imaplib.IMAP4.error:
                pass  # best-effort — dedup covers us anyway
        finally:
            try:
                imap.logout()
            except imaplib.IMAP4.error:
                pass
