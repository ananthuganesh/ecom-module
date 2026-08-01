# Urban Aana

Ecommerce platform for streetwear & accessories.

## Repo layout

```text
apps/
  web/          # Next.js storefront + admin UI
  api/          # FastAPI backend
docker/
  Dockerfile.web
  Dockerfile.api
docs/
docker-compose.yml   # web + api
```

## Stack

| Layer | Tech |
|-------|------|
| Web | Next.js (App Router) |
| API | FastAPI + Beanie/Motor |
| DB | MongoDB |
| Payments | Razorpay |
| Shipping | DTDC (Shipsy) |

## Docker (recommended)

Tuned for a **2 vCPU / 4 GB** host (Mongo via Atlas `MONGO_URI`).

```bash
docker compose up -d --build
```

- Storefront: http://localhost:3000  
- API health: http://localhost:8001/api/health  
- Caps: API ~640 MB / 0.7 CPU · Web ~1280 MB / 0.9 CPU (Next standalone)  
- Prefer building on a machine with ≥4 GB free RAM, then deploy images; building on the live 4 GB box can OOM during `next build`.

- Database: MongoDB Atlas via `MONGO_URI` in `.env` (no local DB container)

## Local development

```bash
# Mongo must be reachable (Docker: docker compose up -d mongo)
cp apps/api/.env.example apps/api/.env
npm run install:all
npm run dev
```

- Web: http://localhost:3000 (rewrites `/api` → `INTERNAL_BACKEND_URL`, default `http://127.0.0.1:8000`)
- API: http://localhost:8000

## Tests

```bash
npm run test:api
```
