"""Unit tests for identity resolution and the worker write policy (no DB)."""

import uuid

from personal_api.identity import (
    Identity,
    TokenRegistry,
    hash_token,
    worker_write_allowed,
)


def test_hash_token_is_stable_and_opaque() -> None:
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != hash_token("abd")
    assert "abc" not in hash_token("abc")


def test_registry_owner_lookup() -> None:
    reg = TokenRegistry()
    pid = uuid.uuid4()
    reg.set_owner("owner-secret", pid)
    ident = reg.lookup("owner-secret")
    assert ident == Identity("full", pid, hash_token("owner-secret"))
    assert reg.lookup("nope") is None


def test_worker_write_allow_matrix() -> None:
    allow = [
        ("POST", "/tasks"),
        ("PATCH", "/tasks/abc"),
        ("POST", "/notes"),
        ("POST", "/requests"),
        ("PATCH", "/requests/abc"),
        ("POST", "/requests/abc/resolve"),
        ("POST", "/delegations"),
        ("PATCH", "/delegations/abc"),
        ("POST", "/mcp-worker"),
        ("DELETE", "/mcp-worker"),
    ]
    for method, path in allow:
        assert worker_write_allowed(method, path), (method, path)

    deny = [
        ("DELETE", "/tasks/abc"),  # workers may not delete tasks
        ("PATCH", "/notes/abc"),  # notes are append-only for workers
        ("DELETE", "/notes/abc"),
        ("POST", "/projects"),
        ("PATCH", "/areas/abc"),
        ("POST", "/people"),
        ("POST", "/mcp"),  # the full server is owner-only
    ]
    for method, path in deny:
        assert not worker_write_allowed(method, path), (method, path)
