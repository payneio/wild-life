"""Web Push delivery — VAPID key handling + sending to a subscription.

The VAPID private key (PKCS8 PEM) comes from settings; the browser-facing
application server key is derived from it so there's a single source of truth.
"""

from __future__ import annotations

import base64
import functools
import json
import logging
from typing import Any

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid02
from pywebpush import WebPushException, webpush

from wild_life.config import settings

log = logging.getLogger("wild_life.push")


def is_enabled() -> bool:
    return bool(settings.vapid_private_key.strip())


def _private_key_pem() -> str:
    """The VAPID private key as a proper multi-line PEM string.

    systemd ``EnvironmentFile`` can't carry multi-line values and strips
    backslash escapes, so the secret is stored **base64-encoded** (single line,
    no special chars). Accept a raw/real-newline PEM too, for local dev.
    """
    raw = settings.vapid_private_key.strip()
    if "BEGIN" in raw:
        return raw
    return base64.b64decode(raw).decode()


@functools.lru_cache(maxsize=1)
def _vapid() -> Vapid02:
    """A Vapid signer built from the PEM. Passing an instance to pywebpush avoids
    its string path, which expects base64-DER (not PEM) and mis-parses ours."""
    return Vapid02.from_pem(_private_key_pem().encode("utf8"))


@functools.lru_cache(maxsize=1)
def application_server_key() -> str:
    """base64url (unpadded) of the uncompressed VAPID public point.

    This is the value the browser passes as ``applicationServerKey`` when it
    subscribes. Derived from the private PEM so it can never drift.
    """
    pem = _private_key_pem().encode()
    priv = serialization.load_pem_private_key(pem, password=None)
    raw = priv.public_key().public_bytes(
        serialization.Encoding.X962,
        serialization.PublicFormat.UncompressedPoint,
    )
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


class SubscriptionGone(Exception):
    """The push endpoint reported the subscription no longer exists (404/410)."""


def send_push(
    *, endpoint: str, p256dh: str, auth: str, payload: dict[str, Any]
) -> None:
    """Deliver one push message. Raises SubscriptionGone if it should be pruned."""
    try:
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth},
            },
            data=json.dumps(payload),
            vapid_private_key=_vapid(),
            vapid_claims={"sub": settings.vapid_subject},
            ttl=3600,
        )
    except WebPushException as exc:
        status = getattr(exc.response, "status_code", None)
        if status in (404, 410):
            raise SubscriptionGone(endpoint) from exc
        log.warning("web push failed (%s): %s", status, exc)
        raise
