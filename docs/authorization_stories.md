## Authorization — Phased User Stories

This document defines a phased set of implementation stories for role-based authorization and resource limits, derived from `docs/authorization.MD`. Each story is written so it can be handed to an agent for implementation at a later stage. No code-level details are included; each story focuses on behavior, inputs/outputs, and acceptance criteria.

---

## Phase 1 — Roles in User Model and Auth Flow

### AUTHZ-01 — Represent user roles in the system

**Goal:** Ensure every user in the system has a single, explicit authorization role that can be used consistently across backend and frontend.

**Description:**
- Introduce a `role` (or `tier`) attribute on the user entity with three allowed values: `administrator`, `pro`, and `starter`.
- Ensure the role is required and always set for every user.
- Make sure the role is easy to consume from both backend and frontend logic (e.g. via an enum or similar construct).

**Behavior:**
- Every persisted user record has exactly one role.
- The role is one of: `administrator`, `pro`, `starter`.
- There is a clear default role for newly created users (see AUTHZ-02).

**Acceptance Criteria:**
- Given an existing user record, when the system reads that user, then a non-null role is always present and is one of `administrator`, `pro`, or `starter`.
- Given a database or persistence schema inspection, then the user entity has a field that stores the role with a constrained set of allowed values.
- Given system documentation for the user model, then the role attribute and allowed values are clearly described.

---

### AUTHZ-02 — Default new users to Starter role

**Goal:** Ensure that users created through OAuth or similar signup flows are consistently initialized with the Starter role unless explicitly provisioned otherwise.

**Description:**
- Integrate role assignment into the existing OAuth-based user creation flow.
- When a new user is created via OAuth, assign role `starter` by default.
- Allow for future extension where a provisioning mechanism or admin process can override this default.

**Behavior:**
- When a new user signs in for the first time via OAuth and no existing user record is found, the system creates a new user with role `starter`.
- Existing users keep their current role during subsequent logins.

**Acceptance Criteria:**
- Given a new person signing in via OAuth for the first time, when the system creates their user account, then their role is `starter`.
- Given a user who has already been assigned a different role (e.g. `pro` or `administrator`), when they log in again, then their role is not reset to `starter`.
- Given automated or manual tests that create a user via the auth flow, then the resulting user record shows `starter` as the role by default.

---

### AUTHZ-03 — Expose user role to the frontend

**Goal:** Make the current user’s role available to the frontend so the UI can adapt (e.g. show upgrade prompts, admin navigation, and limit messaging).

**Description:**
- Extend the existing “current user” endpoint or auth me endpoint to include the user’s role.
- Ensure the response shape is stable and clearly documented so the frontend can rely on it.

**Behavior:**
- When the frontend calls the “who am I” endpoint while authenticated, the response includes the user’s role.
- If the user is not authenticated, the endpoint behaves as it does today (e.g. returns an unauthenticated response), and no role is returned.

**Acceptance Criteria:**
- Given an authenticated request to the current-user endpoint, then the response contains a field that indicates the user’s role (`administrator`, `pro`, or `starter`).
- Given an unauthenticated request, then the endpoint does not expose any role and behaves according to existing auth rules.
- Given the frontend documentation or type definitions, then the user type includes a role field that matches the backend values.

---

## Phase 2 — Admin-Only Role Management

### AUTHZ-04 — Restrict role changes to administrators

**Goal:** Ensure that only administrators (or a dedicated provisioning mechanism) can change user roles.

**Description:**
- Introduce a clear mechanism for changing a user’s role (e.g. a backend endpoint or internal service).
- Guard this mechanism so that only users with the `administrator` role (or a trusted provisioning context) can perform role changes.
- Non-admin users attempting to change roles must be rejected with an appropriate error.

**Behavior:**
- When an administrator attempts to change a user’s role, the change is applied if the request is valid.
- When a non-administrator attempts to change any user’s role (including their own), the system rejects the request.

**Acceptance Criteria:**
- Given a logged-in user with role `administrator`, when they invoke the role-change operation for another user with valid input, then the target user’s role is updated accordingly.
- Given a logged-in user with role `pro` or `starter`, when they attempt the same operation, then the system responds with an authorization error (e.g. HTTP 403) and does not change any roles.
- Given logs or audit trails (if available), then role changes can be attributed to an administrator or a trusted provisioning path.

---

### AUTHZ-05 — Provide a reusable “require admin” authorization check

**Goal:** Centralize the logic for admin-only access so new admin capabilities can reuse a single, well-tested authorization rule.

**Description:**
- Implement a shared mechanism that checks whether the current user is an administrator.
- Integrate this mechanism into all admin-only operations (including role management from AUTHZ-04).
- Make it easy to apply this check to new endpoints or actions in the future.

**Behavior:**
- When a request reaches an admin-only operation, the system uses the centralized check to determine if the user is an administrator.
- If the user is not an administrator, the operation is denied consistently with a clear error response.

