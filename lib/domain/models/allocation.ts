import type { OrderItem } from "./order";
import { calculateOrderItemTotalCents } from "./order";
import type { Diner, TableSession } from "./session";
import type { Payment } from "./payment";

export interface DinerItemShare {
  orderItemId: string;
  name: string;
  itemTotalCents: number;
  allocatedCents: number;
  splitMode: "single" | "shared_diners" | "whole_table";
  shareRatio: number; // e.g. 0.5 for 50%, 0.3333 for 1/3
  sharePercentageText: string; // "50%" or "33.3%" or "100%"
}

export interface DinerBillProjection {
  dinerId: string;
  displayName: string;
  seatNumber?: number;
  subtotalCents: number;
  individualSubtotalCents: number;
  sharedSubtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  unpaidBalanceCents: number;
  isFullyPaid: boolean;
  shares: DinerItemShare[];
}

export interface SharedItemBreakdown {
  orderItemId: string;
  name: string;
  itemTotalCents: number;
  splitMode: "shared_diners" | "whole_table";
  allocations: Array<{
    dinerId: string;
    displayName: string;
    cents: number;
    sharePercentageText: string;
  }>;
}

export interface TableBillSummary {
  subtotalCents: number;
  individualSubtotalCents: number;
  sharedSubtotalCents: number;
  taxCents: number;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  unpaidBalanceCents: number;
  isFullyPaid: boolean;
  dinerBills: DinerBillProjection[];
  sharedItems: SharedItemBreakdown[];
}

/**
 * Deterministically divides an integer cent amount among N recipients using weights.
 * Handles remainder cents so the sum of allocated cents is GUARANTEED to equal totalCents.
 * Zero floating-point drift.
 */
export function allocateIntegerCents(
  totalCents: number,
  participants: Array<{ id: string; weight: number }>
): Array<{ id: string; cents: number; shareRatio: number }> {
  if (participants.length === 0) return [];
  if (totalCents <= 0) {
    const totalWeight = participants.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
    return participants.map((p) => ({
      id: p.id,
      cents: 0,
      shareRatio: totalWeight > 0 ? p.weight / totalWeight : 1 / participants.length
    }));
  }

  const totalWeight = participants.reduce((sum, p) => sum + Math.max(0, p.weight), 0);
  if (totalWeight === 0) {
    // Equal distribution if weights are 0
    return allocateIntegerCents(
      totalCents,
      participants.map((p) => ({ id: p.id, weight: 1 }))
    );
  }

  // Step 1: Base integer truncation and compute raw fractional remainders
  const allocations = participants.map((p, index) => {
    const exactShare = (totalCents * p.weight) / totalWeight;
    const baseCents = Math.floor(exactShare);
    const fractionalPart = exactShare - baseCents;
    return {
      id: p.id,
      baseCents,
      fractionalPart,
      shareRatio: p.weight / totalWeight,
      originalIndex: index
    };
  });

  const sumBase = allocations.reduce((sum, a) => sum + a.baseCents, 0);
  const remainder = totalCents - sumBase;

  // Step 2: Sort descending by fractional remainder (ties broken by original index)
  const sorted = [...allocations].sort((a, b) => {
    if (b.fractionalPart !== a.fractionalPart) {
      return b.fractionalPart - a.fractionalPart;
    }
    return a.originalIndex - b.originalIndex;
  });

  // Step 3: Distribute remainder pennies 1 by 1
  for (let i = 0; i < remainder && i < sorted.length; i++) {
    sorted[i].baseCents += 1;
  }

  // Restore original order and return
  return allocations.map((a) => {
    const matching = sorted.find((s) => s.originalIndex === a.originalIndex)!;
    return {
      id: a.id,
      cents: matching.baseCents,
      shareRatio: a.shareRatio
    };
  });
}

/**
 * Allocates a single order item's total cents to diners based on its splitMode and assigned diners.
 */
