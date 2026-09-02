import { NextRequest, NextResponse } from "next/server";
import { getSandboxPaymentAdapter } from "@/lib/server/payments/sandbox-adapter";
import { authorizeStaffAction } from "@/lib/server/auth/staff-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { intentId, tipCents } = body;

    if (!intentId) {
      return NextResponse.json({ error: "Missing intentId." }, { status: 400 });
    }

    const staffAuth = await authorizeStaffAction(req, "TABLE_VIEW");
    if (!staffAuth.authorized) {
      return NextResponse.json({ error: "Unauthorized: Staff permission required to capture." }, { status: 403 });
    }

    const adapter = getSandboxPaymentAdapter();
    const intent = await adapter.capturePaymentIntent(intentId, {
      tipCents: tipCents !== undefined ? Number(tipCents) : undefined
    });

    return NextResponse.json({ success: true, intent });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to capture payment intent";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