**Acceptance Criteria:**
- Given any admin-only operation, when a non-admin user invokes it, then the response is an authorization error and the operation is not performed.
- Given the code or configuration of admin-only endpoints, then each uses the shared admin-check mechanism rather than duplicating ad-hoc logic.
- Given new admin-only functionality added in the future, then it can be implemented by applying the same shared mechanism.

---

## Phase 3 — Enforce Conversation Limits by Role

### AUTHZ-06 — Enforce conversation creation limits for Pro users

**Goal:** Enforce a maximum number of conversations that Pro users can own at any given time.

**Description:**
- For users with role `pro`, enforce a limit on the total number of conversations they currently own.
- Prevent creation of a new conversation when the user has reached or exceeded the configured limit.
- Counts should be based on currently active conversations owned by the user.

**Behavior:**
- When a Pro user attempts to create a conversation and their current number of owned conversations is below the limit, the creation is allowed.
- When a Pro user attempts to create a conversation and their current number of owned conversations is at or above the limit, the creation is rejected with a clear error.
- When a Pro user deletes one of their conversations, their count decreases, and they may create new conversations again until they hit the limit.

**Acceptance Criteria:**
- Given a Pro user with fewer conversations than the limit, when they create a new conversation, then the operation succeeds and their count increases by one.
- Given a Pro user whose conversation count equals the limit, when they attempt to create an additional conversation, then the operation fails with a clear, user-friendly error indicating that the limit has been reached.
- Given a Pro user who deletes an existing conversation, when they attempt to create a new one afterward, then the creation is allowed as long as their count is below the limit.

---

### AUTHZ-07 — Enforce conversation creation limits for Starter users (lifetime cap)

**Goal:** Enforce a strict lifetime cap on conversation creation for Starter users, regardless of deletion.

**Description:**
- For users with role `starter`, enforce a maximum total number of conversations they are allowed to create across their entire account lifetime.
- Deleting conversations does not reset or free up the Starter user’s lifetime cap; once they have created up to the limit, further creation attempts are blocked.

**Behavior:**
- When a Starter user with a lifetime-created count below the limit attempts to create a conversation, the creation is allowed, and their lifetime-created count increases.
- When a Starter user whose lifetime-created count is at or above the limit attempts to create a conversation, the request is rejected, even if they have since deleted some or all conversations.

**Acceptance Criteria:**
- Given a Starter user who has created fewer conversations than the lifetime cap, when they create another conversation, then the operation succeeds and their lifetime-created count is updated.
- Given a Starter user who has reached the lifetime cap, when they attempt to create an additional conversation, then the system rejects the request with a clear, user-friendly error indicating that the limit has been reached and suggesting an upgrade path.
- Given a Starter user who deletes conversations after hitting the cap, when they try to create a new conversation again, then the system still rejects the request due to the lifetime cap.

---

### AUTHZ-08 — Conversation limits do not apply to administrators

**Goal:** Ensure administrator users are never blocked by conversation limits.

**Description:**
- Exempt users with role `administrator` from all conversation creation limits.
- Ensure that any conversation limit check explicitly bypasses administrators.

**Behavior:**
- When an administrator attempts to create a conversation, the operation is always allowed (assuming other validations pass), regardless of how many conversations they already own.

**Acceptance Criteria:**
- Given a user with role `administrator`, when they create conversations repeatedly, then they are never blocked by a limit-related error.
- Given the implementation of conversation limit checks, then there is an explicit branch or condition that skips limit enforcement for administrators.

---

## Phase 4 — Enforce Collection Limits by Role

### AUTHZ-09 — Enforce collection creation limits for Pro users

**Goal:** Enforce a maximum number of collections that Pro users can own at any given time.

**Description:**
- For users with role `pro`, enforce a limit on the total number of collections they currently own.
- Prevent creation of new collections when the user has reached or exceeded the configured limit.

**Behavior:**
- When a Pro user attempts to create a collection and their current number of owned collections is below the limit, the creation is allowed.
- When a Pro user attempts to create a collection and their current number of owned collections is at or above the limit, the creation is rejected with a clear error.
- When a Pro user deletes one of their collections, their count decreases, and they may create new collections again until they hit the limit.

**Acceptance Criteria:**
- Given a Pro user with fewer collections than the limit, when they create a new collection, then the operation succeeds and their count increases by one.
- Given a Pro user whose collection count equals the limit, when they attempt to create an additional collection, then the operation fails with a clear, user-friendly error indicating that the limit has been reached.
- Given a Pro user who deletes an existing collection, when they attempt to create a new one afterward, then the creation is allowed as long as their count is below the limit.

---

### AUTHZ-10 — Enforce collection creation limits for Starter users (lifetime cap)

**Goal:** Enforce a strict lifetime cap on collection creation for Starter users, regardless of deletion.

**Description:**
- For users with role `starter`, enforce a maximum total number of collections they are allowed to create across their entire account lifetime.
- Deleting collections does not reset or free up the Starter user’s lifetime cap; once they have created up to the limit, further creation attempts are blocked.

