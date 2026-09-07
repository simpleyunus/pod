# Deploying POD

## One-server deployment (Docker Compose)

```bash
cp .env.production.example .env      # fill in every CHANGE_ME value
docker compose -f docker-compose.prod.yml up -d --build
```

This starts Postgres, Redis, MinIO, Meilisearch, ClamAV, the API (port 4000)
and the web app (port 3000). The API applies the database schema on boot.

Put a TLS reverse proxy (Caddy is the least work) in front. **Three**
hostnames, not two:

```
pod.example.com       → localhost:3000   (web)
api.pod.example.com   → localhost:4000   (api)
files.pod.example.com → localhost:9000   (MinIO S3 — file downloads)
```

`WEB_ORIGIN`, `NEXT_PUBLIC_API_URL` and `S3_PUBLIC_ENDPOINT` in `.env` must
match those three URLs.

The third one is not optional. Document, photo and audit-pack links are
pre-signed S3 URLs, and an AWS SigV4 signature covers the host name — so the
host cannot be swapped afterwards, and the browser must be able to reach the
same host the URL was signed for. Without `S3_PUBLIC_ENDPOINT` every download
link points at `http://minio:9000`, which only resolves inside the compose
network. MinIO's `:9001` console is deliberately not published; only the S3
API on `:9000` is, and only on loopback for the proxy to pick up.

`NEXT_PUBLIC_API_URL` is baked into the web bundle **at image build time**,
so change it *before* `--build`, not after.

## Exposing a machine that has no public IP

A laptop or office machine behind NAT (or CGNAT, where inbound port
forwarding cannot work at all) can still serve this. A tunnel gives you real
HTTPS hostnames with no router configuration and no inbound ports open:

```bash
brew install cloudflared
cloudflared tunnel login
cloudflared tunnel create pod
```

`~/.cloudflared/config.yml`:

```yaml
tunnel: pod
credentials-file: /Users/<you>/.cloudflared/<tunnel-id>.json
ingress:
  - hostname: pod.example.com
    service: http://localhost:3000
  - hostname: api.pod.example.com
    service: http://localhost:4000
  - hostname: files.pod.example.com
    service: http://localhost:9000
  - service: http_status:404
```

```bash
cloudflared tunnel route dns pod pod.example.com
cloudflared tunnel route dns pod api.pod.example.com
cloudflared tunnel route dns pod files.pod.example.com
cloudflared tunnel run pod          # or: cloudflared service install
```

Before pointing anything at the public internet:

- Fill in **every** `CHANGE_ME` in `.env`. The dev defaults are in the repo.
- Sign in and reset all seven seeded passwords — they are all `ChangeMe123!`
  and the accounts are named `owner`, `admin`, `theo`, and so on.
- Decide what should be public. Only `/track/<token>` is designed for
  customers; the rest is staff-only and is worth putting behind an
  identity gate (Cloudflare Access, or your proxy's basic auth).
- The machine is now the whole system. It sleeping is an outage, and
  `pgbackups` only covers Postgres — the `miniodata` volume holds every
  uploaded document and needs its own backup.

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
