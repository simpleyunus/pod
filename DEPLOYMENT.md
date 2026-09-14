# POD — Production Deployment Runbook

Target: DigitalOcean Droplet `pod-prod`, `165.227.231.28`, Ubuntu 24.04, 4 GB / 2 vCPU, London.
Deployed: 14 September 2026. App root on the droplet: `/root/pod`.

This document exists because the working deployment currently depends on several
changes that live only on the server — not in the repository. A fresh clone and
deploy will fail at four separate points without the patches in section 6.

---

## 1. What is running

| Service | Image / build | Port | Notes |
|---|---|---|---|
| `pod_postgres_1` | `postgres:16-alpine` | 5432 (internal) | volume `pgdata` |
| `pod_redis_1` | `redis:7-alpine` | 6379 (internal) | volume `redisdata` |
| `pod_api_1` | build `./apps/api` | 4000 → 4000 | NestJS, global prefix `/api` |
| `pod_web_1` | build `./apps/web` | 3000 → 3000 | Next.js 15, server-rendered |

There is no reverse proxy. The browser talks to the frontend on `:3000` and
directly to the API on `:4000`, which is why CORS configuration matters
(section 3). The original `docker-compose.prod.yml` in the repo included Caddy
and MinIO; both were dropped to get a working deployment, and neither is running.

Access: `http://165.227.231.28:3000`

---

## 2. Compose file

`/root/pod/docker-compose.updated.yml` — this is the file in use, not
`docker-compose.prod.yml` (which fails on docker-compose v1) and not
`docker-compose.simple.yml` (which predates the frontend).

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: pod
      POSTGRES_PASSWORD: pod_secure_password_12345
      POSTGRES_DB: pod
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

  api:
    build:
      context: ./apps/api
    ports:
      - "4000:4000"
    env_file: .env
    environment:
      NODE_ENV: production
      DATABASE_URL: postgresql://pod:pod_secure_password_12345@postgres:5432/pod
      REDIS_URL: redis://redis:6379
    depends_on:
      - postgres
      - redis

  web:
    build:
      context: ./apps/web
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
    depends_on:
      - api

volumes:
  pgdata:
  redisdata:
```

`apps/web/Dockerfile` — Next.js runs as a Node server. An earlier attempt used a
static-export pattern copying `/app/dist` into nginx; that fails, because
`next build` produces `.next`, not `dist`.

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 3. Environment variables

### `/root/pod/.env` (loaded by the api service)

```
WEB_ORIGIN=http://165.227.231.28:3000
```

`apps/api/src/main.ts` configures CORS as:

```ts
origin: process.env.WEB_ORIGIN
  ? process.env.WEB_ORIGIN.split(',')
  : /^http:\/\/localhost:\d+$/
```

With `WEB_ORIGIN` unset it falls back to a localhost-only regex, so every request
from the droplet's IP is rejected at preflight. The browser surfaces this as a
generic network error — the login screen shows "Could not reach the server",
which is indistinguishable from the API being down. If you later put a reverse
proxy on port 80, the origin becomes `http://165.227.231.28` with no port and
must be added as a second comma-separated value.

### `apps/web/.env.local`

```
NEXT_PUBLIC_API_URL=http://165.227.231.28:4000
```

Bare origin, no `/api` suffix — the client appends the prefix itself. See
`apps/web/app/_lib/api.ts:5`, where the fallback is `http://localhost:4000`.

Two consequences worth remembering. `NEXT_PUBLIC_*` variables are compiled into
the JavaScript bundle at build time, so changing this requires a rebuild, not a
restart — and a hard refresh in the browser afterwards, or you keep running the
old bundle. And the value must be reachable *from the user's browser*, not from
inside the container: `localhost:4000` resolves to the visitor's own machine.

There is no `.dockerignore` in `apps/web`, so `.env.local` is copied into the
image as intended.

---

## 4. Deploy from scratch

```bash
cd /root/pod

# 1. Build and start everything. Always a full down/up — see section 7.
docker-compose -f docker-compose.updated.yml down
docker-compose -f docker-compose.updated.yml up -d --build

# 2. Confirm four containers are up
docker ps
```

Prisma migrations are applied automatically on API startup; no manual migrate
step is needed. Verify with:

```bash
docker exec pod_postgres_1 psql -U pod -d pod -c '\dt'
```

Expect 58 tables including `User` and `_prisma_migrations`.

---

## 5. Seeding

The seed scripts are TypeScript and the API image ships production-only, so the
runner must be installed first.

