"""Bearer-token auth tests (no database required)."""

from fastapi.testclient import TestClient


class TestAuth:
    """The auth middleware runs before any route/DB access."""

    def test_health_is_open(self, client: TestClient) -> None:
        """Health check needs no token (castle readiness probe)."""
        assert client.get("/health").status_code == 200

    def test_protected_without_token_is_401(self, client: TestClient) -> None:
        """A protected route rejects a request with no Authorization header."""
        assert client.get("/areas").status_code == 401

    def test_protected_with_bad_token_is_401(self, client: TestClient) -> None:
        """A wrong token is rejected before the database is touched."""
        resp = client.get("/areas", headers={"Authorization": "Bearer nope"})
        assert resp.status_code == 401

    def test_preflight_options_not_challenged(self, client: TestClient) -> None:
        """CORS preflight (OPTIONS) is never auth-challenged."""
        resp = client.options(
            "/areas",
            headers={
                "Origin": "http://localhost:5173",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.status_code != 401
