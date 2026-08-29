import { z } from "zod";
import { courseTypeSchema, itemStatusSchema } from "./types";

export const itemModifierSchema = z.object({
  id: z.string(),
  name: z.string(),
  priceCents: z.number().int().nonnegative(),
  category: z.string().optional()
});
export type ItemModifier = z.infer<typeof itemModifierSchema>;

export const orderItemSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  dinerId: z.string().optional(),
  menuItemId: z.string(),
  name: z.string(),
  course: courseTypeSchema.default("mains"),
  stationId: z.string().default("kitchen"),
  status: itemStatusSchema.default("draft"),
  quantity: z.number().int().positive().default(1),
  basePriceCents: z.number().int().nonnegative(),
  modifiers: z.array(itemModifierSchema).default([]),
  specialInstructions: z.string().max(280).optional(),
  confirmedByEmployeeId: z.string().optional(),
  proposedByDinerId: z.string().optional(),
  createdAt: z.string()
});

export type OrderItem = z.infer<typeof orderItemSchema>;

export function calculateItemUnitPrice(
  basePriceCents: number,
  modifiers: readonly ItemModifier[]
): number {
  if (basePriceCents < 0) throw new Error("Base price cannot be negative");
  const modifierSum = modifiers.reduce((acc, mod) => {
    if (mod.priceCents < 0) throw new Error("Modifier price cannot be negative");
    return acc + mod.priceCents;
  }, 0);
  return basePriceCents + modifierSum;
}

export function calculateItemTotalCents(item: {
  basePriceCents: number;
  modifiers: readonly ItemModifier[];
  quantity: number;
}): number {
  const unit = calculateItemUnitPrice(item.basePriceCents, item.modifiers);
  return unit * item.quantity;
}
