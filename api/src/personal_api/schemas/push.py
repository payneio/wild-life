"""Schemas for Web Push subscriptions."""

from pydantic import BaseModel


class PushKeys(BaseModel):
    p256dh: str
    auth: str


class PushSubscriptionCreate(BaseModel):
    """The shape the browser's PushSubscription serializes to, plus a label."""

    endpoint: str
    keys: PushKeys
    label: str | None = None


class VapidPublicKey(BaseModel):
    key: str


class ReminderTickResult(BaseModel):
    occurrences_notified: int
    pushes_sent: int
    subscriptions: int
    pruned: int
