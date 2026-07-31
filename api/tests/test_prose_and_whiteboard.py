"""What prose is, and the one buffer that is not prose.

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
        """A genre only ever restated the root, so there is no column for one.

        The claim outlived its endpoint. This asked `/notes` before writing
        became a moment and the notes table was retired; the thing being denied
        is the same, so it asks the surface that exists. Pydantic ignores an
        unknown key rather than 422-ing, which is why the assertion is about
        what comes back rather than about the status.
        """
        r = client.post(
            "/moments",
            json={
                "kind": "reflection",
                "body": f"{MARK} genre",
                "note_type": "journal",
            },
            headers=auth_headers,
        )
        assert r.status_code == 201, r.text
        assert "note_type" not in r.json()
        client.delete(f"/moments/{r.json()['id']}", headers=auth_headers)


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
