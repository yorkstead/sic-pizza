import { NextRequest, NextResponse } from "next/server";
import { authorizeStaffAction, type StaffPermission } from "@/lib/server/auth/staff-auth";
import { getServerSessionService } from "@/lib/server/session-store";
import type { DiningStage } from "@/lib/domain";

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await context.params;
    const overrideHeader = req.headers.get("x-manager-override-token");

    const body = await req.json();
    const { action, payload = {}, idempotencyKey } = body;

    const actionPermissionMap: Record<string, StaffPermission> = {
      add_item: "ITEM_PROPOSE",
      approve_proposal: "ITEM_APPROVE",
      fire_course: "COURSE_FIRE",
      modify_item: "ITEM_MODIFY",
      void_item: "ITEM_VOID",
      close_table: "TABLE_CLOSE",
      transfer_table: "TABLE_TRANSFER",
      manual_stage: "STAGE_OVERRIDE"
    };

    const requiredPermission = actionPermissionMap[action];
    if (!requiredPermission) {
      return NextResponse.json({ error: `Unknown staff action: ${action}` }, { status: 400 });
    }

    const auth = await authorizeStaffAction(req, requiredPermission, overrideHeader);
    if (!auth.authorized || !auth.session) {
      return NextResponse.json({ error: auth.error || "Permission Denied" }, { status: 403 });
    }

    const service = getServerSessionService({
      organizationId: auth.session.organizationId,
      locationId: auth.session.locationId
    });
    const ctx = {
      actorType: "employee" as const,
      actorId: auth.session.employeeId,
      idempotencyKey
    };

    let result: unknown;

    switch (action) {
      case "add_item": {
        result = await service.addItem(sessionId, payload, ctx);
        break;
      }
      case "approve_proposal": {
        result = await service.approveItem(sessionId, payload.orderItemId, ctx);
        break;
      }
      case "fire_course": {
        result = await service.fireCourse(sessionId, payload.course, ctx);
        break;
      }
      case "modify_item": {
        result = await service.modifyItem(
          sessionId,
          payload.orderItemId,
          {
            selectedModifiers: payload.selectedModifiers,
            specialInstructions: payload.specialInstructions,
            quantity: payload.quantity
          },
          ctx
        );
        break;
      }
      case "void_item": {
        if (!payload.reason || String(payload.reason).trim().length === 0) {
          return NextResponse.json({ error: "Audit reason is required to void an item." }, { status: 400 });
        }
        result = await service.voidItem(sessionId, payload.orderItemId, String(payload.reason).trim(), ctx);
        break;
      }
      case "close_table": {
        result = await service.closeTableSession(sessionId, ctx);
        break;
      }
      case "transfer_table": {
        result = await service.transferTable(
          sessionId,
          payload.newServerId,
          payload.reason || "Staff table transfer",
          ctx
        );
        break;
      }
      case "manual_stage": {
        result = await service.setStage(
          sessionId,
          payload.stage as DiningStage,
          ctx
        );
        break;
      }
    }

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

