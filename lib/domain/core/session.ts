import { z } from "zod";

export const serviceTaskTypeSchema = z.enum([
  "water_refill",
  "call_server",
  "condiments",
  "drop_check",
  "spill_cleanup",
  "custom"
]);
export type ServiceTaskType = z.infer<typeof serviceTaskTypeSchema>;

export const serviceTaskStatusSchema = z.enum(["pending", "claimed", "completed", "cancelled"]);
export type ServiceTaskStatus = z.infer<typeof serviceTaskStatusSchema>;

export const serviceTaskSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  tableId: z.string(),
  type: serviceTaskTypeSchema,
  status: serviceTaskStatusSchema.default("pending"),
  requestedByDinerId: z.string().optional(),
  claimedByEmployeeId: z.string().optional(),
  notes: z.string().max(200).optional(),
  createdAt: z.string(),
  completedAt: z.string().optional()
});
export type ServiceTask = z.infer<typeof serviceTaskSchema>;

export const dinerSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  displayName: z.string().min(1).max(50),
  seatNumber: z.number().int().positive().optional(),
  isGuestUser: z.boolean().default(true),
  joinedAt: z.string()
});
export type Diner = z.infer<typeof dinerSchema>;

export const tableSessionSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  tableId: z.string(),
  tableLabel: z.string(),
  openedByEmployeeId: z.string(),
  assignedServerId: z.string().optional(),
  joinTokenHash: z.string(),
  diners: z.array(dinerSchema).default([]),
  tasks: z.array(serviceTaskSchema).default([]),
  openedAt: z.string(),
  closedAt: z.string().optional(),
  status: z.enum(["open", "check_requested", "closed"]).default("open")
});
export type TableSession = z.infer<typeof tableSessionSchema>;
