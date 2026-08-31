import { z } from 'zod';

const dateReq = z.string().datetime().transform((v) => new Date(v));
const dateOpt = z
  .string().datetime().nullable().optional()
  .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v)));
const nullableString = (max: number) => z.string().max(max).nullable().optional();

export const AssignmentCreateSchema = z.object({
  dealId: z.string().nullable().optional(),
  assetId: z.string().min(1),
  driverId: z.string().min(1),
  carrierId: z.string().nullable().optional(),
  originLocationId: z.string().nullable().optional(),
  destinationLocationId: z.string().nullable().optional(),
  routeRiskAssessmentId: z.string().nullable().optional(),
  plannedDepartureAt: dateOpt,
  plannedArrivalAt: dateOpt,
  distanceKm: z.number().int().min(0).max(100_000).nullable().optional(),
  legs: z
    .array(
      z.object({
        sequence: z.number().int().min(1),
        fromLocationId: z.string().nullable().optional(),
        toLocationId: z.string().nullable().optional(),
        plannedAt: dateOpt,
        distanceKm: z.number().int().min(0).nullable().optional(),
        notes: nullableString(500),
      }),
    )
    .optional(),
});

export const AssignmentUpdateSchema = AssignmentCreateSchema.partial().omit({ legs: true });

export const StartTripSchema = z.object({
  // ADMIN only, and only meaningful when the gate has actually failed.
  overrideReason: z.string().min(10).max(1000).optional(),
});

export const PodCaptureSchema = z.object({
  receivedByName: z.string().min(1).max(120),
  signatureFileId: z.string().nullable().optional(),
  photoFileIds: z.array(z.string()).max(20).optional(),
  notes: nullableString(2000),
  actualArrivalAt: dateOpt,
});

export const MassRecordSchema = z.object({
  massLoadedKg: z.number().int().min(0).max(500_000),
  measuredAt: dateOpt,
  weighbridgeRef: nullableString(60),
  documentFileId: z.string().nullable().optional(),
  notes: nullableString(500),
});

export const IncidentCreateSchema = z.object({
  occurredAt: dateReq,
  assetId: z.string().nullable().optional(),
  driverId: z.string().nullable().optional(),
  assignmentId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  locationText: nullableString(200),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  description: z.string().min(1).max(8000),
  injuries: z.number().int().min(0).max(1000).optional(),
  vehicleDamage: z.boolean().optional(),
  thirdPartyInvolved: z.boolean().optional(),
  estimatedCost: z.number().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  photoFileIds: z.array(z.string()).max(20).optional(),
});

export const IncidentInvestigationSchema = z.object({
  immediateCause: nullableString(2000),
  underlyingCause: nullableString(2000),
  systemicCause: nullableString(2000),
  statusCode: z.enum(['REPORTED', 'INVESTIGATING', 'ACTIONS_OPEN', 'CLOSED']).optional(),
  note: nullableString(2000),
});

export const CorrectiveActionSchema = z.object({
  description: z.string().min(1).max(2000),
  ownerUserId: z.string().nullable().optional(),
  dueDate: dateOpt,
  notes: nullableString(1000),
});

export const CorrectiveActionUpdateSchema = z.object({
  status: z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'VERIFIED']).optional(),
  description: z.string().min(1).max(2000).optional(),
  ownerUserId: z.string().nullable().optional(),
  dueDate: dateOpt,
  notes: nullableString(1000),
});

export const FineSchema = z.object({
  noticeNumber: nullableString(60),
  issuedOn: dateReq,
  assetId: z.string().nullable().optional(),
  driverId: z.string().nullable().optional(),
  assignmentId: z.string().nullable().optional(),
  reason: z.string().min(1).max(500),
  amount: z.number().min(0),
  currency: z.string().length(3).optional(),
  dueDate: dateOpt,
  paidOn: dateOpt,
  status: z.enum(['UNPAID', 'PAID', 'CONTESTED', 'WRITTEN_OFF']).optional(),
  correctiveAction: nullableString(1000),
  documentFileId: z.string().nullable().optional(),
});

export const SpeedEventSchema = z.object({
  assetId: z.string().min(1),
  driverId: z.string().nullable().optional(),
  assignmentId: z.string().nullable().optional(),
  occurredAt: dateReq,
  speedKph: z.number().int().min(0).max(300),
  limitKph: z.number().int().min(0).max(300),
  locationText: nullableString(200),
  source: nullableString(40),
  actionTaken: nullableString(1000),
});
