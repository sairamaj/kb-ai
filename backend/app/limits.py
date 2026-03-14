"""
Role-based resource limits (AUTHZ-06, AUTHZ-07, AUTHZ-09, AUTHZ-10, AUTHZ-14).

Single source of truth: all limit checks use these values. They are read from
app.config, which loads from environment variables (see config.py). Changing
limits in config or via env updates enforcement everywhere without code changes.

- Pro: current total owned (deleting frees a slot).
- Starter: lifetime cap (deleting does not free slots).
- Administrator: exempt (unlimited).
"""
from app.config import (
    LIMIT_PRO_COLLECTIONS,
    LIMIT_PRO_CONVERSATIONS,
    LIMIT_STARTER_COLLECTIONS,
    LIMIT_STARTER_CONVERSATIONS,
)

# Re-export for consumers; all limit-checking code paths use these.
PRO_CONVERSATION_LIMIT = LIMIT_PRO_CONVERSATIONS
STARTER_CONVERSATION_LIMIT = LIMIT_STARTER_CONVERSATIONS
PRO_COLLECTION_LIMIT = LIMIT_PRO_COLLECTIONS
STARTER_COLLECTION_LIMIT = LIMIT_STARTER_COLLECTIONS
