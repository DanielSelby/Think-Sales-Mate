import { z } from "zod";

const serviceJobStatuses = [
  "received",
  "inspection",
  "awaiting_quotation",
  "awaiting_customer_approval",
  "approved",
  "rejected",
  "in_progress",
  "awaiting_parts",
  "quality_check",
  "ready_for_collection",
  "awaiting_payment",
  "completed",
  "closed",
  "cancelled",
] as const;

const serviceRepairPortalViewSchema = z.object({
  jobNumber: z.string(),
  jobStatus: z.enum(serviceJobStatuses),
  statusHistory: z.array(z.object({
    status: z.enum(serviceJobStatuses),
    occurredAt: z.string().datetime({ offset: true }),
  }).strict()).max(50),
  reportedProblem: z.string(),
  currency: z.string(),
  equipment: z.object({
    type: z.string(),
    brand: z.string().nullable(),
    model: z.string().nullable(),
  }).strict().nullable(),
  quotation: z.object({
    version: z.number(),
    status: z.enum(["sent", "approved", "rejected"]),
    notes: z.string().nullable(),
    subtotal: z.number(),
    taxRate: z.number(),
    taxAmount: z.number(),
    total: z.number(),
    items: z.array(z.object({
      description: z.string(),
      quantity: z.number(),
      unitPrice: z.number(),
      lineTotal: z.number(),
    }).strict()),
  }).strict(),
  expiresAt: z.string(),
  canRespond: z.boolean(),
}).strict();

export type ServiceRepairPortalView = z.infer<typeof serviceRepairPortalViewSchema>;

export function parseServiceRepairPortalView(value: unknown): ServiceRepairPortalView | null {
  const result = serviceRepairPortalViewSchema.safeParse(value);
  return result.success ? result.data : null;
}
