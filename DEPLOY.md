# Deploying POD

## One-server deployment (Docker Compose)

The stack is self-contained: Caddy terminates TLS and is the only service
that publishes ports, so a fresh server needs nothing but Docker.

```bash
cp .env.production.example .env      # fill in every value
docker compose -f docker-compose.prod.yml up -d --build
```

That starts Postgres (with nightly backups), Redis, MinIO, Meilisearch,
ClamAV, Gotenberg, the API, the web app and Caddy. The API applies the
database schema on boot.

### Hostnames

Three DNS A records, all pointing at the server's IP:

| `.env` | Serves | Proxied to |
|---|---|---|
| `WEB_HOSTNAME` | the web app | `web:3000` |
| `API_HOSTNAME` | the API | `api:4000` |
| `FILES_HOSTNAME` | file downloads | `minio:9000` |

The app's public URLs are derived from those three names, so there is one
place to set each and nothing can drift out of sync. Caddy gets a Let's
Encrypt certificate for each on first request.

`FILES_HOSTNAME` is not optional. Document, photo and audit-pack links are
pre-signed S3 URLs, and an AWS SigV4 signature covers the host name — the
host cannot be rewritten after signing, so the browser has to reach the same
host the URL was signed for.

**No domain?** `sslip.io` resolves `<anything>.<ip>.sslip.io` to that IP and
Let's Encrypt will issue for it, so a bare droplet can have real HTTPS with
nothing bought:

```
WEB_HOSTNAME=pod.203.0.113.7.sslip.io
API_HOSTNAME=api.203.0.113.7.sslip.io
FILES_HOSTNAME=files.203.0.113.7.sslip.io
```

## DigitalOcean

A Droplet has a static public IP, so no tunnel is needed.

**Size it for ClamAV.** Measured steady state is about 2 GB — ClamAV alone
holds ~1 GB of signatures. The $6 and $12 Droplets will not run this.

| | |
|---|---|
| Minimum | **4 GB / 2 vCPU** (~$24/mo) |
| Building on the box | add swap first, the Next.js build is the peak |

```bash
# Droplet: Ubuntu LTS, 4 GB. Then, as root:
adduser pod && usermod -aG sudo pod
curl -fsSL https://get.docker.com | sh && usermod -aG docker pod

# Swap, so the image build cannot OOM
fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Firewall — only Caddy's ports. Everything else is on the compose
# network and publishes nothing.
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

Then as `pod`:

```bash
git clone <repo> pod && cd pod
cp .env.production.example .env && $EDITOR .env
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml --profile tools run --rm seed
```

Point the three DNS records at the Droplet **before** the first request, so
Caddy can complete the ACME challenge. While you are still getting DNS
right, set `CADDY_CA_DIRECTIVE` to the Let's Encrypt staging URL (there is a
commented line in the env file) so a mistake cannot exhaust the real rate
limit.

Low on RAM at build time? Build the two images on a laptop and push them to
DigitalOcean's container registry instead; the Droplet then only runs them.

### Before it faces the internet

- Fill in **every** `CHANGE_ME`. The development defaults are in this repo.
- Sign in and reset all seven seeded passwords — they are all
  the `seed.ts` fallback on predictable usernames (`owner`, `admin`, `theo`…).
  In production, set `SEED_PASSWORD` — the seed refuses to run without it.
- Decide what should be public. Only `/track/<token>` is designed for
  customers; the rest is staff-only and is worth putting behind an identity
  gate (Cloudflare Access, or `basic_auth` in the Caddyfile).
- `pgbackups` covers Postgres only. The `miniodata` volume holds every
  uploaded document and needs its own backup.

### First run

Postgres publishes no port, so the seed runs over the compose network
rather than from your machine:

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm seed
```

It is idempotent — safe to re-run. Then sign in as `owner` with the seeded password,
go to **Team**, create real accounts, and reset every seeded password.

### Do not run the demo seed on a live server

`apps/api/prisma/seed-demo.ts` exists to fill the RTMS screens for
demonstrations — six invented drivers, twelve trips, incidents, audits. It is
**not** production data and must not be seeded onto a server holding real
records: an auditor reading the corrective-action register cannot tell an
invented incident from a real one.

The `seed` service in `docker-compose.prod.yml` runs `prisma db seed`, which
is `seed.ts` (lookups, policies, the real R1 fleet) and does **not** touch
seed-demo. Nothing extra is needed to keep it out — just do not run it by
hand. If it does get run, every row it writes carries a `demo_` id:

```bash
docker compose -f docker-compose.prod.yml --profile tools run --rm \
  seed npx ts-node prisma/seed-demo.ts --clear
```

The seed also writes placeholder RTMS expiry dates (PrDP, medical, COF,
CBRTA, insurance) so the compliance dashboard and the assignment gate have
something to act on during testing. They all carry a `TEST-` reference:

```sql
DELETE FROM "ComplianceItem" WHERE reference LIKE 'TEST-%';
```

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
- **RTMS scheduled jobs** (BullMQ, so they need Redis up):
  05:30 maintenance plans resync · 06:00 compliance expiry sweep and
  DUE_SOON/EXPIRED reminders · 07:00 stalled deals ·
  03:00 on the 1st, the monthly management review.
  All are triggerable by hand: `POST /api/compliance/recompute`,
  `/api/compliance/send-reminders`, `/api/maintenance/plans/sync`,
  `/api/compliance/reviews`.
- **Audit pack** rendering needs the `gotenberg` container. If it is down the
  export fails with "PDF service is unavailable" rather than producing a
  partial pack.
