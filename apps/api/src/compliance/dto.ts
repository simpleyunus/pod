import { z } from 'zod';

const dateReq = z.string().datetime().transform((v) => new Date(v));
const dateOpt = z
  .string()
  .datetime()
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v)));
const nullableString = (max: number) => z.string().max(max).nullable().optional();

export const ComplianceItemCreateSchema = z
  .object({
    assetId: z.string().nullable().optional(),
    driverId: z.string().nullable().optional(),
    kindId: z.string().min(1),
    reference: nullableString(60),
    issuedOn: dateOpt,
    expiresOn: dateOpt,
    documentFileId: z.string().nullable().optional(),
    notes: nullableString(1000),
  })
  // The schema keeps ownerType + both FKs; this is what stops a row from
  // claiming to belong to an asset AND a driver.
  .refine((v) => !!v.assetId !== !!v.driverId, {
    message: 'Exactly one of assetId or driverId must be set',
  });

export const ComplianceItemUpdateSchema = z.object({
  reference: nullableString(60),
  issuedOn: dateOpt,
  expiresOn: dateOpt,
  documentFileId: z.string().nullable().optional(),
  notes: nullableString(1000),
});

export const ComplianceItemRenewSchema = z.object({
  reference: z.string().max(60).optional(),
  issuedOn: z.string().datetime().optional().transform((v) => (v ? new Date(v) : undefined)),
  expiresOn: dateReq,
  documentFileId: z.string().optional(),
});

export const PolicySchema = z.object({
  code: z.string().min(1).max(40),
  title: z.string().min(1).max(150),
  body: z.string().min(1).max(50_000),
  effectiveFrom: dateOpt,
  rtmsElement: z
    .enum(['MANAGEMENT_COMMITMENT', 'RISK_MANAGEMENT', 'VEHICLE_FITNESS', 'DRIVER_WELLNESS',
           'LOAD_MANAGEMENT', 'JOURNEY_MANAGEMENT', 'INCIDENT_MANAGEMENT', 'MONITORING_REVIEW'])
    .nullable().optional(),
  documentFileId: z.string().nullable().optional(),
});

export const PolicyAckSchema = z.object({
  driverId: z.string().nullable().optional(),
  userId: z.string().nullable().optional(),
  signatureFileId: z.string().nullable().optional(),
});

export const SafetyObjectiveSchema = z.object({
  title: z.string().min(1).max(150),
  metric: z.string().min(1).max(40),
  targetValue: z.number(),
  unit: nullableString(20),
  periodStart: dateReq,
  periodEnd: dateReq,
  rtmsElement: z
    .enum(['MANAGEMENT_COMMITMENT', 'RISK_MANAGEMENT', 'VEHICLE_FITNESS', 'DRIVER_WELLNESS',
           'LOAD_MANAGEMENT', 'JOURNEY_MANAGEMENT', 'INCIDENT_MANAGEMENT', 'MONITORING_REVIEW'])
    .nullable().optional(),
  notes: nullableString(1000),
});

export const HazardSchema = z.object({
  description: z.string().min(1).max(1000),
  likelihood: z.number().int().min(1).max(5),
  severity: z.number().int().min(1).max(5),
  controls: z.string().min(1).max(2000),
  residualLikelihood: z.number().int().min(1).max(5).nullable().optional(),
  residualSeverity: z.number().int().min(1).max(5).nullable().optional(),
  ownerUserId: z.string().nullable().optional(),
});

export const RiskAssessmentSchema = z.object({
  title: z.string().min(1).max(150),
  scope: nullableString(1000),
  rtmsElement: z
    .enum(['MANAGEMENT_COMMITMENT', 'RISK_MANAGEMENT', 'VEHICLE_FITNESS', 'DRIVER_WELLNESS',
           'LOAD_MANAGEMENT', 'JOURNEY_MANAGEMENT', 'INCIDENT_MANAGEMENT', 'MONITORING_REVIEW'])
    .nullable().optional(),
  assessedOn: dateReq,
  reviewDueOn: dateOpt,
  hazards: z.array(HazardSchema).optional(),
});

export const RouteRiskAssessmentSchema = z.object({
  name: z.string().min(1).max(150),
  originLocationId: z.string().nullable().optional(),
  destinationLocationId: z.string().nullable().optional(),
  description: nullableString(2000),
  distanceKm: z.number().int().min(0).max(100_000).nullable().optional(),
  reviewDueOn: dateOpt,
  riskAssessmentId: z.string().nullable().optional(),
});

export const RouteAckSchema = z.object({
  driverId: z.string().min(1),
  signatureFileId: z.string().nullable().optional(),
});

export const DutyRecordSchema = z.object({
  driverId: z.string().min(1),
  assignmentId: z.string().nullable().optional(),
  onDutyAt: dateReq,
  offDutyAt: dateOpt,
  drivingMinutes: z.number().int().min(0).max(1440).optional(),
  breakMinutes: z.number().int().min(0).max(1440).optional(),
  notes: nullableString(500),
});

// Manual 4.14 / module M1.
export const TrainingRecordSchema = z.object({
  courseId: z.string().min(1),
  driverId: z.string().min(1),
  completedOn: dateReq,
  trainerName: nullableString(120),
  outcome: nullableString(200),
  certificateFileId: z.string().nullable().optional(),
  notes: nullableString(1000),
});

// Internal audit (element 8).
export const AuditSchema = z.object({
  scheduledFor: dateReq,
  conductedOn: dateOpt,
  auditorName: nullableString(120),
  scope: nullableString(2000),
  summary: nullableString(4000),
});

export const AuditFindingSchema = z.object({
  rtmsElement: z.enum([
    'MANAGEMENT_COMMITMENT', 'RISK_MANAGEMENT', 'VEHICLE_FITNESS', 'DRIVER_WELLNESS',
    'LOAD_MANAGEMENT', 'JOURNEY_MANAGEMENT', 'INCIDENT_MANAGEMENT', 'MONITORING_REVIEW',
  ]),
  conformity: z.enum(['CONFORMS', 'MINOR_NON_CONFORMANCE', 'MAJOR_NON_CONFORMANCE', 'OBSERVATION']),
  description: z.string().min(1).max(4000),
  evidence: nullableString(2000),
});

// R9 Corrective Action Register — shared across incident, audit, fine and
// fatigue sources.
export const CorrectiveActionCreateSchema = z
  .object({
    sourceType: z.enum(['INCIDENT', 'AUDIT_FINDING', 'FINE', 'FATIGUE_BREACH', 'INSPECTION', 'OTHER']),
    incidentId: z.string().nullable().optional(),
    auditFindingId: z.string().nullable().optional(),
    fineId: z.string().nullable().optional(),
    inspectionId: z.string().nullable().optional(),
    driverId: z.string().nullable().optional(),
    description: z.string().min(1).max(2000),
    ownerUserId: z.string().nullable().optional(),
    dueDate: dateOpt,
    notes: nullableString(1000),
  })
  .refine(
    (v) =>
      v.sourceType !== 'INCIDENT' ? true : !!v.incidentId,
    { message: 'An INCIDENT action must reference an incident' },
  );
