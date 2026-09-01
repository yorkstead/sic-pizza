/**
 * Sandbox Payment Processor Adapter & Financial Ledger Engine.
 * Supports PaymentIntent lifecycles, deterministic test tokens, tip adjustments, refunds, and EOD reconciliation.
 */

export type PaymentIntentStatus =
  | "requires_payment_method"
  | "requires_capture"
  | "succeeded"
  | "canceled"
  | "failed";

export interface PaymentIntentMetadata {
  sessionId: string;
  locationId: string;
  checkId?: string;
  dinerId?: string;
  actorId?: string;
  actorType?: "employee" | "guest" | "system";
}

export interface PaymentIntent {
  id: string; // pi_...
  amountCents: number;
  tipCents: number;
  totalAmountCents: number;
  currency: "USD";
  status: PaymentIntentStatus;
  paymentMethodId: string;
  clientSecret: string;
  idempotencyKey: string;
  metadata: PaymentIntentMetadata;
  capturedAmountCents: number;
  refundedAmountCents: number;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RefundRecord {
  id: string; // re_...
  paymentIntentId: string;
  amountCents: number;
  reason: string;
  actorId: string;
  createdAt: string;
}

export interface DailyReconciliationReport {
  locationId: string;
  date: string;
  totalTransactions: number;
  grossSalesCents: number;
  totalTipCents: number;
  totalRefundsCents: number;
  netRevenueCents: number;
  paymentMethodBreakdown: Record<string, { count: number; grossCents: number }>;
  statusBreakdown: Record<PaymentIntentStatus, number>;
  refundCount: number;
  isBalanced: boolean;
}

export class SandboxPaymentAdapter {
  private intents = new Map<string, PaymentIntent>();
  private intentsByIdempotency = new Map<string, PaymentIntent>();
  private refunds: RefundRecord[] = [];

  /**
   * Deterministic Test Payment Method Tokens
   */
  static readonly TEST_TOKENS = {
    SUCCESS: "pm_card_visa_success",
    DECLINED: "pm_card_declined",
    INSUFFICIENT_FUNDS: "pm_card_insufficient_funds",
    TIMEOUT: "pm_card_timeout",
    REQUIRES_PIN: "pm_card_requires_pin"
  } as const;

  /**
   * Creates a payment intent with deterministic outcome simulation.
   */
  async createPaymentIntent(params: {
    amountCents: number;
    tipCents?: number;
    paymentMethodId: string;
    idempotencyKey: string;
    metadata: PaymentIntentMetadata;
    autoCapture?: boolean;
  }): Promise<PaymentIntent> {
    if (params.amountCents <= 0) {
      throw new Error("Amount must be greater than 0 integer cents.");
    }

    // Idempotency check
    const existing = this.intentsByIdempotency.get(params.idempotencyKey);
    if (existing) {
      return existing;
    }

    const tipCents = params.tipCents || 0;
    const totalAmountCents = params.amountCents + tipCents;
    const id = `pi_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const now = new Date().toISOString();

    // Check simulated failure tokens
    if (params.paymentMethodId === SandboxPaymentAdapter.TEST_TOKENS.TIMEOUT) {
      throw new Error("Gateway timeout connecting to sandbox processor (504).");
    }

    if (params.paymentMethodId === SandboxPaymentAdapter.TEST_TOKENS.DECLINED) {
      const failedIntent: PaymentIntent = {
        id,
        amountCents: params.amountCents,
        tipCents,
        totalAmountCents,
        currency: "USD",
        status: "failed",
        paymentMethodId: params.paymentMethodId,
        clientSecret: `secret_${id}`,
        idempotencyKey: params.idempotencyKey,
        metadata: params.metadata,
        capturedAmountCents: 0,
        refundedAmountCents: 0,
        failureReason: "Card declined by issuing bank (do_not_honor)",
        createdAt: now,
        updatedAt: now
      };
      this.intents.set(id, failedIntent);
      this.intentsByIdempotency.set(params.idempotencyKey, failedIntent);
      return failedIntent;
    }

    if (params.paymentMethodId === SandboxPaymentAdapter.TEST_TOKENS.INSUFFICIENT_FUNDS) {
      const failedIntent: PaymentIntent = {
        id,
        amountCents: params.amountCents,
        tipCents,
        totalAmountCents,
        currency: "USD",
        status: "failed",
        paymentMethodId: params.paymentMethodId,
        clientSecret: `secret_${id}`,
        idempotencyKey: params.idempotencyKey,
        metadata: params.metadata,
        capturedAmountCents: 0,
        refundedAmountCents: 0,
        failureReason: "Card declined: insufficient funds in account (insufficient_funds)",
        createdAt: now,
        updatedAt: now
      };
      this.intents.set(id, failedIntent);
      this.intentsByIdempotency.set(params.idempotencyKey, failedIntent);
      return failedIntent;
    }

    const isAutoCapture = params.autoCapture ?? true;
    const intent: PaymentIntent = {
      id,
      amountCents: params.amountCents,
      tipCents,
      totalAmountCents,
      currency: "USD",
      status: isAutoCapture ? "succeeded" : "requires_capture",
      paymentMethodId: params.paymentMethodId,
      clientSecret: `secret_${id}`,
      idempotencyKey: params.idempotencyKey,
      metadata: params.metadata,
      capturedAmountCents: isAutoCapture ? totalAmountCents : 0,
      refundedAmountCents: 0,
      createdAt: now,
      updatedAt: now
    };

    this.intents.set(id, intent);
    this.intentsByIdempotency.set(params.idempotencyKey, intent);
    return intent;
  }

  /**
   * Captures an authorized PaymentIntent with optional tip adjustment.
   */
  async capturePaymentIntent(
    intentId: string,
    options?: { tipCents?: number; idempotencyKey?: string }
  ): Promise<PaymentIntent> {
    const intent = this.intents.get(intentId);
    if (!intent) {
      throw new Error(`PaymentIntent ${intentId} not found.`);
    }

    if (intent.status === "succeeded") {
      // Already captured
      return intent;
    }

    if (intent.status !== "requires_capture") {
      throw new Error(`Cannot capture PaymentIntent in status ${intent.status}`);
    }

    if (options?.tipCents !== undefined) {
      if (options.tipCents < 0) {
        throw new Error("Tip cents cannot be negative.");
      }
      // Safety threshold: tip cannot exceed 100% of base amount in sandbox
      if (options.tipCents > intent.amountCents) {
        throw new Error("Tip adjustment exceeds maximum allowed threshold (100% of subtotal).");
      }
      intent.tipCents = options.tipCents;
      intent.totalAmountCents = intent.amountCents + intent.tipCents;
    }

    intent.capturedAmountCents = intent.totalAmountCents;
    intent.status = "succeeded";
    intent.updatedAt = new Date().toISOString();

    return intent;
  }

  /**
   * Processes a partial or full refund with mandatory audit reason.
   */
  async refundPayment(params: {
    intentId: string;
    amountCents: number;
    reason: string;
    actorId: string;
  }): Promise<RefundRecord> {
    const intent = this.intents.get(params.intentId);
    if (!intent) {
      throw new Error(`PaymentIntent ${params.intentId} not found.`);
    }

    if (intent.status !== "succeeded") {
      throw new Error(`Cannot refund PaymentIntent in status ${intent.status}. Must be succeeded.`);
    }

    if (params.amountCents <= 0) {
      throw new Error("Refund amount must be positive integer cents.");
    }

    if (!params.reason || params.reason.trim().length === 0) {
      throw new Error("Mandatory refund audit reason must be specified.");
    }

    const remainingRefundable = intent.capturedAmountCents - intent.refundedAmountCents;
    if (params.amountCents > remainingRefundable) {
      throw new Error(
        `Requested refund of ${params.amountCents}¢ exceeds refundable balance of ${remainingRefundable}¢.`
      );
    }

    intent.refundedAmountCents += params.amountCents;
    intent.updatedAt = new Date().toISOString();

    const refund: RefundRecord = {
      id: `re_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      paymentIntentId: intent.id,
      amountCents: params.amountCents,
      reason: params.reason,
      actorId: params.actorId,
      createdAt: new Date().toISOString()
    };

