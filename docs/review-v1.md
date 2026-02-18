# Changelog Tree v1 Draft Review (Rigorous)

## A) Executive summary

- Permission enforcement is inconsistent and currently incorrect for inheritable privacy; descendants can unintentionally become visible when any restricted ancestor allows the role, even if a deeper restricted ancestor denies it.
- Critical leakage exists in feed pagination metadata: `total` counts restricted records before post-filtering, enabling inference of hidden activity.
- Node move operation allows tree cycles (node moved under its own descendant), which can corrupt paths and break permission traversal assumptions.
- Session/auth basics exist (Argon2 verify, DB sessions, HttpOnly cookie), but session rotation and anti-bruteforce controls are missing; CORS is overly permissive with credentials.
- Attachment upload/download has basic auth checks, but lacks filename sanitization for response headers and robust content-type policy; storage abstraction is present.
- Notification outbox is not idempotent and is race-prone under multiple workers; no retry/backoff policy beyond one-shot fail.
- Error handling can leak internal errors/stack/Prisma details because unhandled errors are returned directly.
- Prisma schema is close to required shape, but misses important indexes/constraints for path-based querying and outbox deduplication/idempotency.

## B) Blocking issues (must-fix before step 2)

1. **Problem:** Incorrect visibility inheritance algorithm (first restricted ancestor wins).
   - **Evidence:** `canUserSeeNode()` returns `visible: true` immediately on the first restricted ancestor that includes the role, so deeper restricted descendants are never evaluated. (`api/src/lib/permissions.ts`, function `canUserSeeNode`).
   - **Risk:** Authorization bypass / policy drift. A node restricted to `admin` under an `editor`-allowed ancestor can become visible to editors.
   - **Exact fix recommendation:** evaluate **all** ancestors from root to node; the closest explicit restriction should win, or (safer) deny if **any** ancestor denies role. Suggested patch:

```diff
-export function canUserSeeNode(userRole, node, ancestorNodes) {
-  const chain = ancestorNodes;
-  for (const ancestor of chain) {
-    const mode = ancestor.visibilityMode === "inherit" ? "public_internal" : ancestor.visibilityMode;
-    if (mode === "restricted") {
-      if (ancestor.allowedRoles.length === 0) return { visible: false, reason: "restricted with no allowed roles" };
-      if (!ancestor.allowedRoles.includes(userRole)) return { visible: false, reason: "role not in allowed roles" };
-      return { visible: true };
-    }
-  }
-  ...
-}
+export function canUserSeeNode(userRole, node, ancestorNodes) {
+  const chain = [...ancestorNodes, node];
+  let effective: { restricted: boolean; allowed: Role[] } | null = null;
+
+  for (const n of chain) {
+    if (n.visibilityMode === "restricted") {
+      effective = { restricted: true, allowed: n.allowedRoles };
+    } else if (n.visibilityMode === "public_internal") {
+      effective = null; // explicit override to public
+    }
+    // "inherit" => no change
+  }
+
+  if (!effective) return { visible: true };
+  if (effective.allowed.length === 0) return { visible: false, reason: "restricted with no allowed roles" };
+  if (!effective.allowed.includes(userRole)) return { visible: false, reason: "role not in allowed roles" };
+  return { visible: true };
+}
```

2. **Problem:** Feed endpoint leaks restricted activity via `total`.
   - **Evidence:** `/api/feeds` computes `total = prisma.changeRecord.count({ where })` before per-record visibility filtering; response returns `records: visible, total`. (`api/src/routes/feeds.ts`, route `/`).
   - **Risk:** Side-channel disclosure of hidden record existence/volume.
   - **Exact fix recommendation:** enforce visibility in DB query (join on node constraints) or compute `totalVisible` from a visibility-constrained ID set. Minimal safer patch: only return `total: visible.length` until DB-level predicate is implemented.

3. **Problem:** Node move permits cycles.
   - **Evidence:** `PATCH /api/nodes/:id` updates `parentId` without checking whether `newParentId` is self or descendant. (`api/src/routes/nodes.ts`, move branch).
   - **Risk:** Tree corruption, recursive update loops, broken pathIds permission logic.
   - **Exact fix recommendation:** reject if `newParentId === node.id` or target parent’s `pathIds` contains `node.id`.

```diff
+if (newParentId === node.id) {
+  return reply.status(400).send({ error: "Cannot move node under itself" });
+}
 const newParent = await prisma.node.findFirst({ where: { id: newParentId, deletedAt: null } });
 if (!newParent) return reply.status(400).send({ error: "New parent not found" });
+if (newParent.pathIds.includes(node.id)) {
+  return reply.status(400).send({ error: "Cannot move node under its descendant" });
+}
```

