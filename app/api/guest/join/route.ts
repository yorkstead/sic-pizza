import { NextRequest, NextResponse } from "next/server";
import {
  verifyGuestJoinToken,
  createScopedGuestToken
} from "@/lib/server/auth/guest-auth";
import { getServerSessionRepository, getServerSessionService } from "@/lib/server/session-store";
import { projectTableSession, type TableSession } from "@/lib/domain";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tokenOrCode, dinerName = "Guest", existingDinerId } = body;

    if (!tokenOrCode || typeof tokenOrCode !== "string") {
      return NextResponse.json({ error: "Missing join token or table code." }, { status: 400 });
    }

    const repo = getServerSessionRepository();
    const service = getServerSessionService();

    let resolvedSession: TableSession | null = null;
    let tableLabel = "Table";

    // 1. Try verifying as cryptographically signed token
    if (tokenOrCode.includes(".")) {
      const payload = await verifyGuestJoinToken(tokenOrCode);
      if (!payload) {
        return NextResponse.json({ error: "QR code expired or signature invalid. Please scan current table QR code." }, { status: 401 });
      }

      resolvedSession = await repo.findById(payload.sessionId);
      if (!resolvedSession || resolvedSession.closedAt) {
        return NextResponse.json({ error: "This table session has ended or is no longer active." }, { status: 404 });
      }

      tableLabel = payload.tableLabel;
    } else {
      // 2. Direct table ID / code fallback (e.g. tbl_11, SIC-11, 11)
      const cleanCode = tokenOrCode.trim();
      const tableId = cleanCode.startsWith("tbl_")
        ? cleanCode
        : cleanCode.toUpperCase().startsWith("SIC-")
          ? `tbl_${cleanCode.slice(4)}`
          : `tbl_${cleanCode}`;

      resolvedSession = await repo.findByTableId(tableId);
      if (!resolvedSession || resolvedSession.closedAt) {
        return NextResponse.json({ error: `No active dining session found for table code ${tokenOrCode}.` }, { status: 404 });
      }

      tableLabel = resolvedSession.tableLabel;
    }

    // 3. Resolve or Add Diner
    let diner = existingDinerId
      ? resolvedSession.diners.find((d) => d.id === existingDinerId)
      : undefined;

    if (!diner) {
      const nextSeat = (resolvedSession.diners.length || 0) + 1;
      const addRes = await service.addDiner(
        resolvedSession.id,
        dinerName.trim() || `Guest ${nextSeat}`,
        nextSeat,
        { actorType: "guest" }
      );
      resolvedSession = addRes.session;
      diner = addRes.diner;
    }

    // 4. Issue Scoped Guest Token
    const guestToken = await createScopedGuestToken({
      sessionId: resolvedSession.id,
      tableId: resolvedSession.tableId,
      tableLabel,
      dinerId: diner.id,
      dinerName: diner.displayName,
      locationId: resolvedSession.locationId,
      organizationId: resolvedSession.restaurantId
    });

    const projection = projectTableSession(resolvedSession);

    return NextResponse.json({
      guestToken,
      diner,
      session: resolvedSession,
      projection
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
