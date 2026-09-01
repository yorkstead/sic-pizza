import { NextRequest, NextResponse } from "next/server";
import { authorizeGuestSession } from "@/lib/server/auth/guest-auth";
import { getServerSessionService } from "@/lib/server/session-store";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const auth = await authorizeGuestSession(authHeader);
    if (!auth.authorized || !auth.guest) {
      return NextResponse.json({ error: auth.error || "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { action, payload = {}, idempotencyKey } = body;

    const staffOnlyActions = [
      "approve_item",
      "fire_course",
      "void_item",
      "close_table",
      "transfer_table",
      "manual_stage"
    ];

    if (staffOnlyActions.includes(action)) {
      return NextResponse.json(
        { error: `Permission Denied: Action '${action}' is restricted to restaurant staff.` },
        { status: 403 }
      );
    }

    const service = getServerSessionService();
    const guest = auth.guest;
    const ctx = {
      actorType: "guest" as const,
      actorId: guest.dinerId,
      idempotencyKey
    };

    let result: unknown;

    switch (action) {
      case "propose_item": {
        result = await service.proposeItem(
          guest.sessionId,
          {
            ...payload,
            dinerId: guest.dinerId,
            assignedDinerIds: payload.assignedDinerIds || [guest.dinerId]
          },
          ctx
        );
        break;
      }
      case "create_request": {
        result = await service.createGuestRequest(
          guest.sessionId,
          payload.category,
          payload.description,
          guest.dinerId,
          ctx
        );
        break;
      }
      case "process_payment": {
        result = await service.processDinerPayment(
          guest.sessionId,
          guest.dinerId,
          payload.amountCents,
          payload.tipCents || 0,
          payload.paymentMethodId || "mock_card_token",
          ctx
        );
        break;
      }
      default:
        return NextResponse.json({ error: `Unknown guest action: ${action}` }, { status: 400 });
    }

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
