import os
from urllib.parse import urlparse

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
# OAuth redirect_uri = REDIRECT_BASE_URL + "/auth/{provider}/callback" (see routers/auth.py).
# Local dev: use http://localhost:5173/api because Vite proxies /api/* to the API (path is /api/... in the browser).
# Production API on its own host (e.g. Azure App Service): use the public API origin only — no /api suffix —
# because FastAPI routes live at /auth/..., not /api/auth/...
REDIRECT_BASE_URL = os.getenv("REDIRECT_BASE_URL", "http://localhost:5173/api")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")


def _normalize_origin(url: str) -> str:
    """Return scheme://host[:port] from a URL-ish string; empty on failure."""
    raw = (url or "").strip()
    if not raw:
        return ""
    parsed = urlparse(raw)
    scheme = parsed.scheme
    netloc = parsed.netloc
    if not scheme and not netloc:
        # Handle host/path (or bare host) by assuming https for cloud default.
        host = raw.split("/", 1)[0]
        return f"https://{host}" if host else ""
    if scheme and netloc:
        return f"{scheme}://{netloc}"
    return ""


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _default_cookie_policy() -> tuple[str, bool]:
    """
    Choose cookie policy based on frontend/API topology:
    - same-origin (local dev/proxy): Lax + non-secure allowed
    - cross-origin (deployed frontend -> deployed API): None + Secure
    """
    frontend_origin = _normalize_origin(FRONTEND_URL)
    api_origin = _normalize_origin(REDIRECT_BASE_URL)
    is_cross_origin = bool(frontend_origin and api_origin and frontend_origin != api_origin)
    is_https = frontend_origin.startswith("https://") or api_origin.startswith("https://")
    if is_cross_origin:
        return ("none", True)
    return ("lax", is_https)


_DEFAULT_SAMESITE, _DEFAULT_SECURE = _default_cookie_policy()
AUTH_COOKIE_SAMESITE = os.getenv("AUTH_COOKIE_SAMESITE", _DEFAULT_SAMESITE).strip().lower()
if AUTH_COOKIE_SAMESITE not in {"lax", "strict", "none"}:
    AUTH_COOKIE_SAMESITE = _DEFAULT_SAMESITE
AUTH_COOKIE_SECURE = _bool_env("AUTH_COOKIE_SECURE", _DEFAULT_SECURE)

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


# Pro: max conversations/collections/learning topics owned at once (current total).
LIMIT_PRO_CONVERSATIONS = _int_env("LIMIT_PRO_CONVERSATIONS", 100)
LIMIT_PRO_COLLECTIONS = _int_env("LIMIT_PRO_COLLECTIONS", 50)
LIMIT_PRO_LEARNING_TOPICS = _int_env("LIMIT_PRO_LEARNING_TOPICS", 100)

# Starter: lifetime cap on creations (deleting does not free slots).
LIMIT_STARTER_CONVERSATIONS = _int_env("LIMIT_STARTER_CONVERSATIONS", 5)
LIMIT_STARTER_COLLECTIONS = _int_env("LIMIT_STARTER_COLLECTIONS", 5)
LIMIT_STARTER_LEARNING_TOPICS = _int_env("LIMIT_STARTER_LEARNING_TOPICS", 5)

# ---------------------------------------------------------------------------
# Model costs for admin reports (REP-07). Cost = USD per 1K tokens.
# Override any value via env: MODEL_COST_<ID> e.g. MODEL_COST_GPT_4O_MINI=0.0002
# To add a new model: add its id to KNOWN_MODELS and a default to _DEFAULT_MODEL_COSTS.
# ---------------------------------------------------------------------------

def _float_env(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


# Models that may be used by chat or help (even if no conversation uses them yet).
KNOWN_MODELS = [
    "gpt-4o-mini",
    "gpt-4o",
    "gpt-4.1-mini",
    "gemini-2.0-flash",
    "gemini-1.5-pro",
]

# Default cost per 1K tokens (USD). Update or override via env to reflect current pricing.
_DEFAULT_MODEL_COSTS = {
    "gpt-4o-mini": 0.00015,
    "gpt-4o": 0.0025,
    "gpt-4.1-mini": 0.0004,
    "gemini-2.0-flash": 0.000075,
    "gemini-1.5-pro": 0.00125,
}


def _env_key_for_model(model_id: str) -> str:
    """e.g. gpt-4o-mini -> MODEL_COST_GPT_4O_MINI (uppercase, dots/dashes -> underscore)."""
    key = model_id.upper().replace(".", "_").replace("-", "_")
    return f"MODEL_COST_{key}"


def get_model_cost_per_1k_tokens(model_id: str) -> float | None:
    """
    Return configured cost (USD per 1K tokens) for a model, or None if not configured.
    Values are defined here and in _DEFAULT_MODEL_COSTS; override via env MODEL_COST_<ID>.
    """
    default = _DEFAULT_MODEL_COSTS.get(model_id)
    env_key = _env_key_for_model(model_id)
    raw = os.getenv(env_key)
    if raw is not None:
        try:
            return float(raw)
        except ValueError:
            pass
    return default
