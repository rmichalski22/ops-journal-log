---
name: "Step 1: Repo Structure and Prisma"
overview: Propose the monorepo folder structure and complete Prisma schema for the Changelog Tree app, covering users, roles, nodes, change records, revisions, subscriptions, attachments, audit events, and notifications.
todos: []
isProject: false
---

# Step 1: Repo Structure and Prisma Schema

## Repo Structure

```
ops-journal-log/
├── api/                          # Fastify + Prisma API
│   ├── src/
│   │   ├── index.ts              # Fastify app entry
│   │   ├── config.ts             # Env/config loading
│   │   ├── db.ts                 # Prisma client singleton
│   │   ├── plugins/              # Fastify plugins (auth, session, etc.)
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── nodes.ts
│   │   │   ├── records.ts
│   │   │   ├── feeds.ts
│   │   │   ├── attachments.ts
│   │   │   ├── subscriptions.ts
│   │   │   └── admin.ts          # Audit log, etc.
│   │   ├── services/             # Business logic
│   │   ├── lib/
│   │   │   ├── permissions.ts    # Centralized node visibility / permission evaluation
│   │   │   └── ...               # Storage abstraction, etc.
│   │   └── types/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── package.json
│   └── tsconfig.json
├── web/                          # Next.js App Router
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx          # Dashboard/feed
│   │   │   ├── login/
│   │   │   ├── dashboard/
│   │   │   ├── nodes/
│   │   │   │   └── [id]/
│   │   │   ├── records/
│   │   │   │   └── [id]/
│   │   │   └── admin/
│   │   │       └── audit/
│   │   ├── components/
│   │   └── lib/
│   ├── package.json
│   └── tailwind.config.ts
├── docker-compose.yml
├── .env.example
├── package.json                  # Root workspace config
└── README.md
```

---

## Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  admin
  editor
}

enum VisibilityMode {
  inherit         // inherit from parent
  public_internal // visible to all authenticated users
  restricted      // only allowed_roles can see
}

enum NodeType {
  system
  service
  module
  other
}

enum ChangeType {
  feature
  fix
  migration
  config
  other
}

enum Impact {
  low
  medium
  high
}

enum RecordStatus {
  planned
  completed
  rolled_back
  monitoring
}

enum SubscriptionMode {
  immediate
  daily
  weekly
}

enum NotificationEventType {
  new_record
  edited_record
}

enum NotificationStatus {
  pending
  sent
  failed
}

enum AuditEventType {
  node_create
  node_rename
  node_move
  node_restrict
  node_delete
  record_create
  record_edit
  record_delete
  attachment_upload
  attachment_delete
  subscription_add
  subscription_remove
  notification_sent
  notification_failure
  login_success
  login_failure
}

model User {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  role         Role     @default(editor)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  sessions        Session[]
  recordRevisions  RecordRevision[]
  subscriptions    Subscription[]
  auditEvents      AuditEvent[]        @relation("AuditEventActor")
  createdNodes     Node[]              @relation("NodeCreator")
  createdRecords   ChangeRecord[]      @relation("RecordCreator")
  updatedRecords   ChangeRecord[]       @relation("RecordUpdater")
  uploadedAttachments Attachment[]     @relation("AttachmentUploader")
  notificationOutbox NotificationOutbox[]
}

model Session {
  id        String   @id @default(cuid())
  userId    String
  token     String   @unique
  expiresAt DateTime
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model Node {
  id             String         @id @default(cuid())
  parentId       String?
  name           String
  slug           String         // URL-safe, unique within parent scope
  type           NodeType       @default(other)
  path           String         // e.g. "/systems/api/users" - denormalized for permission eval
  pathIds        String[]       @default([]) // ancestor IDs root-to-node for permission eval
  visibilityMode VisibilityMode @default(public_internal)
  allowedRoles   Role[]         @default([]) // roles that can see restricted node
  createdById    String
  deletedAt      DateTime?
  createdAt      DateTime       @default(now())
  updatedAt      DateTime       @updatedAt

  parent     Node?   @relation("NodeHierarchy", fields: [parentId], references: [id])
  children   Node[]  @relation("NodeHierarchy")
  createdBy  User    @relation("NodeCreator", fields: [createdById], references: [id])
  records    ChangeRecord[]
  subscriptions Subscription[]

  @@unique([parentId, slug])
  @@index([parentId])
  @@index([deletedAt])
  @@index([path])
}

model ChangeRecord {
  id          String      @id @default(cuid())
  nodeId      String
  occurredAt  DateTime
  title       String
  description String      @db.Text
  reason      String?     @db.Text
  changeType  ChangeType  @default(other)
  impact      Impact     @default(medium)
  status      RecordStatus @default(planned)
  links       String[]    @default([])
  createdById String
  updatedById String?
  deletedAt   DateTime?
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  node      Node            @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  createdBy User            @relation("RecordCreator", fields: [createdById], references: [id])
  updatedBy User?           @relation("RecordUpdater", fields: [updatedById], references: [id])
  revisions RecordRevision[]
  attachments Attachment[]
  notificationOutbox NotificationOutbox[]

  @@index([nodeId])
  @@index([occurredAt])
  @@index([status])
  @@index([deletedAt])
}

model RecordRevision {
  id             String   @id @default(cuid())
  recordId       String
  editorId       String
  snapshotBefore Json     // before state
  snapshotAfter  Json     // after state
  secretAck      Boolean? @default(false)
  createdAt      DateTime @default(now())

  record ChangeRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)
  editor User         @relation(fields: [editorId], references: [id])

  @@index([recordId])
}

