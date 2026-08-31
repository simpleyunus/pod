import { z } from 'zod';

// Zod parsed in the controller, matching how DealsController validates.
const nullableString = (max: number) => z.string().max(max).nullable().optional();
const dateish = z
  .string()
  .datetime()
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v)));

export const AssetCreateSchema = z.object({
  code: z.string().min(1).max(30),
  registrationNo: z.string().min(1).max(20),
  vin: nullableString(30),
  typeId: z.string().min(1),
  make: nullableString(40),
  model: nullableString(60),
  year: z.number().int().min(1970).max(2100).nullable().optional(),
  tareMassKg: z.number().int().min(0).max(200_000).nullable().optional(),
  maxMassKg: z.number().int().min(1).max(200_000),
  maxCombinationMassKg: z.number().int().min(1).max(400_000).nullable().optional(),
  odometerKm: z.number().int().min(0).optional(),
  notes: nullableString(1000),
});
export const AssetUpdateSchema = AssetCreateSchema.partial().extend({
  active: z.boolean().optional(),
  retiredAt: dateish,
});

export const DriverCreateSchema = z.object({
  code: z.string().min(1).max(30),
  fullName: z.string().min(1).max(120),
  phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/, 'Phone must be E.164, e.g. +27821234567').nullable().optional(),
  email: z.string().email().max(120).nullable().optional(),
  dateOfBirth: dateish,
  userId: nullableString(40),
  hiredOn: dateish,
  notes: nullableString(1000),
});
export const DriverUpdateSchema = DriverCreateSchema.partial().extend({
  active: z.boolean().optional(),
});

export const CarrierCreateSchema = z.object({
  name: z.string().min(1).max(120),
  contactName: nullableString(120),
  phoneE164: z.string().regex(/^\+[1-9]\d{6,14}$/).nullable().optional(),
  email: z.string().email().max(120).nullable().optional(),
  fleetSize: z.number().int().min(0).max(100_000).nullable().optional(),
  routes: nullableString(500),
  ratePerKm: z.number().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  complianceNotes: nullableString(1000),
  notes: nullableString(1000),
});
export const CarrierUpdateSchema = CarrierCreateSchema.partial().extend({
  active: z.boolean().optional(),
});

export const TyreRecordSchema = z.object({
  assetId: z.string().min(1),
  position: z.string().min(1).max(10),
  action: z.enum(['FITTED', 'ROTATED', 'REPAIRED', 'REPLACED', 'SCRAPPED']),
  brand: nullableString(40),
  size: nullableString(30),
  serialNo: nullableString(40),
  treadDepthMm: z.number().min(0).max(50).nullable().optional(),
  fittedOn: dateish,
  fittedOdoKm: z.number().int().min(0).nullable().optional(),
  removedOn: dateish,
  removedOdoKm: z.number().int().min(0).nullable().optional(),
  cost: z.number().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  notes: nullableString(500),
});

export const OdometerSchema = z.object({
  odometerKm: z.number().int().min(0).max(10_000_000),
});

// Admin-editable lookups (mirrors how DealStatus/Location are maintained).
export const LookupUpsertSchema = z.object({
  code: z.string().min(1).max(40).optional(),
  name: z.string().min(1).max(120).optional(),
  label: z.string().min(1).max(120).optional(),
  category: nullableString(60),
  sortOrder: z.number().int().min(0).max(999).optional(),
  active: z.boolean().optional(),
  isTerminal: z.boolean().optional(),
  isTrailer: z.boolean().optional(),
  critical: z.boolean().optional(),
  ownerType: z.enum(['ASSET', 'DRIVER']).optional(),
  leadDaysDueSoon: z.number().int().min(0).max(365).optional(),
  requiredForOperation: z.boolean().optional(),
  rtmsElement: z
    .enum([
      'MANAGEMENT_COMMITMENT', 'RISK_MANAGEMENT', 'VEHICLE_FITNESS', 'DRIVER_WELLNESS',
      'LOAD_MANAGEMENT', 'JOURNEY_MANAGEMENT', 'INCIDENT_MANAGEMENT', 'MONITORING_REVIEW',
    ])
    .nullable()
    .optional(),
});
