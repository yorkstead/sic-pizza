import { NextRequest, NextResponse } from "next/server";
import { authenticateStaffPin } from "@/lib/server/auth/staff-auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pin, locationId = "loc_downtown", employeeId } = body;

    const result = await authenticateStaffPin(pin, locationId, employeeId);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 401 });
    }

    return NextResponse.json({
      token: result.token,
      employee: {
        id: result.payload?.employeeId,
        displayName: result.payload?.displayName,
        role: result.payload?.role,
        locationId: result.payload?.locationId,
        organizationId: result.payload?.organizationId
      },
      permissions: result.payload?.permissions
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
