# ITSM Docker Setup

## Run full stack

```bash
docker compose up --build -d
```

Services:
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5000`
- Postgres: `localhost:5432`

## Stop

```bash
docker compose down
```

## Reset database volume

```bash
docker compose down -v
docker compose up --build -d
```

## Notes

- Database schema is initialized from:
  - `backend/schema/init.sql`
  - `backend/schema/crud_core_schema.sql`
- Backend uses:
  - `DATABASE_URL=postgresql://postgres:postgres@postgres:5432/itsm?schema=public`
- Frontend proxies `/api/*` to backend through Nginx.