    this.refunds.push(refund);
    return refund;
  }

  /**
   * Generates an End-of-Day (EOD) batch reconciliation report for a location.
   */
  getDailyReconciliation(locationId: string, dateStr: string): DailyReconciliationReport {
    const locationIntents = Array.from(this.intents.values()).filter(
      (i) => i.metadata.locationId === locationId && i.createdAt.startsWith(dateStr)
    );

    let grossSalesCents = 0;
    let totalTipCents = 0;
    let totalRefundsCents = 0;

    const paymentMethodBreakdown: Record<string, { count: number; grossCents: number }> = {};
    const statusBreakdown: Record<PaymentIntentStatus, number> = {
      requires_payment_method: 0,
      requires_capture: 0,
      succeeded: 0,
      canceled: 0,
      failed: 0
    };

    for (const intent of locationIntents) {
      statusBreakdown[intent.status] = (statusBreakdown[intent.status] || 0) + 1;

      if (intent.status === "succeeded") {
        grossSalesCents += intent.amountCents;
        totalTipCents += intent.tipCents;
        totalRefundsCents += intent.refundedAmountCents;

        const pm = intent.paymentMethodId.startsWith("pm_") ? "card" : intent.paymentMethodId;
        if (!paymentMethodBreakdown[pm]) {
          paymentMethodBreakdown[pm] = { count: 0, grossCents: 0 };
        }
        paymentMethodBreakdown[pm].count += 1;
        paymentMethodBreakdown[pm].grossCents += intent.totalAmountCents;
      }
    }

    const netRevenueCents = grossSalesCents + totalTipCents - totalRefundsCents;
    const isBalanced = grossSalesCents >= 0 && netRevenueCents >= 0;

    const locationRefunds = this.refunds.filter((r) =>
      locationIntents.some((i) => i.id === r.paymentIntentId)
    );

    return {
      locationId,
      date: dateStr,
      totalTransactions: locationIntents.length,
      grossSalesCents,
      totalTipCents,
      totalRefundsCents,
      netRevenueCents,
      paymentMethodBreakdown,
      statusBreakdown,
      refundCount: locationRefunds.length,
      isBalanced
    };
  }

  /**
   * Resets adapter memory state (for testing).
   */
  reset(): void {
    this.intents.clear( );
    this.intentsByIdempotency.clear();
    this.refunds = [];
  }
}

// Global server singleton
let globalPaymentAdapter: SandboxPaymentAdapter | null = null;

export function getSandboxPaymentAdapter(): SandboxPaymentAdapter {
  if (!globalPaymentAdapter) {
    globalPaymentAdapter = new SandboxPaymentAdapter();
  }
  return globalPaymentAdapter;
}
