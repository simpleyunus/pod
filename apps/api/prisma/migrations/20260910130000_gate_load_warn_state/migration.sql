-- The gate treated an unweighed load as a PASS, so a trip could depart, be
-- marked Delivered, and show a green gate without anyone ever weighing it.
-- Overloading is the most-audited RTMS item, so silence must not read as
-- compliance.
--
-- WARN is "passed, but on an unanswered question a human accepted", which is
-- deliberately not the same as OVERRIDDEN ("we bypassed a hard failure").
-- Kept as separate columns for the same reason: an auditor treats the two
-- very differently, and collapsing them loses that.
--
-- Note on the enum: PostgreSQL 12+ allows ADD VALUE inside a transaction so
-- long as the new value is not used in the same transaction. This migration
-- only adds it; the first write happens later, from the application.
ALTER TYPE "GateDecision" ADD VALUE 'WARN';

ALTER TABLE "Assignment"
  ADD COLUMN "gateWarnAckAt"     TIMESTAMP(3),
  ADD COLUMN "gateWarnAckById"   TEXT,
  ADD COLUMN "gateWarnAckReason" TEXT;

-- The gate has always computed `advisory`; persist() dropped it, so once
-- stored a warning and a genuine pass were indistinguishable.
ALTER TABLE "AssignmentGateCheck"
  ADD COLUMN "advisory" BOOLEAN NOT NULL DEFAULT false;
