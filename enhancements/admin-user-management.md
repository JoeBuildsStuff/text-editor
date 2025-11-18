# Admin User Management Plan

## Goal
Add an admin-only user management capability on top of Better Auth + SQLite so admins can list users, toggle admin status, reset passwords, and revoke sessions safely.

## Current State
- Auth uses Better Auth over SQLite (`server/auth.sqlite`). Tables: `users`, `sessions` (see src/lib/auth/database.ts).
- No admin flag or admin-only routes/UI today.
- App routes are behind session checks via `getSession` / `getSessionFromHeaders`.

## Scope (initial)
1) Data model: add `is_admin` boolean to `users`; expose it via auth types/session helpers.
2) Auth helpers: `requireAdminSession()` to gate admin endpoints.
3) Admin API: list users, toggle admin, revoke sessions, optional password reset.
4) Admin UI: `/admin/users` page with table + actions (basic shadcn/ui table + toasts).
5) Docs: update authentication/docs index; note how to promote first admin.

## Proposed Steps
1. **DB flag**
   - Add `is_admin INTEGER NOT NULL DEFAULT 0` to `users` schema (canonical + migration).
   - Extend `AuthUser` + session mapping to include `isAdmin`.
2. **Guards**
   - Add `requireAdminSession()`/`getAdminSessionFromHeaders()` in auth helpers.
3. **API layer**
   - `GET /api/admin/users` → list users + session counts.
   - `PATCH /api/admin/users` → toggle `isAdmin`, optional temp password set.
   - `DELETE /api/admin/users/[id]/sessions` → revoke all sessions (or accept `sessionId`).
4. **UI**
   - Add `/admin/users` page under (app) layout; table with promote/demote, revoke sessions, delete user, set temp password modal.
5. **Docs & tooling**
   - Doc flows and first-admin bootstrap command (tiny script or SQL snippet).
   - Update docs index/authentication to mention admin console.

## Open Questions
- Do we need audit logs? (Not planned now.)
- Should admins be able to delete users and cascade their docs/uploads? (If yes, add a background cleanup step.)
- Do we need rate limits on admin APIs? (Likely fine without initially.)

## Risks/Mitigations
- **DB drift**: add migration + schema update together; test `pnpm auth:migrate`/migration run.
- **Privilege leaks**: gate every admin route with `requireAdminSession`; avoid client-provided `userId` without checks.
- **Destructive deletes**: confirm cascading behavior before enabling user deletion.

## Validation Plan
- Unit/integration-lite: hit admin APIs with/without admin session (expect 401/403 vs 200).
- Manual UI check: promote/demote, revoke sessions, reset password flow.
- Smoke: existing auth flows unchanged for non-admins.
