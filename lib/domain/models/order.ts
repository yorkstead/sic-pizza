import { z } from "zod";
import { courseSchema } from "./menu";

export const itemStatusSchema = z.enum([
  "draft",
  "proposed",
  "confirmed",
  "held",
  "fired",
  "preparing",
  "ready",
  "delivered",
  "voided"
]);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const splitModeSchema = z.enum(["single", "shared_diners", "whole_table"]);
export type SplitMode = z.infer<typeof splitModeSchema>;

export const selectedModifierSchema = z.object({
  modifierOptionId: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative().default(0)
});
export type SelectedModifier = z.infer<typeof selectedModifierSchema>;

export const orderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  sessionId: z.string(),
  menuItemId: z.string(),
  name: z.string(),
  course: courseSchema.default("mains"),
  stationId: z.string().default("kitchen"),
  status: itemStatusSchema.default("draft"),
  quantity: z.number().int().positive().default(1),
  basePriceCents: z.number().int().nonnegative(),
  selectedModifiers: z.array(selectedModifierSchema).default([]),
  specialInstructions: z.string().max(280).optional(),
  dinerId: z.string().optional(),
  seatNumber: z.number().int().optional(),
  splitMode: splitModeSchema.default("single"),
  assignedDinerIds: z.array(z.string()).default([]),
  customShares: z.record(z.string(), z.number().nonnegative()).optional(),
  proposedByDinerId: z.string().optional(),
  confirmedByEmployeeId: z.string().optional(),
  voidReason: z.string().optional(),
  voidedByEmployeeId: z.string().optional(),
  createdAt: z.string()
});
export type OrderItem = z.infer<typeof orderItemSchema>;

export const orderSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  items: z.array(orderItemSchema).default([]),
  subtotalCents: z.number().int().nonnegative().default(0),
  taxCents: z.number().int().nonnegative().default(0),
  totalCents: z.number().int().nonnegative().default(0),
  createdAt: z.string()
});
export type Order = z.infer<typeof orderSchema>;

export function calculateOrderItemUnitCents(
  basePriceCents: number,
  modifiers: readonly SelectedModifier[]
): number {
  const modSum = modifiers.reduce((acc, m) => acc + m.priceCents, 0);
  return basePriceCents + modSum;
}

export function calculateOrderItemTotalCents(item: {
  basePriceCents: number;
  selectedModifiers: readonly SelectedModifier[];
  quantity: number;
}): number {
  return calculateOrderItemUnitCents(item.basePriceCents, item.selectedModifiers) * item.quantity;
}