```bash
# tsx, not ts-node — see section 7
docker exec -e NODE_ENV=development pod_api_1 \
  sh -c "npm install tsx --no-save"

# Reference data + 7 user accounts
docker exec -e NODE_ENV=development pod_api_1 npx tsx prisma/seed.ts

# Demo fleet, trips, compliance, incidents (optional)
docker exec -e NODE_ENV=development pod_api_1 npx tsx prisma/seed-demo.ts

# REQUIRED after any seeding — recomputes compliance RAG status
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"owner","password":"ChangeMe123!"}' \
  | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

curl -i -X POST http://localhost:4000/api/compliance/recompute \
  -H "Authorization: Bearer $TOKEN"
```

The recompute step is not optional. Without it the compliance items keep their
insert-time status and the traffic lights render green across the board — the
screens look populated but report the wrong thing. A correct run returns `201`
with roughly `{"checked":62,"changed":12}`.

`tsx` is installed into the running container and is lost on rebuild. Re-run the
install line before seeding after any `up --build`.

### Accounts created by `seed.ts`

`owner` (OWNER), `admin` (ADMIN), `theo`, `farai`, `armstrong`, `juliet`
(CONSULTANT), `viewer` (VIEWER) — all with password `ChangeMe123!`.

### Removing demo data

```bash
docker exec -e NODE_ENV=development pod_api_1 npx tsx prisma/seed-demo.ts --clear
```

Every row `seed-demo.ts` writes carries a `demo_` id prefix and the script
deletes in a foreign-key-safe order, so this is genuinely reversible. Never
create a real record with a `demo_` id — `--clear` would take it with the rest.

`seed.ts` separately writes seven placeholder compliance rows that are **test
data, not toolkit data**. Remove them before real use:

```bash
docker exec pod_postgres_1 psql -U pod -d pod \
  -c "DELETE FROM \"ComplianceItem\" WHERE reference LIKE 'TEST-%';"
```

---

## 6. Repository patches

These were first applied by hand on the server, then committed to the repo. A
fresh clone now seeds cleanly. Both are in `apps/api/prisma/`.

### 6.1 `seed-demo.ts` — asset type codes

The fixture file references three `typeCode` values that no seeder creates.
`seed.ts` populates exactly five: `TRUCK`, `TRAILER`, `CRANE`, `RIGID`, `LDV`.

| Fixture value | Correct value | Reasoning |
|---|---|---|
| `TRUCK_TRACTOR` | `TRUCK` | Actros 2645 and Scania R460 — prime movers |
| `CAR_CARRIER` | `TRAILER` | AFRIT 8-car double-deck; `maxPassengers: null`, `odometerKm: 0` — towed |
| `BAKKIE` | `LDV` | Toyota Hilux 2.8 GD-6, 5 seats, 1000 kg payload |

```bash
sed -i "s/'TRUCK_TRACTOR'/'TRUCK'/g; s/'BAKKIE'/'LDV'/g; s/'CAR_CARRIER'/'TRAILER'/g" \
  apps/api/prisma/seed-demo.ts
```

The alternative — adding these as new asset types — was rejected because
`AssetType` is toolkit-derived reference data and `TRUCK` already covers a
tractor unit. Inventing categories to satisfy fixtures corrupts the reference set.

### 6.2 `seed-rtms.ts` — three missing compliance kinds

Compliance kinds are defined in the `COMPLIANCE_KINDS` array in `seed-rtms.ts`,
which `seed.ts` imports — not in `seed.ts` itself. `seed-demo.ts` requires twelve
kinds; the array held eleven, three of which were absent. Unlike the asset types
these are genuine gaps — real documents for a cross-border operation with no
existing equivalent — so they were added to the reference set rather than mapped
away.

Three entries were inserted into that array, grouped with their siblings:

```ts
{ code: 'OPERATOR_CARD',   name: 'Cross-border operator card', ownerType: 'ASSET',  leadDaysDueSoon: 45, requiredForOperation: false, rtmsElement: 'JOURNEY_MANAGEMENT' },
{ code: 'PASSPORT',        name: 'Passport',                   ownerType: 'DRIVER', leadDaysDueSoon: 60, requiredForOperation: true,  rtmsElement: 'DRIVER_WELLNESS' },
{ code: 'INDUCTION',       name: 'Driver induction',           ownerType: 'DRIVER', leadDaysDueSoon: 30, requiredForOperation: false, rtmsElement: 'DRIVER_WELLNESS' },
```

