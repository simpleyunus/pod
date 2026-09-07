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

// R3 Trip Mass Record. The form's single "Mass Loaded/Passengers Loaded"
// column means a trip carries one or the other, so at least one is required.
export const MassRecordSchema = z
  .object({
    date: dateOpt,
    massLoadedKg: z.number().int().min(0).max(500_000).nullable().optional(),
    passengersLoaded: z.number().int().min(0).max(200).nullable().optional(),
    documentFileId: z.string().nullable().optional(),
    comments: nullableString(500),
  })
  .refine((v) => v.massLoadedKg != null || v.passengersLoaded != null, {
    message: 'Record either a mass loaded or a passenger count',
  });

// R8 Accident Investigation Register + P3 categorisation.
export const IncidentCreateSchema = z.object({
  date: dateReq, // R8 "Date"
  assetId: z.string().nullable().optional(), // R8 "Vehicle Reg. No."
  driverId: z.string().nullable().optional(), // R8 "Driver Name"
  assignmentId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  severityId: z.string().nullable().optional(), // P3 severity
  faultCategory: z.enum(['DRIVER_FAULT', 'THIRD_PARTY_FAULT', 'SHARED', 'UNDETERMINED']).nullable().optional(),
  description: z.string().min(1).max(8000), // R8 "Description of Incident/Accident"
  cause: nullableString(4000), // R8 "Cause of the incident/accident"
  isNearMiss: z.boolean().optional(), // manual 4.8
  locationText: nullableString(200),
  injuries: z.number().int().min(0).max(1000).optional(),
  vehicleDamage: z.boolean().optional(),
  thirdPartyInvolved: z.boolean().optional(),
  sapsReportNumber: nullableString(60), // P3: report within 24h
  sapsReportedAt: dateOpt,
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

// R10 Traffic Fine Register — the form has no amount or payment column.
export const FineSchema = z.object({
  date: dateReq, // R10 "Date"
  assetId: z.string().nullable().optional(), // R10 "Vehicle Reg. No."
  driverId: z.string().nullable().optional(), // R10 "Driver Name"
  assignmentId: z.string().nullable().optional(),
  reason: z.string().min(1).max(500), // R10 "What is the reason for the traffic fine"
  correctiveActionsTaken: nullableString(1000), // R10 "Corrective actions taken"
  noticeNumber: nullableString(60),
  documentFileId: z.string().nullable().optional(),
});

// R7 Speed Trend Analysis Report — descriptive, not a telematics reading.
export const SpeedTrendSchema = z.object({
  date: dateReq, // R7 "DATE"
  driverId: z.string().nullable().optional(), // R7 "DRIVER"
  assetId: z.string().min(1), // R7 "VEHICLE REG"
  assignmentId: z.string().nullable().optional(),
  speedTrend: z.string().min(1).max(2000), // R7 "DESCRIBE SPEED TREND"
  actionsTaken: nullableString(2000), // R7 "ACTIONS TAKEN"
});
