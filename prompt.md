You are a senior full-stack engineer. Build a self-hostable internal “Changelog Tree” app.

Goal:
A structured, permissioned, unlimited-depth node tree (systems/services/modules) where users create change records (“cards”) under a node, with revision history, subscriptions, email notifications, and file attachments.

Tech stack (required):
- Monorepo with /api and /web
- API: Node.js + TypeScript + Fastify + Prisma + Postgres
- Web: Next.js (App Router) + TypeScript + Tailwind
- Auth: local accounts, Argon2 password hashing, DB-backed sessions (cookie-based)
- Email: SMTP via Nodemailer
- Attachments: support BOTH local disk storage and S3-compatible storage (MinIO) behind a common interface.
- Docker compose: postgres + api + web (and optional minio service commented).

Core requirements:
1) Roles:
- admin, editor.
2) Nodes (unlimited depth):
- Editors can create and rename nodes.
- Admin can also move nodes and restrict visibility.
- Visibility is inheritable:
  - visibility_mode: inherit | public_internal | restricted
  - restricted nodes have allowed_roles (role-based only in v1).
  - Descendants inherit restrictions unless overridden.
- No leakage: restricted node names must not appear in search, feeds, or tree for unauthorized users.
3) Change records:
- Belong to exactly one node.
- Fields: occurred_at (backdate), title, description, reason, change_type, impact, status, links[].
- Records editable by editor/admin.
- Every edit creates a revision capturing before+after snapshots, editor user, timestamp.
- Provide UI to view revision history and show diffs.
4) Feeds:
- Global feed of change records user can see.
- Node feed (optionally include descendants).
- Filter by date range, node, include descendants, user, change_type, impact, status.
5) Subscriptions + notifications:
- Subscribe to a node (include descendants).
- Email notifications on:
  - new change record
  - edited change record
- Support immediate notifications in v1.
- Design the outbox so daily/weekly digests can be added later (do not implement digests yet unless trivial).
6) Attachments:
- Upload attachments to a change record (images and common files).
- Store metadata in DB, content in storage backend.
- Provide secure download endpoint requiring auth and permission to the underlying record.
- Include attachments in the change detail UI.
7) Secret warning:
- Scan text fields (title/description/reason/links) for common secret patterns (basic regex).
- If detected, require explicit user confirmation before saving.
- Log the acknowledgement in revision/audit event metadata.
8) System audit log:
- audit_events table logs: node create/rename/move/restrict, record create/edit, attachment upload/delete, subscription add/remove, notification sent/failure, login success/failure.
- Admin UI page to view audit events with filters.

Deliverables:
- Folder structure proposal
- Prisma schema
- API routes with OpenAPI-like documentation in markdown
- Web pages: login, dashboard feed, node tree, node detail, change detail (with history + attachments), admin audit log.
- docker-compose.yml + .env.example
- seed script to create first admin user
- clear setup instructions in README.md

Implementation rules:
- Centralize permission checks in the API. Do NOT rely on frontend-only checks.
- Use transactions where needed (edit -> create revision -> update record -> audit event -> enqueue notifications).
- Use soft delete for nodes/records.
- Keep UI functional and simple, no fancy styling required.

Step-by-step execution:
1) Propose repo structure and Prisma schema first.
2) Implement auth + session middleware.
3) Implement nodes endpoints + permission enforcement.
4) Implement change records + revisions + feeds.
5) Implement attachments upload/download + storage abstraction.
6) Implement subscriptions + notifications on create/edit.
7) Implement audit events + admin UI.
After each step, provide a short “how to run and test” checklist.

Start now with step 1 only: repo structure and Prisma schema, then wait for me to say continue.
