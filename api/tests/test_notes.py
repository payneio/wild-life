"""What is left of `notes` after the surfaces moved to moments.

The Journal and the Inbox are no longer here. Both were defined by negation once
— Journal was "notes carrying neither tag", Inbox was "every unrooted note" —
then by a root, and now by kind: `reflection` and `capture`, in
`test_moments_api.py`, which is also where the two-expressions-of-one-definition
check against `/review-dashboard` lives.

This endpoint still serves the table until Phase 5 drops it, and nothing reads it
any more. What remains worth pinning is that the genre column stayed dead.
"""

from fastapi.testclient import TestClient

MARK = "ZZ-notes"


class TestGenreIsGone:
    def test_note_type_is_not_accepted_or_returned(
        self, client: TestClient, auth_headers: dict[str, str], require_db: None
    ) -> None:
        """A genre column only ever restated the root, so it no longer exists.
        Pydantic ignores the unknown key rather than 422-ing; what matters is that
        nothing round-trips."""
        r = client.post(
            "/notes",
            json={"title": f"{MARK} genre", "body": "x", "note_type": "journal"},
            headers=auth_headers,
        )
        assert r.status_code == 201
        assert "note_type" not in r.json()
        client.delete(f"/notes/{r.json()['id']}", headers=auth_headers)


class TestWhiteboard:
    def test_is_one_buffer_that_survives_writes(
        self, client: TestClient, auth_headers: dict[str, str], require_db: None
    ) -> None:
        """Singular by construction — there is no id to address and nothing to
        list, which is what keeps it out of the entity model."""
        before = client.get("/whiteboard", headers=auth_headers)
        assert before.status_code == 200
        original = before.json()["content"]
        try:
            r = client.put(
                "/whiteboard", json={"content": f"{MARK} scratch"}, headers=auth_headers
            )
            assert r.status_code == 200
            assert r.json()["content"] == f"{MARK} scratch"
            assert client.get("/whiteboard", headers=auth_headers).json()[
                "content"
            ] == (f"{MARK} scratch")
        finally:
            client.put("/whiteboard", json={"content": original}, headers=auth_headers)
