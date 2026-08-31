import { z } from 'zod';

const dateOpt = z
  .string().datetime().nullable().optional()
  .transform((v) => (v === undefined ? undefined : v === null ? null : new Date(v)));
const nullableString = (max: number) => z.string().max(max).nullable().optional();

export const MaintenancePlanSchema = z
  .object({
    assetId: z.string().min(1),
    name: z.string().min(1).max(80).optional(),
    intervalKm: z.number().int().min(100).max(500_000).nullable().optional(),
    intervalMonths: z.number().int().min(1).max(120).nullable().optional(),
    lastServiceOdoKm: z.number().int().min(0).nullable().optional(),
    lastServiceDate: dateOpt,
  })
  .refine((v) => v.intervalKm != null || v.intervalMonths != null, {
    message: 'A plan needs an interval in km, in months, or both',
  });

export const MaintenancePlanUpdateSchema = MaintenancePlanSchema.innerType()
  .partial()
  .extend({ active: z.boolean().optional() });

export const WorkOrderCreateSchema = z.object({
  assetId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: nullableString(4000),
  odometerKm: z.number().int().min(0).nullable().optional(),
  supplier: nullableString(120),
  partsCost: z.number().min(0).nullable().optional(),
  labourCost: z.number().min(0).nullable().optional(),
  currency: z.string().length(3).optional(),
  documentFileId: z.string().nullable().optional(),
});

export const WorkOrderUpdateSchema = WorkOrderCreateSchema.partial().omit({ assetId: true });

export const WorkOrderTransitionSchema = z.object({
  statusCode: z.enum(['REQUESTED', 'APPROVED', 'IN_PROGRESS', 'AWAITING_PARTS', 'DONE', 'CLOSED']),
  note: nullableString(1000),
  completedOdometerKm: z.number().int().min(0).nullable().optional(),
  partsCost: z.number().min(0).nullable().optional(),
  labourCost: z.number().min(0).nullable().optional(),
});

export const InspectionCreateSchema = z.object({
  assetId: z.string().min(1),
  driverId: z.string().nullable().optional(),
  assignmentId: z.string().nullable().optional(),
  odometerKm: z.number().int().min(0).nullable().optional(),
  notes: nullableString(2000),
  signatureFileId: z.string().nullable().optional(),
  results: z
    .array(
      z.object({
        itemId: z.string().min(1),
        outcome: z.enum(['PASS', 'FAIL', 'NA']),
        note: nullableString(500),
        photoFileId: z.string().nullable().optional(),
        raiseWorkOrder: z.boolean().optional(),
      }),
    )
    .min(1),
});
