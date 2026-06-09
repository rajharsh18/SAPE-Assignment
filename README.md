# SAPE Assignment

Academic operations management platform for Indian universities. The main application lives in [`samayak-admin/`](samayak-admin/) — a Next.js admin panel with department/room/course/faculty management, live analytics, and PDF timetable ingestion.

For API details, architecture, and how features are wired together, see [samayak-admin/README.md](samayak-admin/README.md).

---

## Prerequisites

| Requirement | Version / notes |
|-------------|-----------------|
| Docker & Docker Compose | Recommended path — runs Postgres, Redis, app, worker, and Bull Board |
| Node.js | 22+ (only if running locally without Docker) |
| Groq API key | Required for scanned/image PDF parsing (vision LLM in the worker) |

---

## Quick Start (Docker)

```bash
# 1. Clone the repository
git clone <repo-url>
cd SAPE-Assignment/samayak-admin

# 2. Create environment file
cp .env.example .env

# 3. Add your Groq API key (needed for image/scanned PDFs)
#    Edit .env and set:
#    GROQ_API_KEY=gsk_...

# 4. Start all services (migrations + CSE seed run automatically)
docker-compose up --build
```

### Access URLs

| Service | URL |
|---------|-----|
| Admin app | http://localhost:3000 |
| Bull Board (job queue UI) | http://localhost:3001 |
| PostgreSQL | `localhost:5400` |
| Redis | `localhost:6379` |

### Demo login

| Field | Value |
|-------|-------|
| Email | `admin@samayak.demo` |
| Password | `samayak2026` |

A **Use Demo Login** button is available on the login page.

---

## Repository Layout

```
SAPE-Assignment/
├── README.md                 ← This file (setup & overview)
└── samayak-admin/            ← Next.js application
    ├── app/                  ← Pages & API routes (App Router)
    ├── components/           ← UI, layout, tables, import, analytics
    ├── lib/                  ← DB, auth, analytics, PDF parsers, queues
    ├── workers/              ← BullMQ background workers
    ├── prisma/               ← Schema, migrations, seed data
    ├── docker-compose.yml
    └── README.md             ← Full project & API documentation
```

---

## Environment Setup

Copy `samayak-admin/.env.example` to `samayak-admin/.env` and review these values:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` / `REDIS_PASSWORD` | Redis for caching and BullMQ queues |
| `NEXTAUTH_SECRET` | JWT signing secret (use a random 32+ char string) |
| `NEXTAUTH_URL` | Public app URL (`http://localhost:3000` locally) |
| `DEMO_ADMIN_EMAIL` / `DEMO_ADMIN_PASSWORD` | Pre-seeded admin account |
| `GROQ_API_KEY` | Groq vision API key for scanned PDF parsing (worker only) |
| `GROQ_MODEL` | Optional — defaults to `meta-llama/llama-4-scout-17b-16e-instruct` |

---

## Local Development (without Docker)

If you prefer running services manually:

```bash
cd samayak-admin
npm install
cp .env.example .env
# Point DATABASE_URL and REDIS_URL at local Postgres/Redis instances

npx prisma migrate deploy
npx prisma db seed

# Terminal 1 — Next.js dev server
npm run dev

# Terminal 2 — background workers (requires poppler-utils + GROQ_API_KEY)
npx tsc --project tsconfig.worker.json
node dist/workers/index.js
```

On Windows, install [Poppler](https://github.com/oschwartz10612/poppler-windows/releases) and ensure `pdftoppm` is on your `PATH` for PDF vision parsing.

---

## Common Commands

```bash
# Re-seed CSE department data
cd samayak-admin && npx prisma db seed

# Test PDF parser against a sample file
npm run test:pdf-parser -- path/to/timetable.pdf

# Stop all Docker services
docker-compose down

# Stop and remove volumes (fresh database)
docker-compose down -v
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| App won't start — DB connection refused | Wait for Postgres healthcheck; confirm `DATABASE_URL` host is `sape-postgres-db` inside Docker |
| PDF upload stays queued | Ensure the `samayak-worker` container is running; check Bull Board at `:3001` |
| Scanned PDF fails to parse | Set `GROQ_API_KEY` in `.env` and rebuild the worker: `docker-compose up --build worker` |
| Analytics show stale data | Analytics cache TTL is 60s; room writes and PDF ingestion invalidate it automatically |
| Port 3000 already in use | Change the port mapping in `docker-compose.yml` or stop the conflicting process |

---

## Further Reading

- [samayak-admin/README.md](samayak-admin/README.md) — API reference, request flows, PDF pipeline, auth & roles
- [Samayak Design System](https://serveranugatai-sudo.github.io/Samayak-Design-System) — UI tokens and components
