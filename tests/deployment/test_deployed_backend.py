"""
Phase 3 integration tests: deployed backend (Z4-08).

Smoke the live backend (staging or production URL). Do not commit credentials;
use a staging slot or test deployment.

Requires **TEST_BACKEND_URL** or **BACKEND_URL** set to the API base URL, e.g.:
  https://promptkb-api.azurewebsites.net

(No trailing slash; paths are /health, /auth/me.)

Run: pytest tests/deployment/ -v -m deployment
Or: ./scripts/run-deployed-backend-tests.sh / .ps1
"""
import pytest
import httpx


@pytest.mark.deployment
def test_deployed_health_returns_200(deployed_backend_url: str) -> None:
    """GET /health returns HTTP 200 and healthy body when app and DB are up."""
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        response = client.get(f"{deployed_backend_url}/health")
    assert response.status_code == 200, (
        f"Expected 200 from /health, got {response.status_code}: {response.text[:500]}"
    )
    data = response.json()
    assert data.get("status") == "ok", f"Expected status 'ok', got {data}"
    assert data.get("db") == "ok", f"Expected db 'ok' (DB reachable), got {data}"


@pytest.mark.deployment
def test_deployed_protected_route_requires_auth(deployed_backend_url: str) -> None:
    """GET /auth/me without credentials returns 401 (or 403) so API is reachable and auth enforced."""
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        response = client.get(f"{deployed_backend_url}/auth/me")
    assert response.status_code in (401, 403), (
        f"Expected 401 or 403 for unauthenticated /auth/me, "
        f"got {response.status_code}: {response.text[:300]}"
    )
