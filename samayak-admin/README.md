# Samayak Admin Panel

> Academic operations management platform for Indian universities.

## Quick Start (Docker)

```bash
# 1. Clone the repo
git clone <repo-url>
cd samayak-admin

# 2. Copy environment file
cp .env.example .env
# Set GROQ_API_KEY in .env for scanned/image PDF support

# 3. Start everything (migrations + CSE seed run automatically)
docker-compose up --build

# 4. Access the app
# App:        http://localhost:3000
# Bull Board: http://localhost:3001
```

## Demo Login

| Field    | Value              |
| -------- | ------------------ |
| Email    | admin@samayak.demo |
| Password | samayak2026        |

A **Use Demo Login** button is available on the login page (`#demo-login-section`).

## Seed Data

CSE department data is loaded from `prisma/data/cse-seed.json` on startup:

- Department: CSE with branches CS, AIML, MCA, M.Tech (multiple semesters/sections)
- Rooms: 219, 220, 233A, Labs 1–7
- Courses, faculty, and timetable slots across sections

Manual re-seed:

```bash
npx prisma db seed
```

---

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌───────────┐
│  Next.js 16 App │───▶│  PostgreSQL  │    │   Redis   │
│  (Port 3000)    │    │  (Port 5400) │    │ (Port 6379│
└────────┬────────┘    └──────────────┘    └─────┬─────┘
         │                                       │
         │              ┌────────────────┐       │
         └─────────────▶│  BullMQ Worker │◀──────┘
                        │  (+ Poppler +  │
                        │   Groq Vision) │
                        └────────────────┘
```

### Tech Stack

| Layer       | Technology                                   |
| ----------- | -------------------------------------------- |
| Framework   | Next.js 16 (App Router)                      |
| Language    | TypeScript (strict)                          |
| Database    | PostgreSQL 18.2                              |
| ORM         | Prisma                                       |
| Cache/Queue | Redis + BullMQ                               |
| Styling     | Tailwind CSS 4 + Samayak Design System       |
| Charts      | Recharts                                     |
| Auth        | NextAuth.js (JWT)                            |
| PDF Parse   | pdf-parse (text) + Groq vision LLM (scanned) |
| CSV/Excel   | PapaParse + SheetJS                          |

---

## How Things Work

### Authentication & authorization

All dashboard pages and `/api/*` routes (except `/api/health` and `/api/auth`) require a valid JWT session from NextAuth.

`proxy.ts` runs on every request:

1. Unauthenticated browser requests → redirect to `/login`
2. Unauthenticated API requests → `401 Unauthorized`
3. Role-based API access is enforced via `ROLE_PERMISSIONS`:

| Role          | Allowed API prefixes                               |
| ------------- | -------------------------------------------------- |
| `ADMIN`       | `*` (all routes)                                   |
| `HOD`         | `/api/courses`, `/api/faculty`, `/api/departments` |
| `DEAN`        | `/api/analytics`, `/api/departments`               |
| `COORDINATOR` | `/api/rooms`, `/api/courses`                       |
| `PROFESSOR`   | _(none — read-only UI access)_                     |

Each request gets an `x-correlation-id` header for log tracing.

### Data model

Core entities (see `prisma/schema.prisma`):

- **Department** → has branches, rooms, courses, faculty
- **Branch** → semester + section within a department
- **Room** → classroom or lab with capacity and timetable slots
- **Course** → linked to a branch; has credits, type, faculty, and time slots
- **User** (faculty) → role, optional department, soft-delete via `deletedAt`
- **TimeSlot** → day + period + optional course/room
- **ImportJob** → tracks PDF/CSV/Excel import progress and results

### Request handling patterns

**Synchronous CRUD** — Departments, rooms, courses, and faculty use standard REST handlers backed by Prisma. List endpoints support pagination (`page`, `limit`), search, and filters. Creates return `201`; unique constraint violations return `409`.

**Async bulk import** — CSV/Excel uploads are saved to disk, an `ImportJob` row is created, and a `bulk-import` BullMQ job is queued. The worker parses the file and upserts rows, then updates the job with `createdCount`, `matchedCount`, `failedCount`, and per-row errors.

**Async PDF ingestion** — PDF uploads follow the same queue pattern on the `pdf-ingestion` queue. The worker processes jobs asynchronously; the UI polls progress via Server-Sent Events.

**Analytics caching** — `GET /api/analytics` computes four metrics (see below). Results are cached in Redis for 60 seconds. Room create/update/delete and completed PDF ingestion call `invalidateAnalyticsCache()` (or delete the Redis key directly in the worker).

**Client-side refresh** — The dashboard listens for a `samayak:analytics-refresh` custom DOM event, dispatched after PDF ingestion completes, to re-fetch analytics without a full page reload.

---

## API Reference

All endpoints require authentication unless noted. Base URL: `http://localhost:3000`.

### Health & Auth

| Method     | Endpoint                  | Description                                                                                |
| ---------- | ------------------------- | ------------------------------------------------------------------------------------------ |
| `GET`      | `/api/health`             | **Public.** Checks database, Redis, and BullMQ queue connectivity. Returns `200` or `503`. |
| `GET/POST` | `/api/auth/[...nextauth]` | NextAuth session endpoints (login, logout, JWT callback).                                  |

### Analytics

| Method | Endpoint         | Description                                                                                                                                                    |
| ------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/analytics` | Returns four computed metrics (cached 60s in Redis): room utilisation %, empty-room probability per slot, under-running courses, avg empty room-hours per day. |

### Departments

| Method   | Endpoint                        | Description                                                                                   |
| -------- | ------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET`    | `/api/departments`              | Paginated list. Query: `search`, `page`, `limit`. Includes branch/room/course/faculty counts. |
| `POST`   | `/api/departments`              | Create department. Body: `{ name, code }`.                                                    |
| `GET`    | `/api/departments/:id`          | Single department with branches and dependency counts.                                        |
| `PUT`    | `/api/departments/:id`          | Update name/code.                                                                             |
| `DELETE` | `/api/departments/:id`          | Delete department (blocked if dependencies exist).                                            |
| `POST`   | `/api/departments/:id/branches` | Create branch. Body: `{ name, code, semester, section? }`.                                    |
| `POST`   | `/api/departments/import`       | Upload CSV/Excel. Queues `bulk-import` worker job. Returns `{ jobId }` with `202`.            |

### Rooms

| Method   | Endpoint            | Description                                                                                      |
| -------- | ------------------- | ------------------------------------------------------------------------------------------------ |
| `GET`    | `/api/rooms`        | Paginated list. Query: `search`, `departmentId`, `page`, `limit`.                                |
| `POST`   | `/api/rooms`        | Create room. Body: `{ roomNumber, departmentId, capacity, type? }`. Invalidates analytics cache. |
| `GET`    | `/api/rooms/:id`    | Single room with department and slot count.                                                      |
| `PUT`    | `/api/rooms/:id`    | Update room fields. Invalidates analytics cache.                                                 |
| `DELETE` | `/api/rooms/:id`    | Delete room. Invalidates analytics cache.                                                        |
| `POST`   | `/api/rooms/import` | Upload CSV/Excel. Queues bulk-import worker. Returns `{ jobId }` with `202`.                     |

### Courses

| Method   | Endpoint              | Description                                                                                                           |
| -------- | --------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/courses`        | Paginated list. Query: `branchId`, `semester`, `search`, `page`, `limit`. Groups by branch when no `branchId` filter. |
| `POST`   | `/api/courses`        | Create course. Body: `{ code, name, credits, type?, departmentId, branchId }`.                                        |
| `GET`    | `/api/courses/:id`    | Course with department, branch, faculty, and slots.                                                                   |
| `PUT`    | `/api/courses/:id`    | Update course fields.                                                                                                 |
| `DELETE` | `/api/courses/:id`    | Delete course.                                                                                                        |
| `POST`   | `/api/courses/import` | Upload CSV/Excel. Queues bulk-import worker. Returns `{ jobId }` with `202`.                                          |

### Faculty

| Method   | Endpoint                      | Description                                                                                                           |
| -------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `GET`    | `/api/faculty`                | Paginated list. Query: `search`, `role`, `departmentId`, `showDeleted`, `page`, `limit`.                              |
| `POST`   | `/api/faculty`                | Create faculty user. Body: `{ name, email, role?, departmentId? }`.                                                   |
| `GET`    | `/api/faculty/:id`            | Single user with department and assigned courses.                                                                     |
| `PUT`    | `/api/faculty/:id`            | Update user fields.                                                                                                   |
| `DELETE` | `/api/faculty/:id`            | Soft-delete (sets `deletedAt`).                                                                                       |
| `POST`   | `/api/faculty/:id/restore`    | Restore a soft-deleted user.                                                                                          |
| `POST`   | `/api/faculty/import/preview` | Upload CSV/Excel; returns row preview with duplicate detection (no DB writes).                                        |
| `POST`   | `/api/faculty/import/commit`  | Commit previewed rows. Body: `{ rows: [{ name, email, role, departmentCode, action: "skip"\|"update"\|"create" }] }`. |

### PDF Ingestion

| Method  | Endpoint                              | Description                                                                                                                         |
| ------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `POST`  | `/api/pdf-ingestion/upload`           | Upload PDF (max 10 MB). Saves file, creates `ImportJob`, queues `ingest-pdf` job. Returns `{ jobId, status: "QUEUED" }` with `202`. |
| `GET`   | `/api/pdf-ingestion/status/:jobId`    | **SSE stream.** Polls job status every 1s and pushes JSON events until `DONE`, `FAILED`, or timeout.                                |
| `GET`   | `/api/pdf-ingestion/queue`            | Active and recent PDF jobs plus BullMQ queue counts.                                                                                |
| `GET`   | `/api/pdf-ingestion/pages/:jobId`     | Job metadata and OCR page summaries. Query `?page=N&full=1` returns full OCR text for a page.                                       |
| `PATCH` | `/api/pdf-ingestion/pages/:jobId`     | Confirm/reject OCR pages during `OCR_REVIEW` status. Body: `{ pageNumber, confirmed?, rejected? }` or `{ confirmAll: true }`.       |
| `POST`  | `/api/pdf-ingestion/integrate/:jobId` | After page confirmation, queues `integrate-pdf` job to write confirmed data to the database. Returns `202`.                         |

#### PDF processing pipeline

```
Upload → ImportJob (QUEUED) → BullMQ worker
  │
  ├─ Text-based PDF?
  │    └─ pdf-parse extracts text → timetable parser → integrate into DB → DONE
  │
  └─ Scanned/image PDF?
       └─ pdftoppm renders pages to PNG
            └─ Groq vision LLM extracts structured timetable per page
                 └─ Parser normalises branches/rooms/courses/slots/faculty
                      └─ integrate into DB → DONE
```

**Import job statuses:** `QUEUED` → `PARSING` → (`OCR_REVIEW` if manual review needed) → `INTEGRATING` → `DONE` | `FAILED`

On completion the worker clears the analytics Redis cache and the dashboard receives a refresh event.

**Worker requirements:** `poppler-utils` (`pdftoppm`) and `GROQ_API_KEY` in the worker environment. Text-based PDFs work without Groq.

### Upload storage

Uploaded files are stored at `../data/uploads` (bind-mounted as `/data/samayak-uploads` in Docker). To use a different path, edit the volume mapping in `docker-compose.yml`:

```yaml
volumes:
  - /path/on/your/machine/uploads:/data/samayak-uploads
```

---

## Six Pages

1. **Dashboard** — 4 live analytics metrics with auto-refresh on PDF ingestion
2. **Departments** — CRUD + branch creation + bulk import + dependency warnings
3. **Rooms** — CRUD + type badges + capacity validation + analytics invalidation
4. **Courses** — Filter by branch/semester + zero-credit warnings + CRUD + import
5. **Faculty** — Import preview + duplicate handling + soft delete/restore + role badges
6. **PDF Ingestion** — Upload → SSE progress → import summary → dashboard refresh

## Component Structure

```
components/
├── ui/          Button, Card, Badge, Input, Modal, IconButton
├── layout/      Sidebar, Topbar
├── tables/      DataTable, Pagination, PageHeader
├── import/      BulkImport, ImportReport, OcrPageReview
└── analytics/   MetricCard, WelcomeBanner, ChartCard
```

## Environment Variables

Copy `.env.example` to `.env` and update values.

| Variable          | Used by     | Purpose                      |
| ----------------- | ----------- | ---------------------------- |
| `DATABASE_URL`    | App, worker | PostgreSQL connection        |
| `REDIS_URL`       | App, worker | Cache + BullMQ               |
| `NEXTAUTH_SECRET` | App         | JWT signing                  |
| `NEXTAUTH_URL`    | App         | Auth callback base URL       |
| `DEMO_ADMIN_*`    | Seed        | Pre-seeded admin credentials |
| `GROQ_API_KEY`    | Worker      | Vision LLM for scanned PDFs  |
| `GROQ_MODEL`      | Worker      | Optional model override      |
| `UPLOAD_DIR`      | App, worker | File upload directory        |

## Design System

Aligned with [Samayak Design System](https://serveranugatai-sudo.github.io/Samayak-Design-System):

- **Font**: Figtree
- **Primary**: #256199 | **Secondary**: #3DA1FF
- **Gradient**: `linear-gradient(105deg, #256199, #3DA1FF)`
- **Cards**: 22px radius, soft blue-tinted shadows
- **Buttons**: Pill-shaped primary CTAs with gradient + hover glow

## Docker Services

| Service       | Container        | Port |
| ------------- | ---------------- | ---- |
| PostgreSQL    | sape-postgres-db | 5400 |
| Redis         | sape-redis       | 6379 |
| Next.js App   | samayak-app      | 3000 |
| BullMQ Worker | samayak-worker   | —    |
| Bull Board    | sape-bull-board  | 3001 |

## Decisions Log

1. **Shared component library** — Extracted UI from inline styles into reusable `components/` for design-system consistency
2. **Dual PDF parser** — Text path (`pdf-parse`) for standard BIT Mesra PDFs; Groq vision LLM fallback for scanned/image PDFs
3. **CSE seed JSON** — Structured seed artifact (`prisma/data/cse-seed.json`) for reliable volume data vs OCR-only seeding
4. **Analytics event bus** — `samayak:analytics-refresh` custom event wires PDF ingestion → dashboard live update
5. **Branch API** — `POST /api/departments/:id/branches` for manual branch creation per assignment spec
6. **Redis caching** — 60s TTL on analytics with invalidation on writes and PDF ingestion complete
7. **Faculty import preview** — Two-phase import (preview → commit) with per-row duplicate detection and skip/update/create actions
8. **Correlation IDs** — `x-correlation-id` on every proxied request for end-to-end log tracing
