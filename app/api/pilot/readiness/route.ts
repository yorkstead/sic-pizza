import { NextRequest, NextResponse } from "next/server";
import { runControlledPilotAudit } from "@/lib/server/pilot/pilot-gate";
import { authorizeStaffAction } from "@/lib/server/auth/staff-auth";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const staffAuth = await authorizeStaffAction(authHeader, "ANALYTICS_VIEW");
    if (!staffAuth.authorized) {
      return NextResponse.json(
        { error: "Unauthorized: Analytics or Manager permission required to run pilot audit." },
        { status: 403 }
      );
    }

    const report = await runControlledPilotAudit();
    return NextResponse.json({ success: true, report });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Failed to run pilot audit";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
