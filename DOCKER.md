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
- For Google SSO, set:
  - `backend/.env`: `GOOGLE_CLIENT_ID=<google-web-client-id>`
  - Optional: `backend/.env`: `GOOGLE_HOSTED_DOMAIN=<company.com>` to restrict logins to a Workspace domain.
  - Optional: `frontend/.env`: `VITE_GOOGLE_CLIENT_ID=<google-web-client-id>` (backend config is used as fallback if omitted).
- For mail provider selection, set `backend/.env`:
  - `MAIL_PROVIDER=gmail|google-workspace|zoho|microsoft-workspace|outlook|custom`
  - SMTP/IMAP defaults are auto-selected by provider and can still be overridden with `SMTP_*` / `IMAP_*`.
- For SSO provider selection by client choice:
  - Zoho: `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` (optional `ZOHO_HOSTED_DOMAIN`)
  - Outlook/Microsoft: `MS_CLIENT_ID`, `MS_CLIENT_SECRET`, optional `MS_TENANT_ID` (`common` by default)
  - Optional callback overrides: `GOOGLE_REDIRECT_URI`, `ZOHO_REDIRECT_URI`, `MS_REDIRECT_URI`
  - Login UI auto-enables only configured providers through `/api/auth/sso/config`.
