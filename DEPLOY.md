# Deploying POD

## One-server deployment (Docker Compose)

```bash
cp .env.production.example .env      # fill in every CHANGE_ME value
docker compose -f docker-compose.prod.yml up -d --build
```

This starts Postgres, Redis, MinIO, Meilisearch, ClamAV, the API (port 4000)
and the web app (port 3000). The API applies the database schema on boot.

Put a TLS reverse proxy (Caddy is the least work) in front:

```
pod.example.com      → localhost:3000   (web)
api.pod.example.com  → localhost:4000   (api)
```

`WEB_ORIGIN` and `NEXT_PUBLIC_API_URL` in `.env` must match those two URLs.

### First run

Seed the reference data and user accounts from your machine (the seed uses
ts-node, which isn't in the production image):

```bash
cd apps/api
DATABASE_URL=postgresql://…your-prod-url… npx prisma db seed
```

Then sign in as `owner` / `ChangeMe123!`, go to **Team**, create real
accounts, and reset every seeded password.

## Feature switches (work the moment credentials arrive)

| Feature | Off state (today) | To turn on |
|---|---|---|
| WhatsApp sending | `WHATSAPP_MODE=log` — every message is recorded in the Notifications table, nothing sent | Meta Business app → WhatsApp → permanent token + phone number ID → set `WHATSAPP_MODE=meta`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` |
| WhatsApp two-way | Webhook endpoints live; test with `curl -X POST …/api/whatsapp/webhook -d '{"from":"+263…","body":"status"}'` | In the Meta app, set webhook URL to `https://api…/api/whatsapp/webhook` with `WHATSAPP_VERIFY_TOKEN` |
| Sage accounting | CSV exports on the Reports page; full API adapter built and waiting | Register app at developer.sage.com → set `SAGE_CLIENT_ID` / `SAGE_CLIENT_SECRET` / `SAGE_REDIRECT_URI` → admin presses **Connect Sage** on Reports and authorizes → **Sync now** pushes contacts, invoices & payments; tokens auto-refresh thereafter |
| USD-normalised reports | Per-currency only | Fill `FX_RATES_USD` with current rates |

## Ops notes

- **Stalled deals**: a daily 07:00 sweep records an internal reminder for any
  deal idle ≥ `STALLED_DAYS`. Also trigger manually:
  `POST /api/notifications/run-stalled-sweep` (admin).
- **Backups**: the state lives in the `pgdata` and `miniodata` volumes —
  back both up. Meilisearch can be rebuilt from Postgres.
- **Customer links** are capability URLs. They're unlisted, revocable per
  deal, and only ever expose that one car (prices only when toggled on).
