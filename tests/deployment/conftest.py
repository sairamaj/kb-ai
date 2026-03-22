"""Pytest configuration for deployment integration tests (Z4-03, Z4-08, Z4-10)."""
import os

import pytest


def _base_url(env_name: str, default: str) -> str:
    url = (os.environ.get(env_name) or default).rstrip("/")
    return url


@pytest.fixture(scope="session")
def backend_url() -> str:
    """Base URL of the backend (e.g. http://localhost:8000)."""
    return _base_url("BACKEND_URL", "http://localhost:8000")


@pytest.fixture(scope="session")
def frontend_url() -> str:
    """Base URL of the frontend (e.g. http://localhost:8080)."""
    return _base_url("FRONTEND_URL", "http://localhost:8080")


@pytest.fixture(scope="session")
def deployed_backend_url() -> str:
    """
    Base URL for Phase 3 deployed-backend tests (Z4-08).

    Set TEST_BACKEND_URL (recommended for staging) or BACKEND_URL to avoid
    colliding with local defaults. If neither is set, deployment tests skip.
    """
    raw = (os.environ.get("TEST_BACKEND_URL") or os.environ.get("BACKEND_URL") or "").strip()
    if not raw:
        pytest.skip(
            "Set TEST_BACKEND_URL or BACKEND_URL to the deployed backend base URL "
            "(e.g. https://promptkb-api.azurewebsites.net). "
            "See docs/developer.md — Phase 3 integration tests (Z4-08)."
        )
    return raw.rstrip("/")


@pytest.fixture(scope="session")
def deployed_frontend_url() -> str:
    """
    Base URL for Phase 4 deployed-frontend tests (Z4-10).

    Set TEST_FRONTEND_URL (recommended) or FRONTEND_URL to the deployed SPA origin.
    If neither is set, tests using this fixture skip (safe when only running other markers).
    """
    raw = (os.environ.get("TEST_FRONTEND_URL") or os.environ.get("FRONTEND_URL") or "").strip()
    if not raw:
        pytest.skip(
            "Set TEST_FRONTEND_URL or FRONTEND_URL to the deployed frontend base URL "
            "(e.g. https://promptkb.azurewebsites.net). "
            "See docs/developer.md — Phase 4 integration tests (Z4-10)."
        )
    return raw.rstrip("/")
