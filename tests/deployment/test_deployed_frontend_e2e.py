"""
Phase 4 integration tests: deployed frontend and E2E smoke (Z4-10).

HTTP-only smoke (no browser): confirm the live frontend serves the SPA and the live
backend health endpoint is reachable—end-to-end connectivity without user credentials.

**Frontend URL:** set **TEST_FRONTEND_URL** (recommended) or **FRONTEND_URL**.

**Backend URL (connectivity check):** set **TEST_BACKEND_URL** or **BACKEND_URL**
(same as Z4-08).

Run: pytest tests/deployment/ -v -m deployment_e2e
Or: ./scripts/run-deployed-e2e-tests.sh / .ps1 (requires both URL groups)
"""
import pytest
import httpx


@pytest.mark.deployment_e2e
def test_deployed_frontend_root_returns_app(deployed_frontend_url: str) -> None:
    """GET / returns 200 and HTML that identifies the Prompt KB SPA."""
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        response = client.get(f"{deployed_frontend_url}/")
    assert response.status_code == 200, (
        f"Expected 200 from frontend /, got {response.status_code}: {response.text[:500]}"
    )
    body = response.text
    assert "Prompt KB" in body, f"Expected app title in HTML, got first 500 chars: {body[:500]}"
    assert 'id="root"' in body, f"Expected SPA root div, got first 500 chars: {body[:500]}"


@pytest.mark.deployment_e2e
def test_deployed_frontend_client_route_serves_spa(deployed_frontend_url: str) -> None:
    """
    GET a client-only path returns the SPA shell (nginx try_files → index.html).

    Uses /feed, which exists in the router but has no static file on disk.
    """
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        response = client.get(f"{deployed_frontend_url}/feed")
    assert response.status_code == 200, (
        f"Expected 200 for deep-linked /feed, got {response.status_code}: {response.text[:500]}"
    )
    body = response.text
    assert "Prompt KB" in body, f"Expected SPA shell for /feed, got first 500 chars: {body[:500]}"
    assert 'id="root"' in body, f"Expected root div for /feed, got first 500 chars: {body[:500]}"


@pytest.mark.deployment_e2e
def test_deployed_backend_health_reachable_for_e2e(deployed_backend_url: str) -> None:
    """
    Simulates the browser calling the API: public GET /health returns 200.

    Same assertion shape as Z4-08; included so one marker run validates both apps.
    """
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        response = client.get(f"{deployed_backend_url}/health")
    assert response.status_code == 200, (
        f"Expected 200 from /health, got {response.status_code}: {response.text[:500]}"
    )
    data = response.json()
    assert data.get("status") == "ok", f"Expected status 'ok', got {data}"
    assert data.get("db") == "ok", f"Expected db 'ok', got {data}"
