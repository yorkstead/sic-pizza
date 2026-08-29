import { z } from "zod";

export const checkStatusSchema = z.enum(["open", "presented", "settling", "closed"]);
export type CheckStatus = z.infer<typeof checkStatusSchema>;

export const checkItemAllocationSchema = z.object({
  orderItemId: z.string(),
  name: z.string(),
  cents: z.number().int().nonnegative(),
  dinerId: z.string().optional()
});
export type CheckItemAllocation = z.infer<typeof checkItemAllocationSchema>;

export const checkSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  title: z.string(), // e.g. "Check #1 · Full Table" or "Check #2 · Alex"
  dinerIds: z.array(z.string()).default([]),
  items: z.array(checkItemAllocationSchema).default([]),
  subtotalCents: z.number().int().nonnegative().default(0),
  taxCents: z.number().int().nonnegative().default(0),
  tipCents: z.number().int().nonnegative().default(0),
  totalCents: z.number().int().nonnegative().default(0),
  paidCents: z.number().int().nonnegative().default(0),
  balanceCents: z.number().int().nonnegative().default(0),
  status: checkStatusSchema.default("open"),
  createdAt: z.string(),
  closedAt: z.string().optional()
});
export type Check = z.infer<typeof checkSchema>;

export const paymentMethodSchema = z.enum(["card", "cash", "gift_card", "custom"]);
export type PaymentMethod = z.infer<typeof paymentMethodSchema>;

export const paymentStatusSchema = z.enum([
  "pending",
  "authorized",
  "captured",
  "failed",
  "refunded"
]);
export type PaymentStatus = z.infer<typeof paymentStatusSchema>;

export const paymentSchema = z.object({
  id: z.string(),
  checkId: z.string(),
  sessionId: z.string(),
  amountCents: z.number().int().positive(),
  tipCents: z.number().int().nonnegative().default(0),
  method: paymentMethodSchema.default("card"),
  provider: z.string().default("mock_gateway"),
  providerReference: z.string().optional(),
  status: paymentStatusSchema.default("authorized"),
  actorType: z.enum(["employee", "guest", "system"]).default("guest"),
  actorId: z.string().optional(),
  createdAt: z.string()
});
export type Payment = z.infer<typeof paymentSchema>;
