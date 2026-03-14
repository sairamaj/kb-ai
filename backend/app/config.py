import os

# OAuth providers
GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.getenv("GOOGLE_CLIENT_SECRET", "")
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET", "")

# JWT
SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = 60 * 60 * 24 * 7  # 7 days

# URLs
# All OAuth redirect URIs go through the Vite proxy so the browser receives
# the Set-Cookie header on localhost:5173 (the same origin as the SPA).
REDIRECT_BASE_URL = os.getenv("REDIRECT_BASE_URL", "http://localhost:5173/api")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# ---------------------------------------------------------------------------
# Role-based resource limits (AUTHZ-14). Single source of truth for enforcement.
# Override via environment variables; invalid values fall back to defaults.
# ---------------------------------------------------------------------------


def _int_env(name: str, default: int) -> int:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        val = int(raw)
        return val if val >= 0 else default
    except ValueError:
        return default


# Pro: max conversations/collections owned at once (current total).
LIMIT_PRO_CONVERSATIONS = _int_env("LIMIT_PRO_CONVERSATIONS", 100)
LIMIT_PRO_COLLECTIONS = _int_env("LIMIT_PRO_COLLECTIONS", 50)

# Starter: lifetime cap on creations (deleting does not free slots).
LIMIT_STARTER_CONVERSATIONS = _int_env("LIMIT_STARTER_CONVERSATIONS", 5)
LIMIT_STARTER_COLLECTIONS = _int_env("LIMIT_STARTER_COLLECTIONS", 5)
