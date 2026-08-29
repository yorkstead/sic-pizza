import { z } from "zod";
import { orderStatusSchema, type OrderStatus } from "./types";
import { calculateItemTotalCents, type OrderItem } from "./item";

export const orderSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  status: orderStatusSchema.default("draft"),
  items: z.array(z.custom<OrderItem>()).default([]),
  subtotalCents: z.number().int().nonnegative().default(0),
  taxCents: z.number().int().nonnegative().default(0),
  totalCents: z.number().int().nonnegative().default(0),
  version: z.number().int().positive().default(1)
});

export type Order = z.infer<typeof orderSchema>;

const validOrderTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ["submitted"],
  submitted: ["making"],
  making: ["ready"],
  ready: ["served"],
  served: ["paid"],
  paid: []
};

export function transitionOrderStatus(from: OrderStatus, to: OrderStatus): OrderStatus {
  const allowed = validOrderTransitions[from] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Invalid order status transition: ${from} → ${to}`);
  }
  return to;
}

export function calculateOrderTotals(
  items: readonly OrderItem[],
  taxRatePercent = 8.25
): {
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
} {
  // Only billable/confirmed items count toward totals
  const billableItems = items.filter(
    (item) => item.status !== "voided" && item.status !== "proposed"
  );
  const subtotalCents = billableItems.reduce(
    (acc, item) => acc + calculateItemTotalCents(item),
    0
  );
  const taxCents = Math.round((subtotalCents * taxRatePercent) / 100);
  const totalCents = subtotalCents + taxCents;

  return { subtotalCents, taxCents, totalCents };
}

export function calculateEqualSplit(
  totalCents: number,
  dinerCount: number
): { splitCents: number; remainderCents: number } {
  if (dinerCount <= 0) throw new Error("Diner count must be at least 1");
  if (totalCents < 0) throw new Error("Total cents cannot be negative");

  const splitCents = Math.floor(totalCents / dinerCount);
  const remainderCents = totalCents % dinerCount;

  return { splitCents, remainderCents };
}
