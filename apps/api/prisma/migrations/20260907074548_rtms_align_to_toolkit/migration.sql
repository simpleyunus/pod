-- Align the RTMS module to POD Logistics' actual toolkit documents
-- (R1-R17, P1-P6). Each register now carries its form's columns verbatim, so
-- an auditor is reading POD's own paperwork rather than our interpretation.
--
-- The RTMS tables have never held production data: every row came from the
-- sample seed, which this release replaces with the real R1 fleet and R16
-- driver. Emptying them is what lets the NOT NULL columns added below
-- (fleetNo, employeeNo, surname, maxLoadingMassKg, ...) be created cleanly.
--
-- Scope is the RTMS module only. Deal, Client, User, TimelineEvent, Payment,
-- Document, MediaAsset and the importer tables are not referenced anywhere
-- in this file.
DELETE FROM "InspectionResult";
DELETE FROM "IncidentPhoto";
DELETE FROM "CorrectiveAction";
DELETE FROM "AssignmentGateCheck";
DELETE FROM "AssignmentLeg";
DELETE FROM "TripMassRecord";
DELETE FROM "SpeedEvent";
DELETE FROM "Fine";
DELETE FROM "Incident";
DELETE FROM "Inspection";
DELETE FROM "WorkOrder";
DELETE FROM "Assignment";
DELETE FROM "TyreRecord";
DELETE FROM "MaintenancePlan";
DELETE FROM "ComplianceItem";
DELETE FROM "DriverDutyRecord";
DELETE FROM "RouteAcknowledgement";
DELETE FROM "PolicyAcknowledgement";
DELETE FROM "Hazard";
DELETE FROM "RouteRiskAssessment";
DELETE FROM "RiskAssessment";
DELETE FROM "AuditPack";
DELETE FROM "Driver";
DELETE FROM "Asset";

-- CreateEnum
CREATE TYPE "InspectionAnswer" AS ENUM ('YES', 'NO');

-- CreateEnum
CREATE TYPE "FaultCategory" AS ENUM ('DRIVER_FAULT', 'THIRD_PARTY_FAULT', 'SHARED', 'UNDETERMINED');

