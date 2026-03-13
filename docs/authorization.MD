# Authorization — Requirements

This document defines role-based authorization and resource limits for the Prompt Knowledge Base. It is written so that each requirement can be turned into concrete user stories and acceptance criteria.

---

## 1. Role Names and Overview

| Role            | Internal name   | Description |
|-----------------|-----------------|-------------|
| **Administrator** | `administrator` | Full system access; can manage users and settings; no resource limits. |
| **Pro**         | `pro`           | Paid subscriber; higher limits on conversations and collections. |
| **Starter**     | `starter`       | Free subscriber; limited conversations and collections. |

**Naming rationale:**
- **Pro** — common SaaS term for paid tier; implies power users and premium features.
- **Starter** — implies entry-level, try-before-you-buy; clear path to “Pro” upgrade.

---

## 2. Resource Limits by Role

| Resource        | Administrator | Pro  | Starter |
|-----------------|---------------|------|---------|
| Conversations   | Unlimited     | 100  | 5       |
| Collections     | Unlimited     | 50   | 5       |

- Limits apply to **owned** resources only (conversations/collections the user has created).
- For **Pro** users, counting is by **current total** (e.g. creating a 101st conversation when limit is 100 is denied); deleting a conversation or collection frees a “slot” for creating a new one.
- For **Starter** users, limits are **lifetime creation caps**: once a Starter has created 5 conversations or 5 collections in total, they cannot create more **even if they delete some**. This prevents delete/recreate cycles that could bypass cost controls for OpenAI usage.

---

## 3. Administrator Capabilities

- **Admin and modify:** Manage application settings, feature flags, and (if applicable) tenant/org settings.
- **User management (optional scope):** View users, assign or change roles (e.g. set a user to Pro or Starter), and optionally revoke access. Exact scope (e.g. full CRUD vs. role-only) to be decided in stories.
- **Bypass limits:** Administrators are not subject to conversation or collection limits; they can create unlimited of each.
- **Access:** All actions available to Pro and Starter are available to Administrator.

---

## 4. Functional Requirements (Story-Ready)

### 4.1 Role Assignment and Representation

- **FR-AUTHZ-01** Every user has exactly one role: `administrator`, `pro`, or `starter`.
- **FR-AUTHZ-02** Role is stored in the User model and returned to the frontend (e.g. in `/auth/me`) so the UI can adapt (e.g. show upgrade prompt for Starter, admin nav for Administrator).
- **FR-AUTHZ-03** New users created via OAuth default to role `starter` unless overridden (e.g. by admin or provisioning).
- **FR-AUTHZ-04** Only an administrator (or a dedicated provisioning process) can change a user’s role.

### 4.2 Enforcement of Limits

- **FR-AUTHZ-05** When a user attempts to **create** a new conversation, the backend checks the current count of conversations owned by that user. If the count is at or above the limit for their role, the request is rejected with a clear error (e.g. HTTP 403 or 429 with message that limit is reached).
- **FR-AUTHZ-06** When a user attempts to **create** a new collection, the backend checks the current count of collections owned by that user. If the count is at or above the limit for their role, the request is rejected with a clear error.
- **FR-AUTHZ-07** Limits are enforced on the backend only; frontend may use the known role and counts to disable or hide “New conversation” / “New collection” (or show upgrade CTA) when at limit, but the backend is the source of truth.
- **FR-AUTHZ-08** Administrator role is never subject to conversation or collection limits (unlimited).

### 4.3 Administrator-Only Actions

- **FR-AUTHZ-09** Actions that “admin and modify” system-wide or other users’ data (e.g. change roles, modify app settings) are restricted to users with role `administrator`; others receive HTTP 403.
- **FR-AUTHZ-10** Admin-only endpoints or operations are documented and protected by a shared dependency (e.g. `require_admin`) so new admin actions stay consistent.

### 4.4 UX and Visibility

- **FR-AUTHZ-11** The frontend receives the current user’s role and (when available) current usage (e.g. “5/5 conversations”) so it can show limits, upgrade prompts, or disable actions at limit.
- **FR-AUTHZ-12** When a limit is reached, the user sees a clear, non-technical message (e.g. “Conversation limit reached for your plan. Upgrade to Pro for more.”) and, if applicable, a link or path to upgrade.

---

## 5. Data Model Impact

- **User:** Add a required field `role` (or `tier`) with values corresponding to the three roles. Recommended type: enum in DB and in ORM (e.g. `UserRole`: `administrator`, `pro`, `starter`).
- **No change** to Conversation or Collection ownership model; limits are enforced by counting rows where `owner_id = current_user.id` (and optionally filtering by “active” if soft delete is introduced later).

**Example (conceptual):**

- `users.role` — enum or string, one of `administrator` | `pro` | `starter`, default `starter`, NOT NULL.

---

## 6. Configuration (Optional)

- **FR-AUTHZ-13 (optional)** Limit values (e.g. 100 for Pro conversations, 5 for Starter) may be read from configuration (env or app config) so they can be changed without code changes. If not configurable, they are constants in one place (e.g. a `limits` module) for easy adjustment and story reference.

---

## 7. Out of Scope (for This Authorization Doc)

- Billing, payment, or subscription lifecycle (how a user becomes Pro or reverts to Starter).
- Self-service upgrade/downgrade flows (handled by separate billing/subscription stories).
- Rate limiting (e.g. API calls per minute); that remains a separate NFR.
- Soft delete and whether “deleted” conversations/collections count toward limits (assumption: hard delete or soft-deleted items do not count once removed from the active set).

---

## 8. Story Mapping (for Later Use)

Stories can be derived from this doc as follows:

| Requirement(s)        | Suggested story focus |
|-----------------------|------------------------|
| FR-AUTHZ-01, 02, 03   | Add `role` to User model and auth flow; default new users to Starter. |
| FR-AUTHZ-04, 09, 10   | Admin-only: change user role; introduce `require_admin` (or similar). |
| FR-AUTHZ-05, 07, 08   | Enforce conversation creation limit by role; exempt Administrator. |
| FR-AUTHZ-06, 07, 08   | Enforce collection creation limit by role; exempt Administrator. |
| FR-AUTHZ-11, 12       | Frontend: show role, usage, and limit-reached messaging / upgrade CTA. |
| FR-AUTHZ-13           | (Optional) Make limits configurable. |

---

## 9. Summary Table (Quick Reference)

| Role          | Conversations | Collections | Admin / modify |
|---------------|---------------|-------------|----------------|
| Administrator | Unlimited     | Unlimited   | Yes            |
| Pro           | 100           | 50          | No             |
| Starter       | 5             | 5           | No             |
