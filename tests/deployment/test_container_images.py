"""
Phase 1 integration tests: container images (Z4-03).

Asserts that production backend and frontend images run correctly:
- Backend: GET /health returns 200 and indicates DB is ok.
- Frontend: GET / returns 200 and the response body contains the app (e.g. title or root div).

Requires Docker. Backend must be running with a test database; frontend must be running
with backend URL pointing to that backend. Use scripts/run-integration-tests.ps1 to
build, start, run these tests, and tear down (or start containers manually and set
BACKEND_URL / FRONTEND_URL if different from defaults).
"""
import pytest
import httpx


@pytest.mark.integration
def test_backend_health_returns_200(backend_url: str) -> None:
    """GET /health returns HTTP 200 when backend and DB are healthy."""
    with httpx.Client(timeout=10.0) as client:
        response = client.get(f"{backend_url}/health")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    data = response.json()
    assert data.get("status") == "ok", f"Expected status 'ok', got {data}"
    assert data.get("db") == "ok", f"Expected db 'ok', got {data}"


@pytest.mark.integration
def test_frontend_serves_app(frontend_url: str) -> None:
    """GET / returns HTTP 200 and the response body contains the frontend app."""
    with httpx.Client(timeout=10.0, follow_redirects=True) as client:
        response = client.get(f"{frontend_url}/")
    assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
    body = response.text
    # App title from frontend index.html
    assert "Prompt KB" in body, f"Expected 'Prompt KB' in response, got first 500 chars: {body[:500]}"
    # Root mount point for the SPA
    assert 'id="root"' in body, f"Expected root div in response, got first 500 chars: {body[:500]}"