4. **Problem:** API error handler leaks internals.
   - **Evidence:** default branch `reply.send(err)` sends raw error object. (`api/src/index.ts`, `setErrorHandler`).
   - **Risk:** information disclosure (stack traces, Prisma internals, schema hints).
   - **Exact fix recommendation:** log server-side, return generic message in production.

```diff
 fastify.setErrorHandler((err, _req, reply) => {
   ...
-  reply.send(err);
+  _req.log.error(err);
+  const message = process.env.NODE_ENV === "production" ? "Internal server error" : err.message;
+  reply.status(err.statusCode ?? 500).send({ error: message });
 });
```

5. **Problem:** Notification outbox is non-idempotent and race-prone.
   - **Evidence:** `enqueueNotifications()` inserts rows unconditionally; worker fetches pending rows without locking claim step. (`api/src/services/notifications.ts`, `api/src/services/notificationWorker.ts`).
   - **Risk:** duplicate emails, duplicate audit events, non-deterministic sends with multiple API/worker instances.
   - **Exact fix recommendation:** add unique key on `(userId, recordId, eventType, subscriptionId)` (or nullable-safe variant), use `upsert`/`createMany skipDuplicates`, and claim jobs atomically with status transition `pending -> processing`.

## C) High priority issues

1. **Missing request validation on most endpoints.**
   - Evidence: only auth route declares JSON schema; nodes/records/feeds/subscriptions/attachments accept unvalidated body/query params.
   - Fix: add Fastify schema for body/params/query in every route and enable AJV strict mode.

2. **CORS credentials + wildcard origin.**
   - Evidence: `origin: true, credentials: true`. (`api/src/index.ts`).
   - Risk: credentialed cross-origin requests from arbitrary origins if browser permits reflected origin behavior.
   - Fix: whitelist explicit origins from env.

3. **Session hardening gaps.**
   - Evidence: no session rotation on login/logout-other-sessions; no idle timeout update; cookie `SameSite=lax` okay but CSRF protection absent on state-changing endpoints.
   - Fix: rotate session token on login and privileged actions; consider CSRF token/double-submit cookie for cookie-auth POST/PATCH/DELETE.

4. **No login brute-force throttling/rate limiting.**
   - Evidence: `/api/auth/login` has no attempt limiter.
   - Fix: add per-IP and per-identity throttling with lockout/backoff and audit metadata.

5. **Attachment response header injection risk via filename.**
   - Evidence: `Content-Disposition` directly interpolates `att.filename`. (`api/src/routes/attachments.ts`).
   - Fix: sanitize filename and use RFC5987 encoding.

6. **Attachment upload policy incomplete.**
   - Evidence: size limited at multipart plugin level, but no explicit MIME allow-list, no extension checks, full buffering in memory.
   - Fix: stream directly to backend, enforce allowed types/extensions, and reject dangerous content types if policy requires.

7. **Authorization model conflates read/write with editor role only.**
   - Evidence: record and attachment read endpoints use `requireEditor` not `requireAuth` + visibility.
   - Risk: impossible to add read-only consumers later without touching every route.
   - Fix: split `requireAuthenticated` from mutate privileges.

8. **Feed/node query date parsing accepts invalid dates silently.**
   - Evidence: `new Date(from)` / `new Date(to)` used without validity checks.
   - Fix: validate ISO date and reject invalid inputs.

## D) Medium/low priority issues

1. `SESSION_SECRET` defaults to weak development secret in production misconfiguration path.
2. S3 backend ignores `useSsl` config field.
3. Storage write uses `writeFileSync` and full in-memory buffers (large file pressure).
4. `not found` errors in some routes are specific (`Node not found`) and can aid ID probing; prefer generic for unauthorized contexts.
5. `Subscription` update cannot explicitly clear `impactThreshold` because `th ?? undefined` keeps old value.
6. Path uniqueness/indexing may degrade as tree grows (no `pathIds` GIN index).

## E) Schema recommendations

- Add **outbox dedupe** constraint/index:
  - `@@unique([userId, recordId, eventType, subscriptionId])` (or redesign to non-null subscription IDs).
- Add **query performance indexes**:
  - `Node`: `@@index([pathIds], type: Gin)` for descendant lookups.
  - `ChangeRecord`: composite `@@index([nodeId, occurredAt])`, `@@index([createdAt])`.
  - `Attachment`: `@@index([deletedAt])` and `@@index([recordId, deletedAt])`.
  - `Session`: `@@index([userId])`, `@@index([expiresAt])` for cleanup and session management.
  - `NotificationOutbox`: `@@index([status, scheduledAt, id])` and maybe `@@index([recordId])`.
