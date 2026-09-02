import { NextRequest, NextResponse } from "next/server";
import {
  authenticateStaffPin,
  authorizeStaffAction,
  revokeStaffSession,
  STAFF_DEVICE_COOKIE,
  STAFF_SESSION_COOKIE,
  STAFF_SESSION_SECONDS
} from "@/lib/server/auth/staff-auth";

export async function GET(req: NextRequest) {
  const auth = await authorizeStaffAction(req);

  if (!auth.authorized || !auth.session) {
    return NextResponse.json(
      { error: auth.error || "Invalid or expired staff session." },
      { status: 401 }
    );
  }

  return NextResponse.json({
    employee: {
      id: auth.session.employeeId,
      displayName: auth.session.displayName,
      role: auth.session.role,
      locationId: auth.session.locationId,
      organizationId: auth.session.organizationId
    },
    permissions: auth.session.permissions
  });
}

export async function POST(req: NextRequest) {
  try {
    const origin = req.headers.get("origin");
    if (origin && new URL(origin).host !== req.nextUrl.host) {
      return NextResponse.json({ error: "Cross-site staff login is not allowed." }, { status: 403 });
    }
    const body = await req.json();
    const { pin, locationId = "loc_downtown", employeeId } = body;

    const result = await authenticateStaffPin(pin, locationId, employeeId, {
      request: req,
      deviceToken: req.cookies.get(STAFF_DEVICE_COOKIE)?.value,
      deviceLabel: req.headers.get("x-device-label") ?? undefined
    });
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    const response = NextResponse.json({
      employee: {
        id: result.payload?.employeeId,
        displayName: result.payload?.displayName,
        role: result.payload?.role,
        locationId: result.payload?.locationId,
        organizationId: result.payload?.organizationId
      },
      permissions: result.payload?.permissions
    });
    const secure = process.env.NODE_ENV === "production";
    response.cookies.set(STAFF_SESSION_COOKIE, result.token, {
      httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: STAFF_SESSION_SECONDS, priority: "high"
    });
    response.cookies.set(STAFF_DEVICE_COOKIE, result.deviceToken, {
      httpOnly: true, secure, sameSite: "strict", path: "/", maxAge: 365 * 24 * 60 * 60, priority: "high"
    });
    return response;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  await revokeStaffSession(req);
  const response = NextResponse.json({ success: true });
  response.cookies.set(STAFF_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  return response;
}
