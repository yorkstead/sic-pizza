import { NextRequest, NextResponse } from "next/server";
import { getSandboxPaymentAdapter } from "@/lib/server/payments/sandbox-adapter";
import { authorizeStaffAction } from "@/lib/server/auth/staff-auth";
import { authorizeGuestSession } from "@/lib/server/auth/guest-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { amountCents, tipCents, paymentMethodId, idempotencyKey, sessionId, locationId, dinerId, checkId, autoCapture } = body;

    if (!amountCents || !paymentMethodId || !idempotencyKey || !sessionId || !locationId) {
      return NextResponse.json(
        { error: "Missing required fields (amountCents, paymentMethodId, idempotencyKey, sessionId, locationId)." },
        { status: 400 }
      );
    }

    // Authenticate guest or staff
    const staffAuth = await authorizeStaffAction(req, "TABLE_VIEW");
    const authHeader = req.headers.get("authorization");
    const guestAuth = await authorizeGuestSession(authHeader);

    if (!staffAuth.authorized && (!guestAuth.authorized || guestAuth.guest?.sessionId !== sessionId)) {
      return NextResponse.json({ error: "Unauthorized to initiate payment for this session." }, { status: 403 });
    }

    const adapter = getSandboxPaymentAdapter();
    const intent = await adapter.createPaymentIntent({
      amountCents: Number(amountCents),
      tipCents: tipCents ? Number(tipCents) : 0,
      paymentMethodId,
      idempotencyKey,
      metadata: {
        sessionId,
        locationId,
        dinerId,
        checkId,
        actorType: staffAuth.authorized ? "employee" : "guest",
        actorId: staffAuth.session?.employeeId || guestAuth.guest?.dinerId
      },
      autoCapture: autoCapture ?? true
    });

    if (intent.status === "failed") {
      return NextResponse.json(
        { error: intent.failureReason || "Payment intent failed.", intent },
        { status: 402 } // Payment Required
      );
    }

    return NextResponse.json({ success: true, intent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to create payment intent";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