- Add constraints/checks:
  - Node self-parent prevention at API + DB-level trigger/check.
  - Optional check that `allowedRoles` non-empty when `visibilityMode = restricted`.

## F) Permission model verification

### Recommended algorithm (explicit)

1. Build ancestor chain from root to target node (including node).
2. Maintain `effectivePolicy`:
   - `public_internal` => clear restriction (`effectivePolicy = public`).
   - `restricted(roles)` => set `effectivePolicy = restricted(roles)`.
   - `inherit` => no change.
3. Final visibility:
   - if effective policy is public => visible.
   - if restricted and user role in roles => visible.
   - else hidden.
4. Apply this **same function** for all data-returning surfaces: node list/tree/detail, records, revisions, feeds, attachments, subscriptions, notifications.
5. On hidden resources, return indistinguishable 404 where feasible to reduce inference.

### Current deviations

- Current `canUserSeeNode` short-circuits at first restricted ancestor and can incorrectly allow visibility despite deeper restrictions.
- Feed count and not-found/forbidden distinctions leak hidden existence in some query patterns.
- Permission checks are not pushed down into SQL consistently; filtering after query risks side channels and pagination mismatch.

## G) Attack scenarios

1. **Guess restricted record IDs and compare feed total vs visible records.**
   - Attempt: call `/api/feeds?nodeId=<allowed>&includeDescendants=true` where hidden descendants exist.
   - Current result: **Not blocked** (total leakage).

2. **Move node under its own descendant as admin/editor path abuse.**
   - Attempt: `PATCH /api/nodes/:id { parentId: <descendantId> }`.
   - Current result: **Not blocked** (cycle allowed).

3. **Exploit visibility inheritance with nested restricted nodes.**
   - Attempt: ancestor A restricted to editor; child B restricted to admin; request B as editor.
   - Current result: **Not reliably blocked** due to first-restricted short-circuit.

4. **Trigger server error and inspect response body for internals.**
   - Attempt: send malformed payload causing unhandled Prisma/logic error.
   - Current result: **Partially blocked / potentially leaked** (raw `err` sent by global handler).

5. **Content-Disposition header injection via crafted upload filename.**
   - Attempt: upload filename containing quotes/newlines.
   - Current result: **Not robustly blocked** (unsanitized interpolation in header).

6. **Duplicate notification spam by concurrent enqueue or multiple workers.**
   - Attempt: repeated edits + parallel workers.
   - Current result: **Not blocked** (no idempotency key/claim locking).

## API surface review (endpoint-by-endpoint)

- `POST /api/auth/login`: schema present; Argon2 verify; creates DB session; cookie set (HttpOnly, Secure in prod, SameSite=Lax).
- `POST /api/auth/logout`: session token deleted; cookie cleared.
- `GET /api/auth/me`: requires auth (via request decoration).
- `GET /api/nodes`: auth required; post-query visibility filtering.
- `GET /api/nodes/tree`: auth required; visibility filter then tree build.
- `GET /api/nodes/:id`: auth required; visibility checked.
- `POST /api/nodes`: editor/admin required; parent visibility checked; lacks body schema.
- `PATCH /api/nodes/:id`: editor/admin required; move/restrict branches; lacks cycle prevention and full schema.
- `DELETE /api/nodes/:id`: editor/admin required; soft delete.
- `GET /api/records/:id`: editor/admin required; visibility checked.
- `GET /api/records/:id/revisions/:revId`: editor/admin required; visibility checked.
- `POST /api/records`: editor/admin; secret detection enforced with `secretAck`; creates initial revision; enqueue new record notifications.
- `PATCH /api/records/:id`: editor/admin; secret detection on merged content; revision before/after snapshots; enqueue edit notifications.
- `DELETE /api/records/:id`: editor/admin; soft delete.
- `GET /api/feeds`: auth required; visibility check for selected node + post-filter records; **leaks total**.
- `POST /api/attachments/:recordId`: editor/admin; record visibility checked; upload allowed with size limit.
- `GET /api/attachments/:id/download`: editor/admin; attachment->record visibility checked before stream.
- `DELETE /api/attachments/:id`: editor/admin; visibility checked; soft delete only (blob remains).
- `GET/POST/DELETE /api/subscriptions...`: auth required; visibility checked on create/list; includes includeDescendants/notifyOnEdit/mode/impactThreshold.
- `GET /api/admin/audit`: admin required.

## Docker / runnability checks

- `docker-compose.yml` defines `postgres`, `api`, `web` and ports align with README.
- `.env.example` exists in repo root; README reference is consistent.
- Compose does not automatically run Prisma migrations/seed; manual steps in README are required (as documented).
