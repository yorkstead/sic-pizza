import { z } from "zod";
import { orderItemSchema, type OrderItem } from "./order";
import { guestRequestSchema, type GuestRequest } from "./request";
import { kitchenTicketSchema, type KitchenTicket } from "./kitchen";
import { checkSchema, paymentSchema, type Check, type Payment } from "./payment";
import { domainEventSchema } from "./events";
import {
  deriveTableBillSummary,
  type TableBillSummary,
  type DinerBillProjection,
  type SharedItemBreakdown
} from "./allocation";

export const diningStageSchema = z.enum([
  "SEATED",
  "DRINKS",
  "ORDERING",
  "APPETIZERS",
  "ENTREES",
  "DESSERT",
  "CHECK_REQUESTED",
  "PAYING",
  "CLOSED"
]);
export type DiningStage = z.infer<typeof diningStageSchema>;

export const kitchenProgressSummarySchema = z.enum([
  "not_ordered",
  "queued",
  "preparing",
  "ready_for_runner",
  "all_delivered"
]);
export type KitchenProgressSummary = z.infer<typeof kitchenProgressSummarySchema>;

export const paymentStateSummarySchema = z.enum([
  "unbilled",
  "split_pending",
  "partially_paid",
  "fully_paid"
]);
export type PaymentStateSummary = z.infer<typeof paymentStateSummarySchema>;

export const attentionUrgencySchema = z.enum([
  "urgent_guest_request",
  "kitchen_delayed",
  "check_requested",
  "idle_attention_needed",
  "ready_to_clear",
  "normal"
]);
export type AttentionUrgency = z.infer<typeof attentionUrgencySchema>;

export const dinerSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  displayName: z.string().min(1),
  seatNumber: z.number().int().positive().optional(),
  isGuestUser: z.boolean().default(true),
  joinedAt: z.string()
});
export type Diner = z.infer<typeof dinerSchema>;

export const tableSessionSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  locationId: z.string(),
  tableId: z.string(),
  tableLabel: z.string(),
  diningAreaId: z.string(),
  servicePeriodId: z.string().optional(),
  openedByEmployeeId: z.string(),
  assignedServerId: z.string().optional(),
  assistingEmployeeIds: z.array(z.string()).default([]),
  joinTokenHash: z.string(),
  manualStageOverride: diningStageSchema.optional(),
  openedAt: z.string(),
  closedAt: z.string().optional(),
  diners: z.array(dinerSchema).default([]),
  items: z.array(orderItemSchema).default([]),
  tickets: z.array(kitchenTicketSchema).default([]),
  requests: z.array(guestRequestSchema).default([]),
  checks: z.array(checkSchema).default([]),
  payments: z.array(paymentSchema).default([]),
  events: z.array(domainEventSchema).default([]),
  version: z.number().int().nonnegative().default(1),
  executedIdempotencyKeys: z.record(z.string(), z.any()).default({})
});
export type TableSession = z.infer<typeof tableSessionSchema>;

export interface TableSessionProjection {
  id: string;
  tableId: string;
  tableLabel: string;
  stage: DiningStage;
  assignedServerId?: string;
  diners: readonly Diner[];
  seatCount: number;
  elapsedMinutes: number;
  activeItems: readonly OrderItem[];
  kitchenProgress: KitchenProgressSummary;
  openRequests: readonly GuestRequest[];
  subtotalCents: number;
  individualSubtotalCents: number;
  sharedSubtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  unpaidBalanceCents: number;
  paymentState: PaymentStateSummary;
  dinerBills: DinerBillProjection[];
  sharedItems: SharedItemBreakdown[];
  tableSummary: TableBillSummary;
  operationalAttention: {
    urgency: AttentionUrgency;
    reasons: string[];
    isAttentionRequired: boolean;
  };
}

export function deriveElapsedMinutes(openedAt: string, closedAt?: string, now = new Date()): number {
  const start = new Date(openedAt).getTime();
  const end = closedAt ? new Date(closedAt).getTime() : now.getTime();
  return Math.max(0, Math.floor((end - start) / 60000));
}

