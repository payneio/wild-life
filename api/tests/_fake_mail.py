"""A fake MailTransport for tests — captures sends, replays canned inbound mail.

Implements the `MailTransport` protocol so it drops into
``app.dependency_overrides[get_transport]`` with no real Bridge.
"""

from __future__ import annotations

from email import message_from_bytes
from email.message import EmailMessage, Message

from wild_life.mail.ics import build_reply, build_request
from wild_life.mail.transport import FetchedMessage


def make_ics_email(from_addr: str, ics_bytes: bytes, method: str) -> Message:
    """Build a raw email carrying an .ics part (an inbound invite/reply)."""
    msg = EmailMessage()
    msg["From"] = from_addr
    msg["To"] = "paul@payne.io"
    msg["Subject"] = "calendar"
    msg.set_content("see attachment")
    msg.add_attachment(
        ics_bytes,
        maintype="text",
        subtype="calendar",
        params={"method": method, "charset": "UTF-8"},
        filename="invite.ics",
    )
    return message_from_bytes(msg.as_bytes())


class FakeTransport:
    """Records outbound messages; serves a queue of inbound ones."""

    def __init__(self, inbound: list[Message] | None = None) -> None:
        self.sent: list[EmailMessage] = []
        self._inbound = list(inbound or [])
        self.handled: list[bytes] = []

    def send(self, msg: EmailMessage) -> None:
        self.sent.append(msg)

    def fetch(self, mailbox: str, unkeyword: str) -> list[FetchedMessage]:
        out = [
            FetchedMessage(imap_id=str(i).encode(), message=m)
            for i, m in enumerate(self._inbound)
        ]
        self._inbound = []  # consumed (mirrors keyword-flagging in the real one)
        return out

    def mark_handled(self, mailbox: str, imap_id: bytes, keyword: str) -> None:
        self.handled.append(imap_id)

    # --- introspection helpers for tests ---
    def sent_methods(self) -> list[str]:
        return [self._method(m) for m in self.sent]

    def sent_to_with_method(self, method: str) -> list[str]:
        out: list[str] = []
        for m in self.sent:
            if self._method(m) == method:
                out.append(str(m["To"]))
        return out

    @staticmethod
    def _method(msg: EmailMessage) -> str:
        for part in msg.walk():
            if part.get_content_type() == "text/calendar":
                return str(part.get_param("method") or "").upper()
        return ""


__all__ = ["FakeTransport", "make_ics_email", "build_request", "build_reply"]
