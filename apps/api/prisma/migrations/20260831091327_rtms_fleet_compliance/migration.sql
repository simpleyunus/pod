-- CreateEnum
CREATE TYPE "ComplianceOwnerType" AS ENUM ('ASSET', 'DRIVER');

-- CreateEnum
CREATE TYPE "ComplianceStatus" AS ENUM ('VALID', 'DUE_SOON', 'EXPIRED');

-- CreateEnum
CREATE TYPE "RtmsElement" AS ENUM ('MANAGEMENT_COMMITMENT', 'RISK_MANAGEMENT', 'VEHICLE_FITNESS', 'DRIVER_WELLNESS', 'LOAD_MANAGEMENT', 'JOURNEY_MANAGEMENT', 'INCIDENT_MANAGEMENT', 'MONITORING_REVIEW');

-- CreateEnum
CREATE TYPE "InspectionOutcome" AS ENUM ('PASS', 'FAIL', 'NA');

-- CreateEnum
CREATE TYPE "CorrectiveActionStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'VERIFIED');

-- CreateEnum
CREATE TYPE "GateDecision" AS ENUM ('PASS', 'FAIL', 'OVERRIDDEN');

-- CreateEnum
CREATE TYPE "TyreAction" AS ENUM ('FITTED', 'ROTATED', 'REPAIRED', 'REPLACED', 'SCRAPPED');

-- CreateEnum
CREATE TYPE "FineStatus" AS ENUM ('UNPAID', 'PAID', 'CONTESTED', 'WRITTEN_OFF');

