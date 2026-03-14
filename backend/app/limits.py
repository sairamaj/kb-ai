"""
Role-based resource limits (AUTHZ-06, AUTHZ-07, AUTHZ-14).

Central place for conversation and collection limits by role.
Pro: current total; Starter: lifetime cap. Administrators are exempt.
Values can be made configurable via env/config later.
"""
# Pro users: max number of conversations they can own at once (current total).
PRO_CONVERSATION_LIMIT = 100

# Starter users: lifetime cap on conversations created (deleting does not free slots).
STARTER_CONVERSATION_LIMIT = 5