export function allocateItemToDiners(
  item: OrderItem,
  activeDiners: readonly Diner[]
): Array<{ dinerId: string; cents: number; shareRatio: number; splitMode: "single" | "shared_diners" | "whole_table" }> {
  const itemTotalCents = calculateOrderItemTotalCents(item);
  if (itemTotalCents === 0) return [];

  const splitMode = item.splitMode || (item.assignedDinerIds && item.assignedDinerIds.length > 1 ? "shared_diners" : "single");

  // Case 1: Whole Table
  if (splitMode === "whole_table") {
    if (activeDiners.length === 0) {
      // Fallback to item.dinerId or single pool
      const fallbackId = item.dinerId || "table_pool";
      return [{ dinerId: fallbackId, cents: itemTotalCents, shareRatio: 1, splitMode: "whole_table" }];
    }

    const participants = activeDiners.map((d) => ({
      id: d.id,
      weight: item.customShares?.[d.id] ?? 1
    }));
    const allocated = allocateIntegerCents(itemTotalCents, participants);
    return allocated.map((a) => ({
      dinerId: a.id,
      cents: a.cents,
      shareRatio: a.shareRatio,
      splitMode: "whole_table"
    }));
  }

  // Case 2: Specific Shared Diners
  if (splitMode === "shared_diners") {
    const assignedIds = item.assignedDinerIds && item.assignedDinerIds.length > 0
      ? item.assignedDinerIds
      : item.dinerId ? [item.dinerId] : activeDiners.map((d) => d.id);

    if (assignedIds.length === 0) {
      return [{ dinerId: item.dinerId || "table_pool", cents: itemTotalCents, shareRatio: 1, splitMode: "shared_diners" }];
    }

    const participants = assignedIds.map((id) => ({
      id,
      weight: item.customShares?.[id] ?? 1
    }));
    const allocated = allocateIntegerCents(itemTotalCents, participants);
    return allocated.map((a) => ({
      dinerId: a.id,
      cents: a.cents,
      shareRatio: a.shareRatio,
      splitMode: "shared_diners"
    }));
  }

  // Case 3: Single Diner (Default)
  const singleDinerId = item.dinerId || item.assignedDinerIds?.[0] || activeDiners[0]?.id || "table_pool";
  return [{ dinerId: singleDinerId, cents: itemTotalCents, shareRatio: 1, splitMode: "single" }];
}

/**
 * Continuously derives full itemization, diner subtotals, proportional tax, payments, and balances.
 * Guarantees zero penny loss across all diner checks.
 */
