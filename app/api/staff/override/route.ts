import { NextRequest, NextResponse } from "next/server";
import { createManagerOverride } from "@/lib/server/auth/staff-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      managerPin,
      action = "PROTECTED_ACTION",
      reason = "Manager Override Authorization",
      locationId = "loc_downtown"
    } = body;

    const result = await createManagerOverride(managerPin, action, reason, locationId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    return NextResponse.json({
      overrideToken: result.overrideToken,
      managerName: result.managerName
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
