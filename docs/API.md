# API Reference

Base URL: `http://localhost:3001` (or `API_URL`)

All authenticated endpoints require a session cookie (set by `/api/auth/login`) or `Authorization: Bearer <token>`.

## Auth

### POST /api/auth/login

Login with email and password.

**Request body:**
```json
{ "email": "user@example.com", "password": "..." }
```

**Response:** `{ user: { id, email, role } }`  
Sets session cookie.

### POST /api/auth/logout

Clear session.

### GET /api/auth/me

**Response:** `{ user: { id, email, role } }`  
401 if not authenticated.

---

## Nodes

### GET /api/nodes

List root nodes (flat).

**Response:** `{ nodes: [...] }`

### GET /api/nodes/tree

Tree view of all visible nodes.

**Response:** `{ tree: [{ id, name, path, slug, children: [...] }] }`

### GET /api/nodes/:id

Get node by ID with records.

### POST /api/nodes

Create node. Body: `{ parentId?, name, type?, visibilityMode?, allowedRoles? }`

### PATCH /api/nodes/:id

Update node. Body: `{ name?, type?, visibilityMode?, allowedRoles?, parentId? }`  
Admin only: `parentId`, `visibilityMode`, `allowedRoles`.

### DELETE /api/nodes/:id

Soft-delete node.

---

## Records

### POST /api/records

Create change record. Body: `{ nodeId, title, description, reason?, occurredAt?, changeType?, impact?, status?, links?, secretAck? }`

### GET /api/records/:id

Get record with revisions and attachments.

### PATCH /api/records/:id

Update record. Same body shape as create. Creates revision.

### DELETE /api/records/:id

Soft-delete record.

---

## Feeds

### GET /api/feeds

Query params: `from`, `to`, `nodeId`, `includeDescendants`, `createdById`, `changeType`, `impact`, `status`, `limit`, `offset`

**Response:** `{ records: [...], total, limit, offset }`

---

## Attachments

### POST /api/attachments/:recordId

Upload file (multipart/form-data, field `file`).

### GET /api/attachments/:id/download

Download attachment (returns file stream).

### DELETE /api/attachments/:id

Soft-delete attachment.

---

## Subscriptions

### GET /api/subscriptions

List current user's subscriptions.

### POST /api/subscriptions

Body: `{ nodeId, includeDescendants?, notifyOnEdit?, mode?, impactThreshold? }`

### DELETE /api/subscriptions/:id

Unsubscribe.

---

## Admin

### GET /api/admin/audit

Query params: `type`, `actorId`, `from`, `to`, `limit`, `offset`  
Admin only.

**Response:** `{ events: [...], total, limit, offset }`
