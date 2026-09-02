import { NextRequest, NextResponse } from "next/server";
import { getSandboxPaymentAdapter } from "@/lib/server/payments/sandbox-adapter";
import { authorizeStaffAction } from "@/lib/server/auth/staff-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { intentId, amountCents, reason, managerOverrideToken } = body;

    if (!intentId || !amountCents || !reason) {
      return NextResponse.json(
        { error: "Missing required fields (intentId, amountCents, reason)." },
        { status: 400 }
      );
    }

    // ITEM_COMP / ITEM_VOID permission or Manager Override required for refund
    const staffAuth = await authorizeStaffAction(req, "ITEM_COMP", managerOverrideToken);
    if (!staffAuth.authorized) {
      return NextResponse.json(
        { error: "Unauthorized: Manager permission or override required for refunds." },
        { status: 403 }
      );
    }

    const adapter = getSandboxPaymentAdapter();
    const refund = await adapter.refundPayment({
      intentId,
      amountCents: Number(amountCents),
      reason,
      actorId: staffAuth.session?.employeeId || "emp_unknown"
    });

    return NextResponse.json({ success: true, refund });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to process refund";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