**Behavior:**
- When a Starter user with a lifetime-created count below the limit attempts to create a collection, the creation is allowed, and their lifetime-created count increases.
- When a Starter user whose lifetime-created count is at or above the limit attempts to create a collection, the request is rejected, even if they have since deleted some or all collections.

**Acceptance Criteria:**
- Given a Starter user who has created fewer collections than the lifetime cap, when they create another collection, then the operation succeeds and their lifetime-created count is updated.
- Given a Starter user who has reached the lifetime cap, when they attempt to create an additional collection, then the system rejects the request with a clear, user-friendly error indicating that the limit has been reached and suggesting an upgrade path.
- Given a Starter user who deletes collections after hitting the cap, when they try to create a new collection again, then the system still rejects the request due to the lifetime cap.

---

### AUTHZ-11 — Collection limits do not apply to administrators

**Goal:** Ensure administrator users are never blocked by collection limits.

**Description:**
- Exempt users with role `administrator` from all collection creation limits.
- Ensure that any collection limit check explicitly bypasses administrators.

**Behavior:**
- When an administrator attempts to create a collection, the operation is always allowed (assuming other validations pass), regardless of how many collections they already own.

**Acceptance Criteria:**
- Given a user with role `administrator`, when they create collections repeatedly, then they are never blocked by a limit-related error.
- Given the implementation of collection limit checks, then there is an explicit branch or condition that skips limit enforcement for administrators.

---

## Phase 5 — UX for Roles, Limits, and Upgrade Prompts

### AUTHZ-12 — Show current role and usage in the UI

**Goal:** Provide users with clear visibility into their current role and usage against limits so they understand why certain actions may be blocked.

**Description:**
- Use the role and usage information returned from the backend to display current plan and usage in relevant parts of the UI (e.g. settings, sidebars, or limit banners).
- Show per-resource usage such as “X/Y conversations” or “X/Y collections” when available.

**Behavior:**
- When a user is authenticated, the UI reflects their plan (Starter, Pro, or Administrator) and, where possible, the number of conversations and collections used versus their limit.
- For administrators, limits may be displayed as “Unlimited” where appropriate.

**Acceptance Criteria:**
- Given a Starter user approaching the limit, when they view the main app UI, then they can see their current usage (e.g. “4/5 conversations”).
- Given a Pro user, when they view the UI, then they see usage based on the Pro limits.
- Given an Administrator, when they view the UI, then any limit-related indicators show “Unlimited” or a similar representation.

---

### AUTHZ-13 — Handle “limit reached” scenarios with clear messaging and upgrade CTA

**Goal:** Ensure that when a user hits a resource limit, the user experience is clear, non-technical, and points toward an upgrade path.

**Description:**
- When the backend rejects a conversation or collection creation due to a limit, surface a human-friendly message in the UI rather than a generic error.
- Provide a clear call-to-action to upgrade to Pro (or otherwise manage their plan) where applicable.
- Avoid exposing raw HTTP codes or internal error details to end users.

**Behavior:**
- When a Starter or Pro user at their limit tries to create a new conversation or collection, the UI shows a friendly message explaining that their limit has been reached.
- The message suggests upgrading or adjusting usage, depending on the role and resource.

**Acceptance Criteria:**
- Given a Starter user who has hit their conversation limit, when they try to create another conversation, then they see a clear message such as “Conversation limit reached for your plan. Upgrade to Pro for more.” along with a visible upgrade or help entry point.
- Given a Pro user who has hit their collection limit, when they try to create another collection, then they see a clear message describing the limit and a path to manage or upgrade their plan.
- Given an Administrator, when they create conversations or collections, then they never see limit-reached messaging triggered by authorization limits.

---

## Phase 6 — Configurable Limits (Optional)

*Implemented: limits are defined in `backend/app/config.py` and read from env (`LIMIT_PRO_CONVERSATIONS`, `LIMIT_STARTER_CONVERSATIONS`, `LIMIT_PRO_COLLECTIONS`, `LIMIT_STARTER_COLLECTIONS`). See `docs/developer.md` § Configurable limits.*

### AUTHZ-14 — Make role-based limits configurable from a central place

**Goal:** Allow configuration of resource limit values without changing core application logic, while keeping a single source of truth for limits.

**Description:**
- Centralize the definition of conversation and collection limits for each role.
- Allow limit values to be adjusted via configuration (such as environment variables or application config) or via a single constants module, depending on how flexible the system needs to be.
- Ensure all limit checks use this centralized configuration so that changing a limit in one place updates behavior across the system.

**Behavior:**
- When the system evaluates whether a user is at their limit, it reads the limit values from the centralized configuration.
- Changing the configuration (where supported) updates the effective limits without requiring changes to multiple call sites.

**Acceptance Criteria:**
- Given a configuration source defining limits for `starter` and `pro` for conversations and collections, when these values are changed, then limit enforcement behavior follows the new values without modifying the authorization logic in multiple places.
- Given a review of limit-checking code paths, then all of them reference the same centralized configuration rather than hard-coded scattered numbers.
- Given system documentation, then there is a clear description of where limit values are defined and how to adjust them.