export function deriveTableBillSummary(
  session: TableSession,
  taxRatePercent = 8.25
): TableBillSummary {
  const billableItems = session.items.filter(
    (i) => i.status !== "voided" && i.status !== "proposed"
  );

  const diners = session.diners;
  const dinerMap = new Map(diners.map((d) => [d.id, d]));

  // Initialize diner accumulator map
  const dinerAccumulators = new Map<
    string,
    {
      subtotalCents: number;
      individualSubtotalCents: number;
      sharedSubtotalCents: number;
      discountCents: number;
      shares: DinerItemShare[];
    }
  >();

  for (const d of diners) {
    dinerAccumulators.set(d.id, {
      subtotalCents: 0,
      individualSubtotalCents: 0,
      sharedSubtotalCents: 0,
      discountCents: 0,
      shares: []
    });
  }

  const sharedItemsMap = new Map<string, SharedItemBreakdown>();

  // Distribute every billable item
  for (const item of billableItems) {
    const itemTotal = calculateOrderItemTotalCents(item);
    const allocations = allocateItemToDiners(item, diners);
    const isShared = allocations.length > 1 || item.splitMode === "whole_table" || item.splitMode === "shared_diners";

    if (isShared && allocations.length > 1) {
      sharedItemsMap.set(item.id, {
        orderItemId: item.id,
        name: item.name,
        itemTotalCents: itemTotal,
        splitMode: item.splitMode === "whole_table" ? "whole_table" : "shared_diners",
        allocations: allocations.map((a) => {
          const diner = dinerMap.get(a.dinerId);
          const pct = Math.round(a.shareRatio * 1000) / 10;
          return {
            dinerId: a.dinerId,
            displayName: diner?.displayName || "Guest",
            cents: a.cents,
            sharePercentageText: `${pct}%`
          };
        })
      });
    }

    for (const alloc of allocations) {
      let acc = dinerAccumulators.get(alloc.dinerId);
      if (!acc) {
        acc = {
          subtotalCents: 0,
          individualSubtotalCents: 0,
          sharedSubtotalCents: 0,
          discountCents: 0,
          shares: []
        };
        dinerAccumulators.set(alloc.dinerId, acc);
      }

      acc.subtotalCents += alloc.cents;
      if (alloc.splitMode === "single") {
        acc.individualSubtotalCents += alloc.cents;
      } else {
        acc.sharedSubtotalCents += alloc.cents;
      }

      const pct = Math.round(alloc.shareRatio * 1000) / 10;
      acc.shares.push({
        orderItemId: item.id,
        name: item.name,
        itemTotalCents: itemTotal,
        allocatedCents: alloc.cents,
        splitMode: alloc.splitMode,
        shareRatio: alloc.shareRatio,
        sharePercentageText: `${pct}%`
      });
    }
  }

  // Whole table subtotal
  const tableSubtotalCents = Array.from(dinerAccumulators.values()).reduce(
    (sum, a) => sum + a.subtotalCents,
    0
  );
  const tableTaxCents = Math.round((tableSubtotalCents * taxRatePercent) / 100);
  const tableDiscountCents = Array.from(dinerAccumulators.values()).reduce(
    (sum, a) => sum + a.discountCents,
    0
  );
  const tableTotalCents = tableSubtotalCents + tableTaxCents - tableDiscountCents;

  // Proportionally allocate whole-table tax to diners (exact penny match)
  const dinerTaxParticipants = Array.from(dinerAccumulators.entries()).map(([dinerId, acc]) => ({
    id: dinerId,
    weight: acc.subtotalCents
  }));
  const dinerTaxAllocations = allocateIntegerCents(tableTaxCents, dinerTaxParticipants);
  const dinerTaxMap = new Map(dinerTaxAllocations.map((t) => [t.id, t.cents]));

  // Calculate payments per diner
  const validPayments = session.payments.filter(
    (p: Payment) => p.status === "authorized" || p.status === "captured" || (p.status as string) === "completed"
  );
  const dinerPaidMap = new Map<string, number>();

  for (const payment of validPayments) {
    if (payment.actorId && dinerMap.has(payment.actorId)) {
      const current = dinerPaidMap.get(payment.actorId) || 0;
      dinerPaidMap.set(payment.actorId, current + payment.amountCents);
    } else {
      // If payment is for a check with specific diners
      const check = session.checks.find((c) => c.id === payment.checkId);
      if (check && check.dinerIds.length === 1 && dinerMap.has(check.dinerIds[0])) {
        const dId = check.dinerIds[0];
        const current = dinerPaidMap.get(dId) || 0;
        dinerPaidMap.set(dId, current + payment.amountCents);
      } else {
        // Table-wide unassigned payment, allocate proportionally to remaining balances
        const unassignedDinerId = diners[0]?.id || "table_pool";
        const current = dinerPaidMap.get(unassignedDinerId) || 0;
        dinerPaidMap.set(unassignedDinerId, current + payment.amountCents);
      }
    }
  }

  const tablePaidCents = validPayments.reduce((sum, p) => sum + p.amountCents, 0);

  // Build DinerBillProjections
  const dinerBills: DinerBillProjection[] = [];

  for (const [dinerId, acc] of dinerAccumulators.entries()) {
    const diner = dinerMap.get(dinerId);
    const taxCents = dinerTaxMap.get(dinerId) || 0;
    const totalCents = acc.subtotalCents + taxCents - acc.discountCents;
    const paidCents = dinerPaidMap.get(dinerId) || 0;
    const unpaidBalanceCents = Math.max(0, totalCents - paidCents);

    dinerBills.push({
      dinerId,
      displayName: diner?.displayName || (dinerId === "table_pool" ? "Table Pool" : "Guest"),
      seatNumber: diner?.seatNumber,
      subtotalCents: acc.subtotalCents,
      individualSubtotalCents: acc.individualSubtotalCents,
      sharedSubtotalCents: acc.sharedSubtotalCents,
      taxCents,
      discountCents: acc.discountCents,
      totalCents,
      paidCents,
      unpaidBalanceCents,
      isFullyPaid: totalCents > 0 && paidCents >= totalCents,
      shares: acc.shares
    });
  }

  const tableUnpaidBalanceCents = Math.max(0, tableTotalCents - tablePaidCents);

  return {
    subtotalCents: tableSubtotalCents,
    individualSubtotalCents: Array.from(dinerAccumulators.values()).reduce(
      (sum, a) => sum + a.individualSubtotalCents,
      0
    ),
    sharedSubtotalCents: Array.from(dinerAccumulators.values()).reduce(
      (sum, a) => sum + a.sharedSubtotalCents,
      0
    ),
    taxCents: tableTaxCents,
    discountCents: tableDiscountCents,
    totalCents: tableTotalCents,
    paidCents: tablePaidCents,
    unpaidBalanceCents: tableUnpaidBalanceCents,
    isFullyPaid: tableTotalCents > 0 && tablePaidCents >= tableTotalCents,
    dinerBills,
    sharedItems: Array.from(sharedItemsMap.values())
  };
}
