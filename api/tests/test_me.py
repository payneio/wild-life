"""The identity endpoint the web app uses to know who "I" am (no database)."""

import uuid

from fastapi.testclient import TestClient

from wild_life.config import settings
from wild_life.identity import registry


class TestMe:
    def test_requires_a_token(self, client: TestClient) -> None:
        assert client.get("/me").status_code == 401

    def test_reports_the_owner_self_person(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """`WILD_LIFE_SELF_PERSON_ID` is what pins you to the top of assignee
        pickers, so the endpoint must actually surface it."""
        original = settings.self_person_id
        person_id = uuid.uuid4()
        registry.set_owner(settings.token, person_id)
        try:
            body = client.get("/me", headers=auth_headers).json()
            assert body["role"] == "full"
            assert body["person_id"] == str(person_id)
        finally:
            registry.set_owner(settings.token, original)

    def test_tolerates_no_self_person(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        """Unset config is a valid state — the UI just gets no pinned person."""
        original = settings.self_person_id
        registry.set_owner(settings.token, None)
        try:
            body = client.get("/me", headers=auth_headers).json()
            assert body["person_id"] is None
        finally:
            registry.set_owner(settings.token, original)