-- CreateEnum
CREATE TYPE "AuditPackStatus" AS ENUM ('PENDING', 'BUILDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "FleetFileKind" AS ENUM ('COMPLIANCE_DOC', 'INSPECTION_PHOTO', 'INCIDENT_PHOTO', 'POD_SIGNATURE', 'POD_PHOTO', 'WORK_ORDER_DOC', 'MASS_CERTIFICATE', 'POLICY_DOC', 'REPORT_PDF');

-- CreateEnum
CREATE TYPE "FleetEntityType" AS ENUM ('ASSET', 'DRIVER', 'WORK_ORDER', 'INSPECTION', 'ASSIGNMENT', 'INCIDENT', 'COMPLIANCE_ITEM', 'CARRIER');

-- CreateEnum
CREATE TYPE "FleetEventType" AS ENUM ('STATUS_CHANGE', 'NOTE', 'DOCUMENT', 'SYSTEM', 'GATE_CHECK', 'GATE_OVERRIDE', 'INVESTIGATION', 'CORRECTIVE_ACTION', 'COMPLIANCE_CHANGE');

-- CreateTable
CREATE TABLE "AssetType" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isTrailer" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "AssetType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceKind" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "ownerType" "ComplianceOwnerType" NOT NULL,
    "leadDaysDueSoon" INTEGER NOT NULL DEFAULT 30,
    "requiredForOperation" BOOLEAN NOT NULL DEFAULT false,
    "rtmsElement" "RtmsElement",
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ComplianceKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderStatus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "WorkOrderStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripStatus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TripStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentStatus" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IncidentStatus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentCategory" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "IncidentCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionItemDef" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "InspectionItemDef_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetFile" (
    "id" TEXT NOT NULL,
    "kind" "FleetFileKind" NOT NULL,
    "bucket" TEXT NOT NULL,
    "objectKey" TEXT NOT NULL,
    "filename" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "scanStatus" "ScanStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asset" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "registrationNo" TEXT NOT NULL,
    "vin" TEXT,
    "typeId" TEXT NOT NULL,
    "make" TEXT,
    "model" TEXT,
    "year" INTEGER,
    "tareMassKg" INTEGER,
    "maxMassKg" INTEGER NOT NULL,
    "maxCombinationMassKg" INTEGER,
    "odometerKm" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "retiredAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Asset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phoneE164" TEXT,
    "email" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "userId" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "hiredOn" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceItem" (
    "id" TEXT NOT NULL,
    "ownerType" "ComplianceOwnerType" NOT NULL,
    "assetId" TEXT,
    "driverId" TEXT,
    "kindId" TEXT NOT NULL,
    "reference" TEXT,
    "issuedOn" TIMESTAMP(3),
    "expiresOn" TIMESTAMP(3),
    "status" "ComplianceStatus" NOT NULL DEFAULT 'VALID',
    "statusComputedAt" TIMESTAMP(3),
    "documentFileId" TEXT,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenancePlan" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Routine service',
    "intervalKm" INTEGER,
    "intervalMonths" INTEGER,
    "lastServiceOdoKm" INTEGER,
    "lastServiceDate" TIMESTAMP(3),
    "nextDueOdoKm" INTEGER,
    "nextDueDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MaintenancePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrder" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "statusId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "odometerKm" INTEGER,
    "partsCost" DECIMAL(12,2),
    "labourCost" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
    "supplier" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "requestedById" TEXT,
    "approvedById" TEXT,
    "documentFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inspection" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "driverId" TEXT,
    "assignmentId" TEXT,
    "performedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "odometerKm" INTEGER,
    "passed" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "signatureFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inspection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InspectionResult" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "outcome" "InspectionOutcome" NOT NULL,
    "note" TEXT,
    "photoFileId" TEXT,
    "workOrderId" TEXT,

    CONSTRAINT "InspectionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TyreRecord" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "action" "TyreAction" NOT NULL,
    "brand" TEXT,
    "size" TEXT,
    "serialNo" TEXT,
    "treadDepthMm" DECIMAL(4,1),
    "fittedOn" TIMESTAMP(3),
    "fittedOdoKm" INTEGER,
    "removedOn" TIMESTAMP(3),
    "removedOdoKm" INTEGER,
    "cost" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TyreRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiskAssessment" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "scope" TEXT,
    "rtmsElement" "RtmsElement",
    "version" INTEGER NOT NULL DEFAULT 1,
    "assessedOn" TIMESTAMP(3) NOT NULL,
    "reviewDueOn" TIMESTAMP(3),
    "assessedById" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hazard" (
    "id" TEXT NOT NULL,
    "riskAssessmentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "likelihood" INTEGER NOT NULL,
    "severity" INTEGER NOT NULL,
    "riskRating" INTEGER NOT NULL,
    "controls" TEXT NOT NULL,
    "residualLikelihood" INTEGER,
    "residualSeverity" INTEGER,
    "residualRating" INTEGER,
    "ownerUserId" TEXT,

    CONSTRAINT "Hazard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteRiskAssessment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "originLocationId" TEXT,
    "destinationLocationId" TEXT,
    "description" TEXT,
    "distanceKm" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "reviewDueOn" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "riskAssessmentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RouteRiskAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteAcknowledgement" (
    "id" TEXT NOT NULL,
    "routeRiskAssessmentId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureFileId" TEXT,

    CONSTRAINT "RouteAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Carrier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contactName" TEXT,
    "phoneE164" TEXT,
    "email" TEXT,
    "fleetSize" INTEGER,
    "routes" TEXT,
    "ratePerKm" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
    "complianceNotes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Carrier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assignment" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "dealId" TEXT,
    "assetId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "carrierId" TEXT,
    "statusId" TEXT NOT NULL,
    "originLocationId" TEXT,
    "destinationLocationId" TEXT,
    "routeRiskAssessmentId" TEXT,
    "plannedDepartureAt" TIMESTAMP(3),
    "actualDepartureAt" TIMESTAMP(3),
    "plannedArrivalAt" TIMESTAMP(3),
    "actualArrivalAt" TIMESTAMP(3),
    "distanceKm" INTEGER,
    "podCapturedAt" TIMESTAMP(3),
    "podReceivedByName" TEXT,
    "podSignatureFileId" TEXT,
    "podNotes" TEXT,
    "gateDecision" "GateDecision",
    "gateCheckedAt" TIMESTAMP(3),
    "gateOverrideReason" TEXT,
    "gateOverriddenById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentLeg" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "fromLocationId" TEXT,
    "toLocationId" TEXT,
    "plannedAt" TIMESTAMP(3),
    "arrivedAt" TIMESTAMP(3),
    "distanceKm" INTEGER,
    "notes" TEXT,

    CONSTRAINT "AssignmentLeg_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssignmentGateCheck" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "detail" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssignmentGateCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripMassRecord" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "measuredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "massLoadedKg" INTEGER NOT NULL,
    "permissibleMaxKg" INTEGER NOT NULL,
    "overloaded" BOOLEAN NOT NULL,
    "overloadPct" DECIMAL(6,2),
    "weighbridgeRef" TEXT,
    "documentFileId" TEXT,
    "notes" TEXT,

    CONSTRAINT "TripMassRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverDutyRecord" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "onDutyAt" TIMESTAMP(3) NOT NULL,
    "offDutyAt" TIMESTAMP(3),
    "drivingMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverDutyRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Incident" (
    "id" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "assetId" TEXT,
    "driverId" TEXT,
    "assignmentId" TEXT,
    "categoryId" TEXT,
    "statusId" TEXT NOT NULL,
    "locationText" TEXT,
    "latitude" DECIMAL(9,6),
    "longitude" DECIMAL(9,6),
    "description" TEXT NOT NULL,
    "immediateCause" TEXT,
    "underlyingCause" TEXT,
    "systemicCause" TEXT,
    "injuries" INTEGER NOT NULL DEFAULT 0,
    "vehicleDamage" BOOLEAN NOT NULL DEFAULT false,
    "thirdPartyInvolved" BOOLEAN NOT NULL DEFAULT false,
    "estimatedCost" DECIMAL(12,2),
    "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
    "reportedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IncidentPhoto" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncidentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CorrectiveAction" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" "CorrectiveActionStatus" NOT NULL DEFAULT 'OPEN',
    "completedAt" TIMESTAMP(3),
    "verifiedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CorrectiveAction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fine" (
    "id" TEXT NOT NULL,
    "noticeNumber" TEXT,
    "issuedOn" TIMESTAMP(3) NOT NULL,
    "assetId" TEXT,
    "driverId" TEXT,
    "assignmentId" TEXT,
    "reason" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'ZAR',
    "dueDate" TIMESTAMP(3),
    "paidOn" TIMESTAMP(3),
    "status" "FineStatus" NOT NULL DEFAULT 'UNPAID',
    "correctiveAction" TEXT,
    "documentFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpeedEvent" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "driverId" TEXT,
    "assignmentId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "speedKph" INTEGER NOT NULL,
    "limitKph" INTEGER NOT NULL,
    "overByKph" INTEGER NOT NULL,
    "locationText" TEXT,
    "source" TEXT DEFAULT 'manual',
    "actionTaken" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpeedEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Policy" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "supersededAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "rtmsElement" "RtmsElement",
    "documentFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyAcknowledgement" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "driverId" TEXT,
    "userId" TEXT,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "signatureFileId" TEXT,

    CONSTRAINT "PolicyAcknowledgement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SafetyObjective" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metric" TEXT NOT NULL,
    "targetValue" DECIMAL(12,2) NOT NULL,
    "unit" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "actualValue" DECIMAL(12,2),
    "rtmsElement" "RtmsElement",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SafetyObjective_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManagementReview" (
    "id" TEXT NOT NULL,
    "periodMonth" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metrics" JSONB NOT NULL,
    "notes" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "documentFileId" TEXT,

    CONSTRAINT "ManagementReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditPack" (
    "id" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedById" TEXT,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "AuditPackStatus" NOT NULL DEFAULT 'PENDING',
    "reports" JSONB,
    "fileId" TEXT,
    "error" TEXT,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AuditPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FleetEvent" (
    "id" TEXT NOT NULL,
    "entityType" "FleetEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "type" "FleetEventType" NOT NULL,
    "note" TEXT,
    "meta" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FleetEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AssetType_code_key" ON "AssetType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceKind_code_key" ON "ComplianceKind"("code");

-- CreateIndex
CREATE INDEX "ComplianceKind_ownerType_active_idx" ON "ComplianceKind"("ownerType", "active");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrderStatus_code_key" ON "WorkOrderStatus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "TripStatus_code_key" ON "TripStatus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentStatus_code_key" ON "IncidentStatus"("code");

-- CreateIndex
CREATE UNIQUE INDEX "IncidentCategory_code_key" ON "IncidentCategory"("code");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionItemDef_code_key" ON "InspectionItemDef"("code");

-- CreateIndex
CREATE INDEX "FleetFile_kind_idx" ON "FleetFile"("kind");

-- CreateIndex
CREATE UNIQUE INDEX "FleetFile_bucket_objectKey_key" ON "FleetFile"("bucket", "objectKey");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_code_key" ON "Asset"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Asset_registrationNo_key" ON "Asset"("registrationNo");

-- CreateIndex
CREATE INDEX "Asset_active_idx" ON "Asset"("active");

-- CreateIndex
CREATE INDEX "Asset_typeId_idx" ON "Asset"("typeId");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_code_key" ON "Driver"("code");

-- CreateIndex
CREATE INDEX "Driver_active_idx" ON "Driver"("active");

-- CreateIndex
CREATE INDEX "Driver_fullName_idx" ON "Driver"("fullName");

-- CreateIndex
CREATE INDEX "ComplianceItem_ownerType_status_idx" ON "ComplianceItem"("ownerType", "status");

-- CreateIndex
CREATE INDEX "ComplianceItem_expiresOn_idx" ON "ComplianceItem"("expiresOn");

-- CreateIndex
CREATE INDEX "ComplianceItem_assetId_idx" ON "ComplianceItem"("assetId");

-- CreateIndex
CREATE INDEX "ComplianceItem_driverId_idx" ON "ComplianceItem"("driverId");

-- CreateIndex
CREATE INDEX "ComplianceItem_kindId_idx" ON "ComplianceItem"("kindId");

-- CreateIndex
CREATE INDEX "MaintenancePlan_assetId_idx" ON "MaintenancePlan"("assetId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkOrder_number_key" ON "WorkOrder"("number");

-- CreateIndex
CREATE INDEX "WorkOrder_assetId_idx" ON "WorkOrder"("assetId");

-- CreateIndex
CREATE INDEX "WorkOrder_statusId_idx" ON "WorkOrder"("statusId");

-- CreateIndex
CREATE UNIQUE INDEX "Inspection_assignmentId_key" ON "Inspection"("assignmentId");

-- CreateIndex
CREATE INDEX "Inspection_assetId_performedAt_idx" ON "Inspection"("assetId", "performedAt");

-- CreateIndex
CREATE INDEX "InspectionResult_itemId_idx" ON "InspectionResult"("itemId");

-- CreateIndex
CREATE UNIQUE INDEX "InspectionResult_inspectionId_itemId_key" ON "InspectionResult"("inspectionId", "itemId");

-- CreateIndex
CREATE INDEX "TyreRecord_assetId_idx" ON "TyreRecord"("assetId");

-- CreateIndex
CREATE INDEX "Hazard_riskAssessmentId_idx" ON "Hazard"("riskAssessmentId");

-- CreateIndex
CREATE INDEX "RouteAcknowledgement_driverId_idx" ON "RouteAcknowledgement"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "RouteAcknowledgement_routeRiskAssessmentId_driverId_version_key" ON "RouteAcknowledgement"("routeRiskAssessmentId", "driverId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "Carrier_name_key" ON "Carrier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Assignment_reference_key" ON "Assignment"("reference");

-- CreateIndex
CREATE INDEX "Assignment_dealId_idx" ON "Assignment"("dealId");

-- CreateIndex
CREATE INDEX "Assignment_assetId_idx" ON "Assignment"("assetId");

-- CreateIndex
CREATE INDEX "Assignment_driverId_idx" ON "Assignment"("driverId");

-- CreateIndex
CREATE INDEX "Assignment_statusId_idx" ON "Assignment"("statusId");

-- CreateIndex
CREATE INDEX "Assignment_plannedDepartureAt_idx" ON "Assignment"("plannedDepartureAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssignmentLeg_assignmentId_sequence_key" ON "AssignmentLeg"("assignmentId", "sequence");

-- CreateIndex
CREATE INDEX "AssignmentGateCheck_assignmentId_idx" ON "AssignmentGateCheck"("assignmentId");

-- CreateIndex
CREATE INDEX "TripMassRecord_assetId_measuredAt_idx" ON "TripMassRecord"("assetId", "measuredAt");

-- CreateIndex
CREATE INDEX "TripMassRecord_measuredAt_idx" ON "TripMassRecord"("measuredAt");

-- CreateIndex
CREATE INDEX "DriverDutyRecord_driverId_onDutyAt_idx" ON "DriverDutyRecord"("driverId", "onDutyAt");

-- CreateIndex
CREATE UNIQUE INDEX "Incident_reference_key" ON "Incident"("reference");

-- CreateIndex
CREATE INDEX "Incident_occurredAt_idx" ON "Incident"("occurredAt");

-- CreateIndex
CREATE INDEX "Incident_assetId_idx" ON "Incident"("assetId");

-- CreateIndex
CREATE INDEX "Incident_driverId_idx" ON "Incident"("driverId");

-- CreateIndex
CREATE INDEX "Incident_statusId_idx" ON "Incident"("statusId");

-- CreateIndex
CREATE INDEX "IncidentPhoto_incidentId_idx" ON "IncidentPhoto"("incidentId");

-- CreateIndex
CREATE INDEX "CorrectiveAction_incidentId_idx" ON "CorrectiveAction"("incidentId");

-- CreateIndex
CREATE INDEX "CorrectiveAction_status_idx" ON "CorrectiveAction"("status");

-- CreateIndex
CREATE INDEX "Fine_assetId_idx" ON "Fine"("assetId");

-- CreateIndex
CREATE INDEX "Fine_driverId_idx" ON "Fine"("driverId");

-- CreateIndex
CREATE INDEX "Fine_issuedOn_idx" ON "Fine"("issuedOn");

-- CreateIndex
CREATE INDEX "SpeedEvent_assetId_occurredAt_idx" ON "SpeedEvent"("assetId", "occurredAt");

-- CreateIndex
CREATE INDEX "SpeedEvent_driverId_idx" ON "SpeedEvent"("driverId");

-- CreateIndex
CREATE UNIQUE INDEX "Policy_code_version_key" ON "Policy"("code", "version");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgement_policyId_idx" ON "PolicyAcknowledgement"("policyId");

-- CreateIndex
CREATE INDEX "PolicyAcknowledgement_driverId_idx" ON "PolicyAcknowledgement"("driverId");

-- CreateIndex
CREATE INDEX "SafetyObjective_periodStart_idx" ON "SafetyObjective"("periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "ManagementReview_periodMonth_key" ON "ManagementReview"("periodMonth");

-- CreateIndex
CREATE INDEX "ManagementReview_periodMonth_idx" ON "ManagementReview"("periodMonth");

-- CreateIndex
CREATE INDEX "AuditPack_status_idx" ON "AuditPack"("status");

-- CreateIndex
CREATE INDEX "FleetEvent_entityType_entityId_createdAt_idx" ON "FleetEvent"("entityType", "entityId", "createdAt");

-- AddForeignKey
ALTER TABLE "Asset" ADD CONSTRAINT "Asset_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "AssetType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceItem" ADD CONSTRAINT "ComplianceItem_kindId_fkey" FOREIGN KEY ("kindId") REFERENCES "ComplianceKind"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenancePlan" ADD CONSTRAINT "MaintenancePlan_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrder" ADD CONSTRAINT "WorkOrder_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "WorkOrderStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inspection" ADD CONSTRAINT "Inspection_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_inspectionId_fkey" FOREIGN KEY ("inspectionId") REFERENCES "Inspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InspectionItemDef"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InspectionResult" ADD CONSTRAINT "InspectionResult_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "WorkOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TyreRecord" ADD CONSTRAINT "TyreRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hazard" ADD CONSTRAINT "Hazard_riskAssessmentId_fkey" FOREIGN KEY ("riskAssessmentId") REFERENCES "RiskAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteRiskAssessment" ADD CONSTRAINT "RouteRiskAssessment_riskAssessmentId_fkey" FOREIGN KEY ("riskAssessmentId") REFERENCES "RiskAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteAcknowledgement" ADD CONSTRAINT "RouteAcknowledgement_routeRiskAssessmentId_fkey" FOREIGN KEY ("routeRiskAssessmentId") REFERENCES "RouteRiskAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteAcknowledgement" ADD CONSTRAINT "RouteAcknowledgement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "Deal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_carrierId_fkey" FOREIGN KEY ("carrierId") REFERENCES "Carrier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "TripStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Assignment" ADD CONSTRAINT "Assignment_routeRiskAssessmentId_fkey" FOREIGN KEY ("routeRiskAssessmentId") REFERENCES "RouteRiskAssessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentLeg" ADD CONSTRAINT "AssignmentLeg_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssignmentGateCheck" ADD CONSTRAINT "AssignmentGateCheck_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMassRecord" ADD CONSTRAINT "TripMassRecord_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripMassRecord" ADD CONSTRAINT "TripMassRecord_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDutyRecord" ADD CONSTRAINT "DriverDutyRecord_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "IncidentCategory"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Incident" ADD CONSTRAINT "Incident_statusId_fkey" FOREIGN KEY ("statusId") REFERENCES "IncidentStatus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncidentPhoto" ADD CONSTRAINT "IncidentPhoto_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CorrectiveAction" ADD CONSTRAINT "CorrectiveAction_incidentId_fkey" FOREIGN KEY ("incidentId") REFERENCES "Incident"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Fine" ADD CONSTRAINT "Fine_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedEvent" ADD CONSTRAINT "SpeedEvent_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "Asset"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedEvent" ADD CONSTRAINT "SpeedEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpeedEvent" ADD CONSTRAINT "SpeedEvent_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "Assignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "Policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyAcknowledgement" ADD CONSTRAINT "PolicyAcknowledgement_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

