-- Stalled deals were measured from Deal.updatedAt, which Prisma bumps on any
-- write to the row. Correcting a colour or a phone number reset the clock, so
-- a car parked at Beitbridge for six weeks could still read as healthy.
-- Track actual movement instead: the last status or location change.
ALTER TABLE "Deal" ADD COLUMN "lastProgressAt" TIMESTAMP(3);

-- Per-stage patience. Mandatory with a sane default, so there is no global
-- number to tune and no env var to redeploy: thresholds live in the database
-- where an admin can adjust one stage without shipping anything.
ALTER TABLE "DealStatus" ADD COLUMN "stalledAfterDays" INTEGER NOT NULL DEFAULT 10;

CREATE INDEX "Deal_lastProgressAt_idx" ON "Deal"("lastProgressAt");

-- Backfill from the timeline, which the schema already calls the truth.
-- A deal that has never moved falls back to when it was created.
UPDATE "Deal" d
SET "lastProgressAt" = COALESCE(
  (SELECT max(t."createdAt")
     FROM "TimelineEvent" t
    WHERE t."dealId" = d."id"
      AND t."type" IN ('STATUS_CHANGE', 'LOCATION_CHANGE')),
  d."createdAt"
);

-- Starting thresholds for the seeded pipeline. Weeks at the border is routine;
-- days in "Ready for delivery" means nobody has phoned the customer.
UPDATE "DealStatus" SET "stalledAfterDays" =  7 WHERE "name" = 'Deposit paid';
UPDATE "DealStatus" SET "stalledAfterDays" = 10 WHERE "name" = 'Purchased';
UPDATE "DealStatus" SET "stalledAfterDays" = 21 WHERE "name" = 'Documents in progress';
UPDATE "DealStatus" SET "stalledAfterDays" =  7 WHERE "name" = 'In transit';
UPDATE "DealStatus" SET "stalledAfterDays" = 14 WHERE "name" = 'At border';
UPDATE "DealStatus" SET "stalledAfterDays" =  5 WHERE "name" = 'Cleared';
UPDATE "DealStatus" SET "stalledAfterDays" =  4 WHERE "name" = 'Ready for delivery';
