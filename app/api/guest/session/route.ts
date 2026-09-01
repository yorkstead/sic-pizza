import { NextRequest, NextResponse } from "next/server";
import { authorizeGuestSession } from "@/lib/server/auth/guest-auth";
import { getServerSessionRepository } from "@/lib/server/session-store";
import { projectTableSession } from "@/lib/domain";

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const auth = await authorizeGuestSession(authHeader);
    if (!auth.authorized || !auth.guest) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const repo = getServerSessionRepository();
    const session = await repo.findById(
      {
        organizationId: auth.guest.organizationId,
        locationId: auth.guest.locationId
      },
      auth.guest.sessionId
    );
    if (!session || session.closedAt) {
      return NextResponse.json({ error: "Session has been closed." }, { status: 404 });
    }

    const projection = projectTableSession(session);

    return NextResponse.json({
      session,
      projection,
      currentDiner: {
        id: auth.guest.dinerId,
        displayName: auth.guest.dinerName,
        tableLabel: auth.guest.tableLabel
      }
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
