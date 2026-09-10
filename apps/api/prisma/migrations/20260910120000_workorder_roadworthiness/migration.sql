-- Element 3 (vehicle fitness) folded EVERY open work order into its RAG, so a
-- windscreen chip degraded roadworthiness exactly as much as a brake defect.
-- This flag separates the two. Existing rows default to false — routine until
-- someone marks them otherwise — which is the safe direction: it under-reports
-- rather than inventing roadworthiness problems that were never recorded.
ALTER TABLE "WorkOrder" ADD COLUMN "roadworthiness" BOOLEAN NOT NULL DEFAULT false;