model Attachment {
  id            String   @id @default(cuid())
  recordId      String
  filename      String
  mimeType      String
  sizeBytes     Int
  storageKey    String   // path in local or key in S3
  storageBackend String  @default("local") // "local" | "s3"
  uploadedById  String
  deletedAt     DateTime?
  createdAt     DateTime @default(now())

  record   ChangeRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)
  uploadedBy User        @relation("AttachmentUploader", fields: [uploadedById], references: [id])

  @@index([recordId])
}

model Subscription {
  id                String           @id @default(cuid())
  userId            String
  nodeId            String
  includeDescendants Boolean          @default(true)
  notifyOnEdit      Boolean          @default(true)
  mode              SubscriptionMode @default(immediate)
  impactThreshold   Impact?          // null = any; only notify when impact >= threshold
  createdAt         DateTime         @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  node Node @relation(fields: [nodeId], references: [id], onDelete: Cascade)
  notificationOutbox NotificationOutbox[]

  @@unique([userId, nodeId])
  @@index([userId])
  @@index([nodeId])
}

model NotificationOutbox {
  id             String              @id @default(cuid())
  userId         String
  recordId       String
  subscriptionId String?
  eventType      NotificationEventType
  status         NotificationStatus  @default(pending)
  scheduledAt    DateTime            @default(now())
  sentAt         DateTime?
  failedAt       DateTime?
  errorMessage   String?             @db.Text

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  record       ChangeRecord  @relation(fields: [recordId], references: [id], onDelete: Cascade)
  subscription Subscription? @relation(fields: [subscriptionId], references: [id], onDelete: SetNull)

  @@index([status, scheduledAt])
  @@index([userId])
  @@index([subscriptionId])
}

model AuditEvent {
  id        String         @id @default(cuid())
  type      AuditEventType
  actorId   String?
  metadata  Json           @default("{}")
  createdAt DateTime       @default(now())

  actor User? @relation("AuditEventActor", fields: [actorId], references: [id], onDelete: SetNull)

  @@index([type])
  @@index([createdAt])
  @@index([actorId])
}
```

---

## Schema Design Notes


| Concern                   | Decision                                                                                                                                                                                              |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Node visibility**       | `visibilityMode` + `allowedRoles` (Role enum array) on each node. Effective visibility computed via `path` / `pathIds` for centralized permission evaluation (see `api/src/lib/permissions.ts`).      |
| **Node path**             | `path` (string like `/systems/api/users`) and `pathIds` (ancestor IDs root-to-node) stored on Node. Kept in sync on create/rename/move. Enables fast permission checks without walking the tree.      |
| **Permission evaluation** | Centralized in API lib: given user role + `pathIds`, resolve effective `visibilityMode` and `allowedRoles` for each ancestor; user can see node iff role in allowed set at first restricted ancestor. |
| **Revisions**             | `RecordRevision` stores `snapshotBefore` and `snapshotAfter` as JSON for full diff support. `secretAck` flags secret-warning acknowledgement.                                                         |
| **Soft delete**           | `deletedAt` on `Node`, `ChangeRecord`, and `Attachment`; filter these out in all queries.                                                                                                             |
| **Record status**         | `RecordStatus`: planned, completed, rolled_back, monitoring (ops-oriented lifecycle).                                                                                                                 |
| **Subscription mode**     | `SubscriptionMode` (immediate/daily/weekly) + `impactThreshold` (nullable; null = any impact). `notifyOnEdit` toggles notifications on edits.                                                         |
| **Notification outbox**   | Full relations to User, ChangeRecord, Subscription. `NotificationEventType` and `NotificationStatus` enums. `status` drives send/retry logic.                                                         |
| **Attachments**           | `storageKey` + `storageBackend` abstract local vs S3. `uploadedById` + `deletedAt` for audit and soft delete.                                                                                         |


---

## Package Structure (Root)

Root `package.json` with workspaces:

```json
{
  "name": "ops-journal-log",
  "private": true,
  "workspaces": ["api", "web"],
  "scripts": {
    "dev:api": "npm run dev -w api",
    "dev:web": "npm run dev -w web",
    "db:migrate": "npm run migrate -w api",
    "db:seed": "npm run seed -w api"
  }
}
```

---

## Next Steps (After Approval)

- Step 2: Auth + session middleware
- Step 3: Nodes endpoints + permission enforcement
- Step 4: Change records + revisions + feeds
- Step 5: Attachments + storage abstraction
- Step 6: Subscriptions + notifications
- Step 7: Audit events + admin UI

Say **continue** when ready for step 2.