-- CreateEnum
CREATE TYPE "CorrectiveActionSource" AS ENUM ('INCIDENT', 'AUDIT_FINDING', 'FINE', 'FATIGUE_BREACH', 'INSPECTION', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditConformity" AS ENUM ('CONFORMS', 'MINOR_NON_CONFORMANCE', 'MAJOR_NON_CONFORMANCE', 'OBSERVATION');

-- DropForeignKey
ALTER TABLE "RouteRiskAssessment" DROP CONSTRAINT "RouteRiskAssessment_riskAssessmentId_fkey";

-- DropForeignKey
ALTER TABLE "SpeedEvent" DROP CONSTRAINT "SpeedEvent_assetId_fkey";

-- DropForeignKey
ALTER TABLE "SpeedEvent" DROP CONSTRAINT "SpeedEvent_assignmentId_fkey";

-- DropForeignKey
ALTER TABLE "SpeedEvent" DROP CONSTRAINT "SpeedEvent_driverId_fkey";

-- DropIndex
DROP INDEX "Asset_code_key";

-- DropIndex
DROP INDEX "Driver_code_key";

-- DropIndex
DROP INDEX "Driver_fullName_idx";

-- DropIndex
DROP INDEX "Fine_issuedOn_idx";

-- DropIndex
DROP INDEX "Incident_occurredAt_idx";

-- DropIndex
DROP INDEX "TripMassRecord_assetId_measuredAt_idx";

-- DropIndex
DROP INDEX "TripMassRecord_measuredAt_idx";

-- AlterTable
ALTER TABLE "Asset" DROP COLUMN "code",
DROP COLUMN "make",
DROP COLUMN "maxCombinationMassKg",
DROP COLUMN "maxMassKg",
DROP COLUMN "model",
DROP COLUMN "notes",
DROP COLUMN "tareMassKg",
DROP COLUMN "year",
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "fleetNo" TEXT NOT NULL,
ADD COLUMN     "makeManufacturer" TEXT,
ADD COLUMN     "maxLoadingMassKg" INTEGER NOT NULL,
ADD COLUMN     "maxPassengers" INTEGER,
ADD COLUMN     "yearModel" INTEGER;

-- AlterTable
ALTER TABLE "CorrectiveAction" ADD COLUMN     "auditFindingId" TEXT,
ADD COLUMN     "driverId" TEXT,
ADD COLUMN     "fineId" TEXT,
ADD COLUMN     "inspectionId" TEXT,
ADD COLUMN     "sourceType" "CorrectiveActionSource" NOT NULL,
ALTER COLUMN "incidentId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Driver" DROP COLUMN "code",
DROP COLUMN "dateOfBirth",
DROP COLUMN "fullName",
DROP COLUMN "notes",
ADD COLUMN     "chronicCondition" TEXT,
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "employeeNo" TEXT NOT NULL,
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "surname" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Fine" DROP COLUMN "amount",
DROP COLUMN "correctiveAction",
DROP COLUMN "currency",
DROP COLUMN "dueDate",
DROP COLUMN "issuedOn",
DROP COLUMN "paidOn",
DROP COLUMN "status",
ADD COLUMN     "correctiveActionsTaken" TEXT,
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "Hazard" DROP COLUMN "controls",
DROP COLUMN "description",
DROP COLUMN "likelihood",
DROP COLUMN "ownerUserId",
DROP COLUMN "residualLikelihood",
DROP COLUMN "residualRating",
DROP COLUMN "residualSeverity",
DROP COLUMN "riskRating",
DROP COLUMN "severity",
ADD COLUMN     "existingControls" TEXT,
ADD COLUMN     "hazardIdentified" TEXT NOT NULL,
ADD COLUMN     "impact" TEXT NOT NULL,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Incident" DROP COLUMN "currency",
DROP COLUMN "estimatedCost",
DROP COLUMN "latitude",
DROP COLUMN "longitude",
DROP COLUMN "occurredAt",
ADD COLUMN     "cause" TEXT,
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "faultCategory" "FaultCategory",
ADD COLUMN     "isNearMiss" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sapsReportNumber" TEXT,
ADD COLUMN     "sapsReportedAt" TIMESTAMP(3),
ADD COLUMN     "severityId" TEXT;

-- AlterTable
ALTER TABLE "Inspection" DROP COLUMN "signatureFileId",
ADD COLUMN     "clearedById" TEXT,
ADD COLUMN     "clearedBySignatureFileId" TEXT,
ADD COLUMN     "defectsClearedAt" TIMESTAMP(3),
ADD COLUMN     "driverSignatureFileId" TEXT,
ADD COLUMN     "reportedToController" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "tripInformation" TEXT;

-- AlterTable
ALTER TABLE "InspectionResult" DROP COLUMN "outcome",
ADD COLUMN     "answer" "InspectionAnswer" NOT NULL;

-- AlterTable
ALTER TABLE "RouteRiskAssessment" DROP COLUMN "description",
DROP COLUMN "distanceKm",
DROP COLUMN "riskAssessmentId",
ADD COLUMN     "emergencyContacts" TEXT,
ADD COLUMN     "returnJourney" TEXT,
ADD COLUMN     "routeHazards" TEXT,
ADD COLUMN     "siteEntryInstructions" TEXT,
ADD COLUMN     "siteExitInstructions" TEXT,
ADD COLUMN     "siteHazards" TEXT,
ADD COLUMN     "specialInstructions" TEXT;

-- AlterTable
ALTER TABLE "TripMassRecord" DROP COLUMN "measuredAt",
DROP COLUMN "notes",
DROP COLUMN "overloadPct",
DROP COLUMN "weighbridgeRef",
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "passengersLoaded" INTEGER,
ADD COLUMN     "permissiblePassengers" INTEGER,
ALTER COLUMN "massLoadedKg" DROP NOT NULL,
ALTER COLUMN "permissibleMaxKg" DROP NOT NULL;

-- AlterTable
ALTER TABLE "TyreRecord" DROP COLUMN "action",
DROP COLUMN "brand",
DROP COLUMN "cost",
DROP COLUMN "currency",
DROP COLUMN "fittedOdoKm",
DROP COLUMN "fittedOn",
DROP COLUMN "notes",
DROP COLUMN "position",
DROP COLUMN "removedOdoKm",
DROP COLUMN "removedOn",
DROP COLUMN "serialNo",
DROP COLUMN "size",
DROP COLUMN "treadDepthMm",
ADD COLUMN     "balancingAlignmentDone" BOOLEAN,
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "reasonForFitment" TEXT,
ADD COLUMN     "tyreFitted" TEXT NOT NULL,
ADD COLUMN     "tyrePosition" TEXT NOT NULL;

-- DropTable
DROP TABLE "SpeedEvent";

-- DropEnum
DROP TYPE "InspectionOutcome";

-- CreateTable
CREATE TABLE "IncidentSeverity" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IncidentSeverity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeedTrend" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "driverId" TEXT,
    "assetId" TEXT NOT NULL,
    "speedTrend" TEXT NOT NULL,
    "actionsTaken" TEXT,
    "assignmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeedTrend_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingCourse" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "refresherMonths" INTEGER,
    "description" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TrainingCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrainingRecord" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "completedOn" TIMESTAMP(3) NOT NULL,
    "expiresOn" TIMESTAMP(3),
    "trainerName" TEXT,
    "outcome" TEXT,
    "certificateFileId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrainingRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "conductedOn" TIMESTAMP(3),
    "auditorName" TEXT,
    "scope" TEXT,
    "summary" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditFinding" (
    "id" TEXT NOT NULL,
    "auditId" TEXT NOT NULL,
    "rtmsElement" "RtmsElement" NOT NULL,
    "conformity" "AuditConformity" NOT NULL,
    "description" TEXT NOT NULL,
    "evidence" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditFinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "IncidentSeverity_code_key" ON "IncidentSeverity"("code");

-- CreateIndex
CREATE INDEX "SpeedTrend_assetId_date_idx" ON "SpeedTrend"("assetId", "date");

-- CreateIndex
CREATE INDEX "SpeedTrend_driverId_idx" ON "SpeedTrend"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "TrainingCourse_code_key" ON "TrainingCourse"("code");

-- CreateIndex
CREATE INDEX "TrainingRecord_driverId_idx" ON "TrainingRecord"("driverId");

-- CreateIndex
CREATE INDEX "TrainingRecord_courseId_idx" ON "TrainingRecord"("courseId");

-- CreateIndex
CREATE UNIQUE INDEX "Audit_reference_key" ON "Audit"("reference");

-- CreateIndex
CREATE INDEX "Audit_scheduledFor_idx" ON "Audit"("scheduledFor");

-- CreateIndex
CREATE INDEX "AuditFinding_auditId_idx" ON "AuditFinding"("auditId");

-- CreateIndex
CREATE INDEX "AuditFinding_rtmsElement_idx" ON "AuditFinding"("rtmsElement");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_fleetNo_key" ON "Asset"("fleetNo");

-- CreateIndex
CREATE INDEX "CorrectiveAction_sourceType_idx" ON "CorrectiveAction"("sourceType");

-- CreateIndex
CREATE INDEX "CorrectiveAction_dueDate_idx" ON "CorrectiveAction"("dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_employeeNo_key" ON "Driver"("employeeNo");

-- CreateIndex
CREATE INDEX "Driver_surname_firstName_idx" ON "Driver"("surname", "firstName");

-- CreateIndex
CREATE INDEX "Fine_date_idx" ON "Fine"("date");

-- CreateIndex
CREATE INDEX "Incident_date_idx" ON "Incident"("date");

-- CreateIndex
CREATE INDEX "TripMassRecord_assetId_date_idx" ON "TripMassRecord"("assetId", "date");

-- CreateIndex
CREATE INDEX "TripMassRecord_date_idx" ON "TripMassRecord"("date");

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_severityId_fkey" FOREIGN KEY ("severityId") REFERENCES "IncidentSeverity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_auditFindingId_fkey" FOREIGN KEY ("auditFindingId") REFERENCES "AuditFinding"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_fineId_fkey" FOREIGN KEY ("fineId") REFERENCES "Fine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedTrend" ADD CONSTRAINT "SpeedTrend_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedTrend" ADD CONSTRAINT "SpeedTrend_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedTrend" ADD CONSTRAINT "SpeedTrend_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "TrainingCourse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrainingRecord" ADD CONSTRAINT "TrainingRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditFinding" ADD CONSTRAINT "AuditFinding_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "Audit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

