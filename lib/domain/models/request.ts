import { z } from "zod";

export const requestTypeSchema = z.enum([
  "water_refill",
  "call_server",
  "condiments",
  "drop_check",
  "spill_cleanup",
  "cutlery",
  "custom"
]);
export type RequestType = z.infer<typeof requestTypeSchema>;

export const requestStatusSchema = z.enum(["pending", "acknowledged", "completed", "cancelled"]);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const guestRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  tableId: z.string(),
  tableLabel: z.string(),
  dinerId: z.string().optional(),
  dinerName: z.string().optional(),
  type: requestTypeSchema,
  status: requestStatusSchema.default("pending"),
  notes: z.string().max(200).optional(),
  requestedAt: z.string(),
  acknowledgedAt: z.string().optional(),
  acknowledgedByEmployeeId: z.string().optional(),
  completedAt: z.string().optional(),
  completedByEmployeeId: z.string().optional()
});
export type GuestRequest = z.infer<typeof guestRequestSchema>;
