import { describe, it, expect, beforeEach } from "bun:test";
import { SandboxPaymentAdapter } from "../server/payments/sandbox-adapter";
import { BillingEngine } from "./services/billing";


describe("Restaurant Operating System: Sandbox Payments, Refunds & Reconciliation", () => {
  let adapter: SandboxPaymentAdapter;

  beforeEach(() => {
    adapter = new SandboxPaymentAdapter();
    adapter.reset();
  });

  describe("1. Deterministic Sandbox Test Tokens", () => {
    it("successfully creates and auto-captures a payment with success token", async () => {
      const intent = await adapter.createPaymentIntent({
        amountCents: 4500, // $45.00
        tipCents: 900,     // $9.00
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.SUCCESS,
        idempotencyKey: "idem_pay_01",
        metadata: { sessionId: "sess_01", locationId: "loc_downtown", dinerId: "diner_01" }
      });

      expect(intent.id).toMatch(/^pi_/);
      expect(intent.status).toBe("succeeded");
      expect(intent.amountCents).toBe(4500);
      expect(intent.tipCents).toBe(900);
      expect(intent.totalAmountCents).toBe(5400);
      expect(intent.capturedAmountCents).toBe(5400);
    });

    it("handles card decline deterministically without charging", async () => {
      const intent = await adapter.createPaymentIntent({
        amountCents: 3200,
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.DECLINED,
        idempotencyKey: "idem_pay_02",
        metadata: { sessionId: "sess_01", locationId: "loc_downtown" }
      });

      expect(intent.status).toBe("failed");
      expect(intent.capturedAmountCents).toBe(0);
      expect(intent.failureReason).toContain("do_not_honor");
    });

    it("handles insufficient funds deterministically", async () => {
      const intent = await adapter.createPaymentIntent({
        amountCents: 8500,
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.INSUFFICIENT_FUNDS,
        idempotencyKey: "idem_pay_03",
        metadata: { sessionId: "sess_01", locationId: "loc_downtown" }
      });

      expect(intent.status).toBe("failed");
      expect(intent.failureReason).toContain("insufficient_funds");
    });

    it("handles processor gateway timeouts deterministically", async () => {
      expect(
        adapter.createPaymentIntent({
          amountCents: 2000,
          paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.TIMEOUT,
          idempotencyKey: "idem_pay_04",
          metadata: { sessionId: "sess_01", locationId: "loc_downtown" }
        })
      ).rejects.toThrow("Gateway timeout");
    });
  });

  describe("2. Idempotency Key Deduplication", () => {
    it("returns identical intent when re-executed with the same idempotency key", async () => {
      const first = await adapter.createPaymentIntent({
        amountCents: 5000,
        tipCents: 1000,
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.SUCCESS,
        idempotencyKey: "idem_duplicate_test",
        metadata: { sessionId: "sess_02", locationId: "loc_downtown" }
      });

      const second = await adapter.createPaymentIntent({
        amountCents: 5000,
        tipCents: 1000,
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.SUCCESS,
        idempotencyKey: "idem_duplicate_test",
        metadata: { sessionId: "sess_02", locationId: "loc_downtown" }
      });

      expect(second.id).toBe(first.id);
      expect(second.totalAmountCents).toBe(first.totalAmountCents);
      expect(second.createdAt).toBe(first.createdAt);
    });
  });

  describe("3. Pre-Authorization, Capture & Tip Adjustments", () => {
    it("supports separate auth and capture with tip adjustment", async () => {
      // 1. Pre-auth on table card swipe
      const authIntent = await adapter.createPaymentIntent({
        amountCents: 6000, // $60.00
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.SUCCESS,
        idempotencyKey: "idem_auth_01",
        autoCapture: false,
        metadata: { sessionId: "sess_03", locationId: "loc_downtown" }
      });

      expect(authIntent.status).toBe("requires_capture");
      expect(authIntent.capturedAmountCents).toBe(0);

      // 2. Capture with 20% tip ($12.00)
      const captured = await adapter.capturePaymentIntent(authIntent.id, {
        tipCents: 1200
      });

      expect(captured.status).toBe("succeeded");
      expect(captured.tipCents).toBe(1200);
      expect(captured.totalAmountCents).toBe(7200);
      expect(captured.capturedAmountCents).toBe(7200);
    });

    it("rejects tip adjustment exceeding safety threshold (100% of subtotal)", async () => {
      const authIntent = await adapter.createPaymentIntent({
        amountCents: 3000,
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.SUCCESS,
        idempotencyKey: "idem_auth_02",
        autoCapture: false,
        metadata: { sessionId: "sess_03", locationId: "loc_downtown" }
      });

      expect(
        adapter.capturePaymentIntent(authIntent.id, { tipCents: 4000 })
      ).rejects.toThrow("exceeds maximum allowed threshold");
    });
  });

  describe("4. Exact Integer-Cent Split Calculations (Zero Penny Drift)", () => {
    it("evenly splits $10.00 across 3 diners with zero remainder drift", () => {
      const splits = BillingEngine.splitEvenly(1000, 3);
      expect(splits).toEqual([334, 333, 333]);
      expect(splits.reduce((a, b) => a + b, 0)).toBe(1000);
    });

    it("evenly splits $25.00 across 7 diners with zero remainder drift", () => {
      const splits = BillingEngine.splitEvenly(2500, 7);
      expect(splits).toEqual([358, 357, 357, 357, 357, 357, 357]);
      expect(splits.reduce((a, b) => a + b, 0)).toBe(2500);
    });

    it("splits itemized bill and proportionally allocates exact tax and tip cents", () => {
      const items = [
        { orderItemId: "i1", priceCents: 2000, dinerId: "d1" }, // $20.00
        { orderItemId: "i2", priceCents: 3000, dinerId: "d2" }, // $30.00
        { orderItemId: "i3", priceCents: 5000, dinerId: "d3" }  // $50.00
      ]; // Total subtotal = $100.00

      const result = BillingEngine.splitByItems({
        items,
        dinerIds: ["d1", "d2", "d3"],
        taxRateBps: 825, // 8.25% ($8.25 = 825¢)
        tipCents: 1800  // $18.00
      });

      expect(result.length).toBe(3);
      const totalTax = result.reduce((acc, s) => acc + s.taxCents, 0);
      const totalTip = result.reduce((acc, s) => acc + s.tipCents, 0);
      const grandTotal = result.reduce((acc, s) => acc + s.totalCents, 0);

      expect(totalTax).toBe(825);
      expect(totalTip).toBe(1800);
      expect(grandTotal).toBe(10000 + 825 + 1800); // Exactly $126.25
    });
  });

  describe("5. Partial and Full Refund Operations with Audit Records", () => {
    it("processes full refund on captured payment", async () => {
      const intent = await adapter.createPaymentIntent({
        amountCents: 4000,
        tipCents: 800,
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.SUCCESS,
        idempotencyKey: "idem_refund_01",
        metadata: { sessionId: "sess_04", locationId: "loc_downtown" }
      });

      const refund = await adapter.refundPayment({
        intentId: intent.id,
        amountCents: 4800,
        reason: "Customer unsatisfied with undercooked dough",
        actorId: "emp_manager_sam"
      });

      expect(refund.id).toMatch(/^re_/);
      expect(refund.amountCents).toBe(4800);
      expect(refund.reason).toContain("undercooked dough");
      expect(intent.refundedAmountCents).toBe(4800);
    });

    it("processes multiple partial refunds up to captured total and rejects overflow", async () => {
      const intent = await adapter.createPaymentIntent({
        amountCents: 5000,
        tipCents: 1000,
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.SUCCESS,
        idempotencyKey: "idem_refund_02",
        metadata: { sessionId: "sess_04", locationId: "loc_downtown" }
      });

      // Partial refund 1: $20.00
      await adapter.refundPayment({
        intentId: intent.id,
        amountCents: 2000,
        reason: "Comp appetizer",
        actorId: "emp_manager_sam"
      });
      expect(intent.refundedAmountCents).toBe(2000);

      // Partial refund 2: $30.00
      await adapter.refundPayment({
        intentId: intent.id,
        amountCents: 3000,
        reason: "Comp dessert",
        actorId: "emp_manager_sam"
      });
      expect(intent.refundedAmountCents).toBe(5000);

      // Attempt refund 3: $15.00 (Only $10.00 remaining refundable)
      expect(
        adapter.refundPayment({
          intentId: intent.id,
          amountCents: 1500,
          reason: "Excess refund attempt",
          actorId: "emp_manager_sam"
        })
      ).rejects.toThrow("exceeds refundable balance");
    });
  });

  describe("6. End-of-Day (EOD) Batch Reconciliation Reporting", () => {
    it("generates balanced reconciliation report across gross sales, tips, and refunds", async () => {
      const dateStr = "2026-09-01";

      // Transaction 1: $50 sale + $10 tip = $60
      await adapter.createPaymentIntent({
        amountCents: 5000,
        tipCents: 1000,
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.SUCCESS,
        idempotencyKey: "idem_eod_01",
        metadata: { sessionId: "sess_eod_01", locationId: "loc_downtown" }
      });

      // Transaction 2: $30 sale + $5 tip = $35
      const intent2 = await adapter.createPaymentIntent({
        amountCents: 3000,
        tipCents: 500,
        paymentMethodId: SandboxPaymentAdapter.TEST_TOKENS.SUCCESS,
        idempotencyKey: "idem_eod_02",
        metadata: { sessionId: "sess_eod_02", locationId: "loc_downtown" }
      });

      // Refund on Transaction 2: $15 refund
      await adapter.refundPayment({
        intentId: intent2.id,
        amountCents: 1500,
        reason: "Delayed ticket",
        actorId: "emp_manager_sam"
      });

      const report = adapter.getDailyReconciliation("loc_downtown", dateStr);

      expect(report.totalTransactions).toBe(2);
      expect(report.grossSalesCents).toBe(8000);      // $80.00
      expect(report.totalTipCents).toBe(1500);        // $15.00
      expect(report.totalRefundsCents).toBe(1500);    // $15.00
      expect(report.netRevenueCents).toBe(8000);       // $80.00 gross + $15 tip - $15 refund = $80.00
      expect(report.refundCount).toBe(1);
      expect(report.isBalanced).toBe(true);
    });
  });
});