export function deriveKitchenProgress(tickets: readonly KitchenTicket[], items: readonly OrderItem[]): KitchenProgressSummary {
  const activeItems = items.filter((i) => i.status !== "voided");
  if (activeItems.length === 0) return "not_ordered";

  const allTickets = tickets.filter((t) => t.status !== "cancelled");
  if (allTickets.length === 0) {
    if (activeItems.some((i) => i.status === "confirmed" || i.status === "fired")) return "queued";
    return "not_ordered";
  }

  if (allTickets.some((t) => t.status === "ready")) return "ready_for_runner";
  if (allTickets.some((t) => t.status === "in_prep" || t.status === "accepted")) return "preparing";
  if (allTickets.every((t) => t.status === "delivered")) return "all_delivered";
  return "queued";
}

export function deriveFinancials(
  items: readonly OrderItem[],
  payments: readonly Payment[],
  taxRatePercent = 8.25
) {
  // Delegate to deterministic allocation summary engine for consistency
  const dummySession: TableSession = {
    id: "dummy",
    restaurantId: "dummy",
    locationId: "dummy",
    tableId: "dummy",
    tableLabel: "dummy",
    diningAreaId: "dummy",
    openedByEmployeeId: "dummy",
    assistingEmployeeIds: [],
    joinTokenHash: "dummy",
    openedAt: new Date().toISOString(),
    diners: [],
    items: [...items],
    tickets: [],
    requests: [],
    checks: [],
    payments: [...payments],
    events: [],
    version: 1,
    executedIdempotencyKeys: {}
  };

  const summary = deriveTableBillSummary(dummySession, taxRatePercent);
  return {
    subtotalCents: summary.subtotalCents,
    individualSubtotalCents: summary.individualSubtotalCents,
    sharedSubtotalCents: summary.sharedSubtotalCents,
    taxCents: summary.taxCents,
    discountCents: summary.discountCents,
    totalCents: summary.totalCents,
    paidCents: summary.paidCents,
    unpaidBalanceCents: summary.unpaidBalanceCents
  };
}

export function derivePaymentState(
  totalCents: number,
  paidCents: number,
  checks: readonly Check[]
): PaymentStateSummary {
  if (totalCents === 0) return "unbilled";
  if (paidCents >= totalCents) return "fully_paid";
  if (paidCents > 0) return "partially_paid";
  if (checks.length > 0) return "split_pending";
  return "unbilled";
}

export function deriveDiningStage(session: TableSession): DiningStage {
  if (session.closedAt) return "CLOSED";
  if (session.manualStageOverride) return session.manualStageOverride;

  const { totalCents, paidCents } = deriveFinancials(session.items, session.payments);
  if (totalCents > 0 && paidCents >= totalCents) return "PAYING";
  if (paidCents > 0) return "PAYING";

  const checkRequested = session.requests.some(
    (r) => r.category === "CHECK" && r.status !== "COMPLETED" && r.status !== "CANCELLED"
  ) || session.checks.some((c) => c.status === "presented" || c.status === "settling");
  if (checkRequested) return "CHECK_REQUESTED";

  const activeItems = session.items.filter((i) => i.status !== "voided");
  if (activeItems.length === 0) return "SEATED";

  const isFiredOrBeyond = (course: string) =>
    activeItems.some(
      (i) => i.course === course && (i.status === "fired" || i.status === "preparing" || i.status === "ready" || i.status === "delivered")
    );

  if (isFiredOrBeyond("desserts")) return "DESSERT";
  if (isFiredOrBeyond("mains")) return "ENTREES";
  if (isFiredOrBeyond("starters")) return "APPETIZERS";
  if (isFiredOrBeyond("drinks")) return "DRINKS";

  return "ORDERING";
}

