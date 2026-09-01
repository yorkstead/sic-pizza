/**
 * Strict Integer-Cent Billing & Check Splitting Utility.
 * Guarantees zero penny drift across even splits, itemized checks, tax allocations, and tip distributions.
 */

export interface SplitShare {
  dinerIndex: number;
  dinerId?: string;
  subtotalCents: number;
  taxCents: number;
  tipCents: number;
  totalCents: number;
}

export class BillingEngine {
  /**
   * Evenly splits an integer-cent total across N diners with zero remainder drift.
   * Any leftover remainder pennies are deterministically distributed +1¢ to the initial shares.
   */
  static splitEvenly(totalCents: number, numWays: number): number[] {
    if (numWays <= 0) throw new Error("Number of ways must be at least 1");
    if (totalCents < 0) throw new Error("Total cents cannot be negative");

    const baseShare = Math.floor(totalCents / numWays);
    const remainder = totalCents % numWays;

    const shares: number[] = [];
    for (let i = 0; i < numWays; i++) {
      shares.push(baseShare + (i < remainder ? 1 : 0));
    }

    // Mathematical invariant verification
    const sum = shares.reduce((acc, s) => acc + s, 0);
    if (sum !== totalCents) {
      throw new Error(`Integrity error: sum of shares (${sum}) !== totalCents (${totalCents})`);
    }

    return shares;
  }

  /**
   * Splits a check by item allocations and calculates exact integer-cent tax and tip distributions.
   */
  static splitByItems(params: {
    items: Array<{ orderItemId: string; priceCents: number; dinerId: string }>;
    dinerIds: string[];
    taxRateBps: number; // e.g. 825 for 8.25%
    tipCents?: number;
  }): SplitShare[] {
    const { items, dinerIds, taxRateBps, tipCents = 0 } = params;

    // 1. Group subtotals by dinerId
    const subtotalsByDiner = new Map<string, number>();
    for (const dId of dinerIds) {
      subtotalsByDiner.set(dId, 0);
    }

    let overallSubtotal = 0;
    for (const item of items) {
      const current = subtotalsByDiner.get(item.dinerId) || 0;
      subtotalsByDiner.set(item.dinerId, current + item.priceCents);
      overallSubtotal += item.priceCents;
    }

    // 2. Compute total tax
    const totalTaxCents = Math.round((overallSubtotal * taxRateBps) / 10000);

    // 3. Distribute tax proportionally across diners with remainder reconciliation
    const taxShares = this.distributeProportionally(totalTaxCents, dinerIds.map((id) => subtotalsByDiner.get(id) || 0));

    // 4. Distribute tip proportionally or evenly across diners
    const tipShares = this.distributeProportionally(tipCents, dinerIds.map((id) => subtotalsByDiner.get(id) || 0));

    // 5. Assemble final shares
    return dinerIds.map((id, idx) => {
      const subtotal = subtotalsByDiner.get(id) || 0;
      const tax = taxShares[idx];
      const tip = tipShares[idx];
      return {
        dinerIndex: idx,
        dinerId: id,
        subtotalCents: subtotal,
        taxCents: tax,
        tipCents: tip,
        totalCents: subtotal + tax + tip
      };
    });
  }

  /**
   * Distributes an integer pool proportionally to weights with zero penny leakage.
   */
  static distributeProportionally(poolCents: number, weights: number[]): number[] {
    if (poolCents === 0) return weights.map(() => 0);
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    if (totalWeight === 0) {
      return this.splitEvenly(poolCents, weights.length);
    }

    let distributed = 0;
    const rawShares = weights.map((w) => {
      const share = Math.floor((poolCents * w) / totalWeight);
      distributed += share;
      return share;
    });

    let remainder = poolCents - distributed;
    // Distribute remainder pennies to the highest weight shares first
    const indexed = weights.map((w, i) => ({ weight: w, index: i })).sort((a, b) => b.weight - a.weight);

    let i = 0;
    while (remainder > 0) {
      rawShares[indexed[i % indexed.length].index] += 1;
      remainder--;
      i++;
    }

    return rawShares;
  }
}
