# Urban Aana

Ecommerce platform for streetwear & accessories.

> Repo folder / npm package name remains `siyara` for local paths and Docker project naming.

## Repo layout

```text
apps/
  web/          # Next.js storefront + admin UI
  api/          # FastAPI backend
legacy/
  express-backend/   # previous Express API (reference only)
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

## Docker (recommended)

```bash
docker compose up -d --build
```

- Storefront: http://localhost:3000  
- API health: http://localhost:8001/api/health  
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