`sortOrder` is assigned from array index at seed time (`sortOrder: i`), so
position in the array *is* the display order — no explicit value needed.
`OPERATOR_CARD` sits next to `CBRTA_PERMIT`, `PASSPORT` after `MEDICAL`, and
`INDUCTION` after `TRAINING_DUE`.

Note `PASSPORT` uses a **60-day** lead, not the default 30. Fixture line 106
(`demo_drv_04`, 41 days remaining) carries the comment `// due soon (60-day
lead)`. At the default lead that item renders green and the demo silently loses
one of its amber cases. Confirmed correct: the recompute transitions
`demo_ci_020` to `DUE_SOON`.

The equivalent SQL was applied by hand to the live database before the repo was
patched, so the running instance already has these three rows. The seeder upserts
by `code`, so re-running it is harmless.

`requiredForOperation` for `PASSPORT` is `true`, matching `DRIVER_LICENCE`,
`PRDP` and `MEDICAL` — a driver without a valid passport cannot cross into
Zimbabwe. No demo driver has an expired passport, so nothing is blocked today,
but a real driver added without a passport record **will** be blocked. Set it to
`false` if a warning is preferred over a hard gate.

### 6.3 Pulling these onto the droplet

`/root/pod` is a separate clone. After pushing:

```bash
cd /root/pod
git stash list && git status --short   # the hand-applied sed edits live here
git pull origin main
docker-compose -f docker-compose.updated.yml down
docker-compose -f docker-compose.updated.yml up -d --build
```

The droplet's working tree has the same `sed` substitutions applied by hand, so
expect a conflict on `seed-demo.ts`. They are byte-identical to what was
committed, so `git checkout -- apps/api/prisma/seed-demo.ts` before pulling is
the clean resolution. `.env` and `apps/web/.env.local` are untracked and survive
the pull — check they are still present afterwards.

Re-install `tsx` after the rebuild if you intend to re-seed (section 5).

---

## 7. Gotchas

**docker-compose v1 `KeyError: 'ContainerConfig'`.** Rebuilding a single service
(`up -d --build web`) against a newer Docker Engine throws this and leaves the
container stopped. Symptom: your change appears to have no effect, because the
old image is still running. Always `down` then `up -d --build`.

**`npm install` silently skips devDependencies.** The api service sets
`NODE_ENV=production`, under which npm omits dev packages and reports
"up to date" having installed nothing. Any install into that container needs
`docker exec -e NODE_ENV=development`.

**`ts-node` cannot run these seeds.** The project is configured as an ES module,
so Node uses the ESM loader while `ts-node` only hooks CommonJS `require`. It
fails with `ERR_UNKNOWN_FILE_EXTENSION` on a `.ts` file. `tsx` handles both and
needs no tsconfig changes. The comment inside `seed-demo.ts` recommending
`npx ts-node` is stale.

**`prisma/` is not volume-mounted.** The container runs a copy of the seed files
baked in at build time. Editing a file on the host changes nothing until a
rebuild; editing inside the container is lost on rebuild. Apply fixes to both, or
rebuild after editing the host copy.

**The "run the RTMS seed first" error is misleading.** It fires whenever a
reference lookup misses, regardless of cause. Running `seed.ts` or `seed-rtms.ts`
again does not help when the code simply does not exist in any seeder. Confirm
with `grep -n "CODE" apps/api/prisma/*.ts` before re-seeding.

---

## 8. Outstanding

**Security.** Seven accounts share the password `ChangeMe123!`. The site runs on
plain HTTP, so those credentials cross the internet in cleartext on every login.
Get a domain and a TLS certificate before real data or real users, and change the
passwords via `/auth/change-password`.

**No reverse proxy.** Exposing the API on `:4000` directly works but forces the
cross-origin setup described in section 3. Putting Caddy or nginx on port 80 to
serve the frontend and route `/api` to the backend removes the CORS dependency
and gives you a natural place to terminate TLS.

**Test data.** The seven `TEST-%` compliance rows from `seed.ts` are still
present and mixed in with the demo fixtures.

**Node version.** The API logs a warning that AWS SDK v3 will require Node ≥ 22
from January 2027; the image runs Node 20.20.2.

**Droplet not yet synced.** The section 6 patches are committed to the repo but
the droplet still runs the hand-edited copies. Pull and rebuild (section 6.3) so
the two agree — otherwise the next person to redeploy gets a different result
from the one running today.