export function deriveOperationalAttention(
  session: TableSession,
  now = new Date()
): { urgency: AttentionUrgency; reasons: string[]; isAttentionRequired: boolean } {
  const reasons: string[] = [];
  const openRequests = session.requests.filter(
    (r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS"
  );

  const pendingUrgentRequests = openRequests.filter((r) => r.status === "OPEN");
  if (pendingUrgentRequests.length > 0) {
    reasons.push(`${pendingUrgentRequests.length} unacknowledged guest request(s)`);
    return {
      urgency: "urgent_guest_request",
      reasons,
      isAttentionRequired: true
    };
  }

  // Check requested
  if (openRequests.some((r) => r.category === "CHECK" && r.status !== "COMPLETED")) {
    reasons.push("Guest requested bill drop");
    return {
      urgency: "check_requested",
      reasons,
      isAttentionRequired: true
    };
  }

  // Long kitchen tickets (> 25 mins without delivery)
  const openTickets = session.tickets.filter((t) => t.status === "queued" || t.status === "in_prep");
  const delayedTickets = openTickets.filter((t) => {
    const elapsed = deriveElapsedMinutes(t.createdAt, undefined, now);
    return elapsed >= 25;
  });
  if (delayedTickets.length > 0) {
    reasons.push(`${delayedTickets.length} kitchen ticket(s) exceeding 25m target prep time`);
    return {
      urgency: "kitchen_delayed",
      reasons,
      isAttentionRequired: true
    };
  }

  // Fully paid but session not closed
  const { totalCents, paidCents } = deriveFinancials(session.items, session.payments);
  if (totalCents > 0 && paidCents >= totalCents && !session.closedAt) {
    reasons.push("Bill paid in full — ready for table reset");
    return {
      urgency: "ready_to_clear",
      reasons,
      isAttentionRequired: true
    };
  }

  // Seated party without assigned server or without orders after 15 mins
  const elapsed = deriveElapsedMinutes(session.openedAt, session.closedAt, now);
  if (!session.assignedServerId) {
    reasons.push("Table open with no assigned server");
    return {
      urgency: "idle_attention_needed",
      reasons,
      isAttentionRequired: true
    };
  }

  if (session.items.length === 0 && elapsed > 15) {
    reasons.push(`Party seated for ${elapsed}m with no active orders`);
    return {
      urgency: "idle_attention_needed",
      reasons,
      isAttentionRequired: true
    };
  }

  return {
    urgency: "normal",
    reasons: [],
    isAttentionRequired: false
  };
}

export function projectTableSession(
  session: TableSession,
  now = new Date(),
  taxRatePercent = 8.25
): TableSessionProjection {
  const stage = deriveDiningStage(session);
  const elapsedMinutes = deriveElapsedMinutes(session.openedAt, session.closedAt, now);
  const activeItems = session.items.filter((i) => i.status !== "voided");
  const kitchenProgress = deriveKitchenProgress(session.tickets, session.items);
  const openRequests = session.requests.filter(
    (r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS"
  );
  const tableSummary = deriveTableBillSummary(session, taxRatePercent);
  const paymentState = derivePaymentState(tableSummary.totalCents, tableSummary.paidCents, session.checks);
  const operationalAttention = deriveOperationalAttention(session, now);

  return {
    id: session.id,
    tableId: session.tableId,
    tableLabel: session.tableLabel,
    stage,
    assignedServerId: session.assignedServerId,
    diners: session.diners,
    seatCount: session.diners.length,
    elapsedMinutes,
    activeItems,
    kitchenProgress,
    openRequests,
    subtotalCents: tableSummary.subtotalCents,
    individualSubtotalCents: tableSummary.individualSubtotalCents,
    sharedSubtotalCents: tableSummary.sharedSubtotalCents,
    taxCents: tableSummary.taxCents,
    discountCents: tableSummary.discountCents,
    totalCents: tableSummary.totalCents,
    paidCents: tableSummary.paidCents,
    unpaidBalanceCents: tableSummary.unpaidBalanceCents,
    paymentState,
    dinerBills: tableSummary.dinerBills,
    sharedItems: tableSummary.sharedItems,
    tableSummary,
    operationalAttention
  };
}
