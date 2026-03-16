"""Pytest configuration for Phase 1 deployment integration tests (Z4-03)."""
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
