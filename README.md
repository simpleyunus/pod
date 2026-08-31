# POD — Vehicle Import & Delivery Tracking Platform

Monorepo for the POD platform. Two apps plus self-hosted infrastructure:

```
pod/
├── docker-compose.yml     Postgres · Keycloak · Meilisearch · MinIO · Redis · ClamAV · Gotenberg
├── apps/
│   ├── api/               NestJS + Prisma (source of truth, all business logic)
│   │   └── prisma/        schema.prisma — the core data model — and seed.ts
│   └── web/               Next.js (team app now, client portal later)
```

## Data model in one paragraph

The old spreadsheet tangled four independent facts into overlapping columns. The schema separates them: **lead stage** (pre-sale funnel field on Deal), **deal status** and **location** (denormalised snapshots on Deal, with the append-only `TimelineEvent` table as the truth and audit log), and **payment status** (never stored — always derived from `Payment` rows against the selling price). Statuses and locations are lookup tables, not enums, because POD's own lists from Sheet2 seed them and admins keep editing them. Vehicle fields live on Deal deliberately (one car = one deal at POD); split only if that ever changes.

## Run it

```bash
# 1. Infrastructure
cp .env.example .env            # adjust secrets
docker compose up -d

# 2. API
cd apps/api
cp .env.example .env
npm install
npx prisma migrate dev --name init
npm run prisma:seed
npm run start:dev               # http://localhost:4000/api/health

# 3. Web
cd ../web
cp .env.example .env
npm install
npm run dev                     # http://localhost:3000
```

## Build order

| # | Milestone | Delivers |
|---|-----------|----------|
| 0 | **Foundation** ✅ | This scaffold: infra compose, Prisma schema, deals API slice |
| 1 | **Guided Excel importer** | Upload → detect sheets → map columns → normalise (E.164 phones, `R207 150` prices, implausible dates) → preview & resolve → commit. `ImportBatch`/`ImportRow` tables already exist. The pilot's heart. |
| 2 | **Team board + deal page** | The dashboard with filter chips (Status · Location · Consultant · Country · Payment), KPIs, and the deal page with timeline, payments, documents. `GET /api/deals` already supports every chip. |
| 3 | **Search + media** | Meilisearch index sync (BullMQ), photo/video uploads through MinIO with ClamAV scanning before anything is served. |
| 4 | **Auth & roles** | Keycloak realm, JWT guard, role gating (owner sees cost/margin; consultants see their pipeline). |

Milestones 0–4 = the pilot. Phase 2 (client tracking portal + WhatsApp Utility notifications) and Phase 3 (Sage OAuth2 sync, Gotenberg invoices) follow — their schema (TrackingLink, etc.) ships now so nothing needs migrating later.

## Conventions

- Append-only timeline: `TimelineEvent` rows are never updated or deleted.
- Money is always `Decimal` + explicit 3-letter currency; FX snapshot captured per deal.
- `costPrice` never leaves the API for non-owner roles (enforced in M4; stripped in responses today).
- No personal data in URLs; portal links are long random tokens + hashed PIN.
- Zod validation on every input once endpoints take writes (M1 onward).
