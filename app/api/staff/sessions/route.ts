import { NextRequest, NextResponse } from "next/server";
import { authorizeStaffAction } from "@/lib/server/auth/staff-auth";
import { getServerSessionRepository, getServerSessionService } from "@/lib/server/session-store";
import { projectTableSession } from "@/lib/domain";

export async function GET(req: NextRequest) {
  try {
    const auth = await authorizeStaffAction(req, "TABLE_VIEW");
    if (!auth.authorized || !auth.session) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 403 });
    }

    const repo = getServerSessionRepository();
    const sessions = await repo.listActive({
      organizationId: auth.session.organizationId,
      locationId: auth.session.locationId
    });

    const projections = sessions.map((s) => projectTableSession(s));
    return NextResponse.json({ sessions, projections });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await authorizeStaffAction(req, "TABLE_OPEN");
    if (!auth.authorized || !auth.session) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 403 });
    }

    const body = await req.json();
    const {
      tableId,
      tableLabel,
      diningAreaId = "area_main",
      assignedServerId,
      initialDiners
    } = body;

    const service = getServerSessionService({
      organizationId: auth.session.organizationId,
      locationId: auth.session.locationId
    });
    const result = await service.openTableSession(
      {
        restaurantId: auth.session.organizationId,
        locationId: auth.session.locationId,
        tableId,
        tableLabel: tableLabel || tableId,
        diningAreaId,
        openedByEmployeeId: auth.session.employeeId,
        assignedServerId: assignedServerId || auth.session.employeeId,
        initialDiners
      },
      {
        actorType: "employee",
        actorId: auth.session.employeeId
      }
    );

    return NextResponse.json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
