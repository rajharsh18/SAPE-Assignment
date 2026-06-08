# Samayak Admin Panel

> Academic operations management platform for Indian universities.

## Quick Start (Docker)

```bash
# 1. Clone the repo
git clone <repo-url>
cd samayak-admin

# 2. Copy environment file
cp .env.example .env

# 3. Start everything (migrations + CSE seed run automatically)
docker-compose up --build

# 4. Access the app
# App:        http://localhost:3000
# Bull Board: http://localhost:3001
# Adminer:    http://localhost:8080  (if enabled)
```

## Demo Login

| Field    | Value              |
|----------|--------------------|
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

## Architecture

```
┌─────────────────┐    ┌──────────────┐    ┌───────────┐
│  Next.js 16 App │───▶│  PostgreSQL  │    │   Redis   │
│  (Port 3000)    │    │  (Port 5400) │    │ (Port 6379│
└────────┬────────┘    └──────────────┘    └─────┬─────┘
         │                                       │
         │              ┌────────────────┐       │
         └─────────────▶│  BullMQ Worker │◀──────┘
                        │  (+ Tesseract) │
                        └────────────────┘
```

## Tech Stack

| Layer       | Technology         |
|-------------|-------------------|
| Framework   | Next.js 16 (App Router) |
| Language    | TypeScript (strict) |
| Database    | PostgreSQL 18.2    |
| ORM         | Prisma             |
| Cache/Queue | Redis + BullMQ     |
| Styling     | Tailwind CSS 4 + Samayak Design System |
| Charts      | Recharts           |
| Auth        | NextAuth.js (JWT)  |
| PDF Parse   | pdf-parse + pdfjs-dist + Tesseract OCR fallback |
| CSV/Excel   | PapaParse + SheetJS |

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
├── import/      BulkImport, ImportReport
└── analytics/   MetricCard, WelcomeBanner, ChartCard
```

## Environment Variables

Copy `.env.example` to `.env` and update values. See `.env.example` for full list.

## PDF Ingestion (Tesseract OCR → auto-insert)

Scanned/image PDFs (like `CSE(8).pdf`) are processed automatically:

1. **Poppler** (`pdftoppm`) renders each page to PNG
2. **Tesseract OCR** extracts text per page
3. Parser extracts courses, rooms, slots, faculty
4. Data is **inserted into the database** automatically
5. Dashboard analytics refresh

Text-based PDFs skip OCR and import directly.

```bash
docker-compose up --build
```

### Upload storage

Uploaded PDFs are stored on the host at `samayak-admin/data/uploads` (bind-mounted into app and worker). To use a different folder, edit the volume path in `docker-compose.yml`:

```yaml
volumes:
  - /path/on/your/machine/uploads:/data/samayak-uploads
```

## Design System

Aligned with [Samayak Design System](https://serveranugatai-sudo.github.io/Samayak-Design-System):

- **Font**: Figtree
- **Primary**: #256199 | **Secondary**: #3DA1FF
- **Gradient**: `linear-gradient(105deg, #256199, #3DA1FF)`
- **Cards**: 22px radius, soft blue-tinted shadows
- **Buttons**: Pill-shaped primary CTAs with gradient + hover glow

## Docker Services

| Service | Container | Port |
|---------|-----------|------|
| PostgreSQL | sape-postgres-db | 5400 |
| Redis | sape-redis | 6379 |
| Next.js App | samayak-app | 3000 |
| BullMQ Worker | samayak-worker | — |
| Bull Board | sape-bull-board | 3001 |

## Decisions Log

1. **Shared component library** — Extracted UI from inline styles into reusable `components/` for design-system consistency
2. **Dual PDF parser** — Text path for standard BIT Mesra PDFs; Tesseract OCR fallback for scanned/image PDFs like CSE(8).pdf
3. **CSE seed JSON** — Structured seed artifact (`prisma/data/cse-seed.json`) for reliable volume data vs OCR-only seeding
4. **Analytics event bus** — `samayak:analytics-refresh` custom event wires PDF ingestion → dashboard live update
5. **Branch API** — `POST /api/departments/:id/branches` for manual branch creation per assignment spec
6. **Redis caching** — 60s TTL on analytics with invalidation on writes and PDF ingestion complete
