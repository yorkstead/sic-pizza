import { NextRequest, NextResponse } from "next/server";
import { getSandboxPaymentAdapter } from "@/lib/server/payments/sandbox-adapter";
import { authorizeStaffAction } from "@/lib/server/auth/staff-auth";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const locationId = searchParams.get("locationId") || "loc_downtown";
    const dateStr = searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const authHeader = req.headers.get("Authorization");
    const staffAuth = await authorizeStaffAction(authHeader, "ANALYTICS_VIEW");
    if (!staffAuth.authorized) {
      return NextResponse.json(
        { error: "Unauthorized: Analytics or Manager permission required to view reconciliation." },
        { status: 403 }
      );
    }

    const adapter = getSandboxPaymentAdapter();
    const report = adapter.getDailyReconciliation(locationId, dateStr);

    return NextResponse.json({ success: true, report });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to fetch reconciliation report";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
