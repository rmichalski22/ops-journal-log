# Ops Journal Log

A self-hostable internal "Changelog Tree" app: a permissioned node tree (systems/services/modules) with change records, revisions, subscriptions, email notifications, and file attachments.

## Tech Stack

- **Monorepo**: `/api` (Fastify + Prisma + Postgres) and `/web` (Next.js App Router + Tailwind)
- **Auth**: Local accounts, Argon2, DB-backed sessions (cookie-based)
- **Email**: SMTP via Nodemailer
- **Attachments**: Local disk or S3-compatible (MinIO)

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL (or use Docker)
- (Optional) MinIO for S3 attachment storage

### 1. Clone and install

```bash
cd ops-journal-log
npm install
```

### 2. Configure

```bash
cp .env.example .env
# Edit .env with your DATABASE_URL, SESSION_SECRET, SMTP settings
```

### 3. Database

```bash
npm run db:migrate
npm run db:seed
```

### 4. Run

**Terminal 1 – API**

```bash
npm run dev:api
```

**Terminal 2 – Web**

```bash
npm run dev:web
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Default admin: `admin@localhost` / `admin123` (change via `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`)

## Docker Compose

```bash
docker compose up -d postgres
# Wait for postgres, then:
npm run db:migrate
npm run db:seed
docker compose up api web
```

## API Overview

| Route | Method | Description |
|-------|--------|-------------|
| `/api/auth/login` | POST | Login (email, password) |
| `/api/auth/logout` | POST | Logout |
| `/api/auth/me` | GET | Current user |
| `/api/nodes` | GET, POST | List, create nodes |
| `/api/nodes/tree` | GET | Tree view |
| `/api/nodes/:id` | GET, PATCH, DELETE | Node CRUD |
| `/api/records` | POST | Create change record |
| `/api/records/:id` | GET, PATCH, DELETE | Record CRUD |
| `/api/feeds` | GET | Feed with filters |
| `/api/attachments/:recordId` | POST | Upload attachment |
| `/api/attachments/:id/download` | GET | Download attachment |
| `/api/attachments/:id` | DELETE | Delete attachment |
| `/api/subscriptions` | GET, POST | List, subscribe |
| `/api/subscriptions/:id` | DELETE | Unsubscribe |
| `/api/admin/audit` | GET | Audit log (admin only) |

## API Documentation

See [docs/API.md](docs/API.md) for full API reference.

## Web Pages

- `/` – Redirects to dashboard or login
- `/login` – Login
- `/dashboard` – Feed
- `/nodes` – Node tree
- `/nodes/[id]` – Node detail, records, subscribe
- `/records/[id]` – Change record detail, history, attachments
- `/admin/audit` – Audit log (admin only)
