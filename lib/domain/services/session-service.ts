import type { TableSessionRepository } from "./session-repository";
import type { TableSession, Diner, TableSessionProjection, DiningStage } from "../models/session";
import { projectTableSession, deriveFinancials, deriveDiningStage } from "../models/session";
import type { OrderItem, SelectedModifier, SplitMode } from "../models/order";
import type { KitchenTicket } from "../models/kitchen";
import type { GuestRequest, RequestCategory } from "../models/request";
import { normalizeRequestCategory, routeRequest } from "../models/request";
import type { Check, Payment } from "../models/payment";
import type { DomainEvent, ActorType } from "../models/events";
import { createDomainEvent } from "../models/events";
import type { Course } from "../models/menu";
import { deriveTableTransferSummary } from "../models/handoff";

export interface CommandContext {
  actorType: ActorType;
  actorId?: string;
  idempotencyKey?: string;
}

export type DomainEventListener = (event: DomainEvent, session: TableSession) => void | Promise<void>;

export class TableSessionService {
  constructor(
    private repo: TableSessionRepository,
    private eventListener?: DomainEventListener
  ) {}

  private async emit(
    session: TableSession,
    type: DomainEvent["type"],
    aggregateType: DomainEvent["aggregateType"],
    aggregateId: string,
    payload: Record<string, unknown>,
    ctx: CommandContext = { actorType: "system" }
  ): Promise<DomainEvent> {
    const event = createDomainEvent({
      restaurantId: session.restaurantId,
      locationId: session.locationId,
      sessionId: session.id,
      aggregateType,
      aggregateId,
      type,
      actorType: ctx.actorType || "system",
      actorId: ctx.actorId,
      payload,
      idempotencyKey: ctx.idempotencyKey
    });

    session.events.push(event);
    await this.repo.appendEvent(event);
    session.version = (session.version || 0) + 1;

    if (this.eventListener) {
      await this.eventListener(event, session);
    }

    return event;
  }


  private checkIdempotency<T>(session: TableSession, key?: string): T | null {
    if (!key) return null;
    if (!session.executedIdempotencyKeys) session.executedIdempotencyKeys = {};
    if (session.executedIdempotencyKeys[key]) {
      return session.executedIdempotencyKeys[key] as T;
    }
    return null;
  }

  private recordIdempotency<T>(session: TableSession, key: string | undefined, result: T): void {
    if (!key) return;
    if (!session.executedIdempotencyKeys) session.executedIdempotencyKeys = {};
    session.executedIdempotencyKeys[key] = result;
    session.version = (session.version || 1) + 1;
  }

  async openTableSession(
    params: {
      id?: string;
      restaurantId: string;
      locationId: string;
      tableId: string;
      tableLabel: string;
      diningAreaId: string;
      servicePeriodId?: string;
      openedByEmployeeId: string;
      assignedServerId?: string;
      initialDiners?: string[];
    },
    ctx: CommandContext = { actorType: "employee", actorId: params.openedByEmployeeId }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const existing = await this.repo.findByTableId(params.tableId);
    if (existing && !existing.closedAt) {
      throw new Error(`Table ${params.tableLabel} is already occupied by active session ${existing.id}`);
    }

    const sessionId = params.id ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `sess_${Date.now()}`);
    const joinTokenHash = `token_hash_${sessionId.substring(0, 8)}`;
    const now = new Date().toISOString();

    const diners: Diner[] = (params.initialDiners || []).map((name, index) => ({
      id: `diner_${sessionId}_${index + 1}`,
      sessionId,
      displayName: name,
      seatNumber: index + 1,
      isGuestUser: true,
      joinedAt: now
    }));

    const session: TableSession = {
      id: sessionId,
      restaurantId: params.restaurantId,
      locationId: params.locationId,
      tableId: params.tableId,
      tableLabel: params.tableLabel,
      diningAreaId: params.diningAreaId,
      servicePeriodId: params.servicePeriodId,
      openedByEmployeeId: params.openedByEmployeeId,
      assignedServerId: params.assignedServerId ?? params.openedByEmployeeId,
      assistingEmployeeIds: [],
      joinTokenHash,
      openedAt: now,
      diners,
      items: [],
      tickets: [],
      requests: [],
      checks: [],
      payments: [],
      events: [],
      version: 1,
      executedIdempotencyKeys: {}
    };

    await this.emit(
      session,
      "TABLE_OPENED",
      "session",
      session.id,
      {
        tableId: session.tableId,
        tableLabel: session.tableLabel,
        diningAreaId: session.diningAreaId,
        openedByEmployeeId: session.openedByEmployeeId,
        assignedServerId: session.assignedServerId,
        initialDinerCount: diners.length
      },
      ctx
    );

    for (const diner of diners) {
      await this.emit(
        session,
        "DINER_ADDED",
        "session",
        session.id,
        { dinerId: diner.id, displayName: diner.displayName, seatNumber: diner.seatNumber },
        ctx
      );
    }

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  async addDiner(
    sessionId: string,
    displayName: string,
    seatNumber?: number,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection; diner: Diner }> {
    const session = await this.mustGetSession(sessionId);
    const dinerId = `diner_${session.id}_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
    const diner: Diner = {
      id: dinerId,
      sessionId: session.id,
      displayName,
      seatNumber: seatNumber ?? (session.diners.length + 1),
      isGuestUser: ctx.actorType === "guest",
      joinedAt: new Date().toISOString()
    };

    session.diners.push(diner);
    await this.emit(
      session,
      "DINER_ADDED",
      "session",
      session.id,
      { dinerId: diner.id, displayName: diner.displayName, seatNumber: diner.seatNumber },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session), diner };
  }

  async removeDiner(
    sessionId: string,
    dinerId: string,
    ctx: CommandContext
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const index = session.diners.findIndex((d) => d.id === dinerId);
    if (index === -1) throw new Error(`Diner ${dinerId} not found in session`);

    // Invariant: cannot remove a diner with active unbilled items
    const hasActiveItems = session.items.some(
      (i) => (i.dinerId === dinerId || (i.assignedDinerIds && i.assignedDinerIds.includes(dinerId))) && i.status !== "voided"
    );
    if (hasActiveItems) {
      throw new Error(`Cannot remove diner ${dinerId} with active order items`);
    }

    const removed = session.diners.splice(index, 1)[0];
    await this.emit(
      session,
      "DINER_REMOVED",
      "session",
      session.id,
      { dinerId: removed.id, displayName: removed.displayName },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  async transferTable(
    sessionId: string,
    toEmployeeId: string,
    reason: string,
    ctx: CommandContext
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    if (ctx.actorType === "guest") {
      throw new Error("Permission denied: Guests cannot transfer tables");
    }
    const session = await this.mustGetSession(sessionId);
    const prevServer = session.assignedServerId;
    session.assignedServerId = toEmployeeId;

    // Automatically reassign server-routed open requests to the new server
    for (const req of session.requests) {
      if ((req.status === "OPEN" || req.status === "ACKNOWLEDGED" || req.status === "IN_PROGRESS") &&
          (req.assignedRole === "server" || req.assignedEmployeeId === prevServer)) {
        req.assignedEmployeeId = toEmployeeId;
      }
    }

    const summary = deriveTableTransferSummary(session);

    await this.emit(
      session,
      "TABLE_TRANSFERRED",
      "session",
      session.id,
      {
        fromEmployeeId: prevServer,
        toEmployeeId,
        reason,
        transferSummary: summary
      },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  async transferMultipleTables(
    sessionIds: string[],
    toEmployeeId: string,
    reason: string,
    ctx: CommandContext
  ): Promise<{ sessions: TableSession[]; projections: TableSessionProjection[] }> {
    if (ctx.actorType === "guest") {
      throw new Error("Permission denied: Guests cannot transfer tables");
    }

    const updatedSessions: TableSession[] = [];
    const projections: TableSessionProjection[] = [];

    for (const id of sessionIds) {
      const res = await this.transferTable(id, toEmployeeId, reason, ctx);
      updatedSessions.push(res.session);
      projections.push(res.projection);
    }

    return { sessions: updatedSessions, projections };
  }

  async assignAssistingServer(
    sessionId: string,
    assistantEmployeeId: string,
    ctx: CommandContext
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    if (ctx.actorType === "guest") {
      throw new Error("Permission denied: Guests cannot assign assisting staff");
    }
    const session = await this.mustGetSession(sessionId);
    if (!session.assistingEmployeeIds) {
      session.assistingEmployeeIds = [];
    }

    if (!session.assistingEmployeeIds.includes(assistantEmployeeId)) {
      session.assistingEmployeeIds.push(assistantEmployeeId);
      await this.emit(
        session,
        "ASSISTANT_ASSIGNED",
        "session",
        session.id,
        { assistantEmployeeId, assignedBy: ctx.actorId },
        ctx
      );
      await this.repo.save(session);
    }

    return { session, projection: projectTableSession(session) };
  }

  async removeAssistingServer(
    sessionId: string,
    assistantEmployeeId: string,
    ctx: CommandContext
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    if (ctx.actorType === "guest") {
      throw new Error("Permission denied: Guests cannot modify assisting staff");
    }
    const session = await this.mustGetSession(sessionId);
    if (!session.assistingEmployeeIds) {
      session.assistingEmployeeIds = [];
    }

    const index = session.assistingEmployeeIds.indexOf(assistantEmployeeId);
    if (index !== -1) {
      session.assistingEmployeeIds.splice(index, 1);
      await this.emit(
        session,
        "ASSISTANT_REMOVED",
        "session",
        session.id,
        { assistantEmployeeId, removedBy: ctx.actorId },
        ctx
      );
      await this.repo.save(session);
    }

    return { session, projection: projectTableSession(session) };
  }

  async proposeItem(
    sessionId: string,
    itemData: {
      menuItemId: string;
      name: string;
      course?: Course;
      stationId?: string;
      quantity?: number;
      basePriceCents: number;
      selectedModifiers?: SelectedModifier[];
      specialInstructions?: string;
      dinerId?: string;
      seatNumber?: number;
      splitMode?: SplitMode;
      assignedDinerIds?: string[];
      customShares?: Record<string, number>;
    },
    ctx: CommandContext = { actorType: "guest" }
  ): Promise<{ session: TableSession; item: OrderItem; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const assignedDinerIds = itemData.assignedDinerIds || (itemData.dinerId ? [itemData.dinerId] : []);
    const splitMode = itemData.splitMode || (assignedDinerIds.length > 1 ? "shared_diners" : "single");

    const item: OrderItem = {
      id: itemId,
      orderId: `order_${session.id}`,
      sessionId: session.id,
      menuItemId: itemData.menuItemId,
      name: itemData.name,
      course: itemData.course ?? "mains",
      stationId: itemData.stationId ?? "kitchen",
      status: "proposed",
      quantity: itemData.quantity ?? 1,
      basePriceCents: itemData.basePriceCents,
      selectedModifiers: itemData.selectedModifiers ?? [],
      specialInstructions: itemData.specialInstructions,
      dinerId: itemData.dinerId ?? assignedDinerIds[0],
      seatNumber: itemData.seatNumber,
      splitMode,
      assignedDinerIds,
      customShares: itemData.customShares,
      proposedByDinerId: itemData.dinerId ?? ctx.actorId,
      createdAt: now
    };

    session.items.push(item);
    await this.emit(
      session,
      "ITEM_PROPOSED",
      "item",
      item.id,
      {
        itemId: item.id,
        name: item.name,
        dinerId: item.dinerId,
        splitMode: item.splitMode,
        assignedDinerIds: item.assignedDinerIds,
        quantity: item.quantity,
        basePriceCents: item.basePriceCents,
        course: item.course
      },
      ctx
    );

    await this.repo.save(session);
    return { session, item, projection: projectTableSession(session) };
  }

  async approveItem(
    sessionId: string,
    itemId: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; item: OrderItem; projection: TableSessionProjection }> {
    if (ctx.actorType === "guest") {
      throw new Error("Permission denied: Guests cannot approve proposed items");
    }
    const session = await this.mustGetSession(sessionId);
    const item = session.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);
    if (item.status !== "proposed") {
      throw new Error(`Item ${itemId} is in status ${item.status}, cannot approve`);
    }

    item.status = "confirmed";
    item.confirmedByEmployeeId = ctx.actorId;

    await this.emit(
      session,
      "ITEM_APPROVED",
      "item",
      item.id,
      { itemId: item.id, confirmedByEmployeeId: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, item, projection: projectTableSession(session) };
  }

  async addItem(
    sessionId: string,
    itemData: {
      menuItemId: string;
      name: string;
      course?: Course;
      stationId?: string;
      quantity?: number;
      basePriceCents: number;
      selectedModifiers?: SelectedModifier[];
      specialInstructions?: string;
      dinerId?: string;
      seatNumber?: number;
      splitMode?: SplitMode;
      assignedDinerIds?: string[];
      customShares?: Record<string, number>;
    },
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; item: OrderItem; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const cached = this.checkIdempotency<OrderItem>(session, ctx.idempotencyKey);
    if (cached) {
      return { session, item: cached, projection: projectTableSession(session) };
    }

    const itemId = `item_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date().toISOString();

    const assignedDinerIds = itemData.assignedDinerIds || (itemData.dinerId ? [itemData.dinerId] : []);
    const splitMode = itemData.splitMode || (assignedDinerIds.length > 1 ? "shared_diners" : "single");

    const item: OrderItem = {
      id: itemId,
      orderId: `order_${session.id}`,
      sessionId: session.id,
      menuItemId: itemData.menuItemId,
      name: itemData.name,
      course: itemData.course ?? "mains",
      stationId: itemData.stationId ?? "kitchen",
      status: "confirmed",
      quantity: itemData.quantity ?? 1,
      basePriceCents: itemData.basePriceCents,
      selectedModifiers: itemData.selectedModifiers ?? [],
      specialInstructions: itemData.specialInstructions,
      dinerId: itemData.dinerId ?? assignedDinerIds[0],
      seatNumber: itemData.seatNumber,
      splitMode,
      assignedDinerIds,
      customShares: itemData.customShares,
      confirmedByEmployeeId: ctx.actorId,
      createdAt: now
    };

    session.items.push(item);
    this.recordIdempotency(session, ctx.idempotencyKey, item);

    await this.emit(
      session,
      "ITEM_ADDED",
      "item",
      item.id,
      {
        itemId: item.id,
        name: item.name,
        dinerId: item.dinerId,
        splitMode: item.splitMode,
        assignedDinerIds: item.assignedDinerIds,
        quantity: item.quantity,
        basePriceCents: item.basePriceCents,
        course: item.course
      },
      ctx
    );

    await this.repo.save(session);
    return { session, item, projection: projectTableSession(session) };
  }

  async updateItemOwnership(
    sessionId: string,
    itemId: string,
    ownership: {
      splitMode: SplitMode;
      assignedDinerIds?: string[];
      customShares?: Record<string, number>;
    },
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; item: OrderItem; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const item = session.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    item.splitMode = ownership.splitMode;
    item.assignedDinerIds = ownership.assignedDinerIds || [];
    item.customShares = ownership.customShares;
    if (item.assignedDinerIds.length === 1) {
      item.dinerId = item.assignedDinerIds[0];
    }

    await this.emit(
      session,
      "ITEM_OWNERSHIP_UPDATED",
      "item",
      item.id,
      {
        itemId: item.id,
        splitMode: item.splitMode,
        assignedDinerIds: item.assignedDinerIds,
        customShares: item.customShares
      },
      ctx
    );

    await this.repo.save(session);
    return { session, item, projection: projectTableSession(session) };
  }

  async claimItem(
    sessionId: string,
    itemId: string,
    dinerId: string,
    ctx: CommandContext = { actorType: "guest" }
  ): Promise<{ session: TableSession; item: OrderItem; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const item = session.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    if (!item.assignedDinerIds.includes(dinerId)) {
      item.assignedDinerIds.push(dinerId);
    }
    if (item.assignedDinerIds.length > 1) {
      item.splitMode = "shared_diners";
    } else {
      item.splitMode = "single";
      item.dinerId = dinerId;
    }

    await this.emit(
      session,
      "ITEM_CLAIMED",
      "item",
      item.id,
      { itemId: item.id, dinerId, splitMode: item.splitMode },
      ctx
    );

    await this.repo.save(session);
    return { session, item, projection: projectTableSession(session) };
  }

  async unclaimItem(
    sessionId: string,
    itemId: string,
    dinerId: string,
    ctx: CommandContext = { actorType: "guest" }
  ): Promise<{ session: TableSession; item: OrderItem; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const item = session.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);

    item.assignedDinerIds = item.assignedDinerIds.filter((id) => id !== dinerId);
    if (item.customShares) {
      delete item.customShares[dinerId];
    }
    if (item.assignedDinerIds.length === 1) {
      item.splitMode = "single";
      item.dinerId = item.assignedDinerIds[0];
    } else if (item.assignedDinerIds.length === 0) {
      item.splitMode = "whole_table";
    }

    await this.emit(
      session,
      "ITEM_UNCLAIMED",
      "item",
      item.id,
      { itemId: item.id, dinerId, remainingDinerIds: item.assignedDinerIds },
      ctx
    );

    await this.repo.save(session);
    return { session, item, projection: projectTableSession(session) };
  }

  async modifyItem(
    sessionId: string,
    itemId: string,
    updates: {
      selectedModifiers?: SelectedModifier[];
      specialInstructions?: string;
      quantity?: number;
    },
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; item: OrderItem; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const item = session.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);
    if (item.status === "preparing" || item.status === "ready" || item.status === "delivered") {
      throw new Error(`Cannot modify item ${itemId} while in status ${item.status}`);
    }

    if (updates.selectedModifiers !== undefined) item.selectedModifiers = updates.selectedModifiers;
    if (updates.specialInstructions !== undefined) item.specialInstructions = updates.specialInstructions;
    if (updates.quantity !== undefined) item.quantity = updates.quantity;

    await this.emit(
      session,
      "ITEM_MODIFIED",
      "item",
      item.id,
      { itemId: item.id, ...updates },
      ctx
    );

    await this.repo.save(session);
    return { session, item, projection: projectTableSession(session) };
  }

  async voidItem(
    sessionId: string,
    itemId: string,
    reason: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; item: OrderItem; projection: TableSessionProjection }> {
    if (ctx.actorType === "guest") {
      throw new Error("Permission denied: Guests cannot void finalized items");
    }
    const session = await this.mustGetSession(sessionId);
    const item = session.items.find((i) => i.id === itemId);
    if (!item) throw new Error(`Item ${itemId} not found`);
    if (!reason || reason.trim().length === 0) {
      throw new Error("Void reason is required");
    }

    item.status = "voided";
    item.voidReason = reason;
    item.voidedByEmployeeId = ctx.actorId;

    for (const ticket of session.tickets) {
      const ticketItem = ticket.items.find((ti) => ti.orderItemId === itemId);
      if (ticketItem) {
        ticketItem.status = "voided";
      }
    }

    await this.emit(
      session,
      "ITEM_VOIDED",
      "item",
      item.id,
      { itemId: item.id, name: item.name, reason, voidedBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, item, projection: projectTableSession(session) };
  }

  async fireCourse(
    sessionId: string,
    course: Course,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; tickets: KitchenTicket[]; projection: TableSessionProjection }> {
    if (ctx.actorType === "guest") {
      throw new Error("Permission denied: Guests cannot fire kitchen courses");
    }
    const session = await this.mustGetSession(sessionId);
    const cached = this.checkIdempotency<KitchenTicket[]>(session, ctx.idempotencyKey);
    if (cached) {
      return { session, tickets: cached, projection: projectTableSession(session) };
    }

    const itemsToFire = session.items.filter(
      (i) => i.course === course && (i.status === "confirmed" || i.status === "held")
    );

    if (itemsToFire.length === 0) {
      throw new Error(`No confirmed items to fire for course ${course}`);
    }

    const itemsByStation = new Map<string, OrderItem[]>();
    for (const item of itemsToFire) {
      item.status = "fired";
      const station = item.stationId || "kitchen";
      const list = itemsByStation.get(station) || [];
      list.push(item);
      itemsByStation.set(station, list);
    }

    const newTickets: KitchenTicket[] = [];
    const now = new Date().toISOString();

    for (const [stationId, items] of itemsByStation.entries()) {
      const ticketId = `tkt_${Date.now()}_${stationId}_${Math.random().toString(36).substring(2, 5)}`;
      const ticket: KitchenTicket = {
        id: ticketId,
        sessionId: session.id,
        orderId: `order_${session.id}`,
        tableLabel: session.tableLabel,
        stationId,
        course,
        status: "queued",
        items: items.map((i) => {
          const diner = session.diners.find((d) => d.id === i.dinerId);
          const formattedMods = i.selectedModifiers.map((m) => {
            const parts: string[] = [];
            if (m.placement === "LEFT") parts.push("[Left 1/2]");
            else if (m.placement === "RIGHT") parts.push("[Right 1/2]");
            if (m.level === "NONE") parts.push("NO");
            else if (m.level === "LIGHT") parts.push("LIGHT");
            else if (m.level === "EXTRA") parts.push("EXTRA");
            else if (m.level === "ON_SIDE") parts.push("SIDE");
            parts.push(m.name);
            return parts.join(" ");
          });

          const allergenList: string[] = [];
          if (i.name.toLowerCase().includes("pesto") || i.name.toLowerCase().includes("nut")) {
            allergenList.push("tree_nuts");
          }
          if (i.name.toLowerCase().includes("cheese") || i.name.toLowerCase().includes("cream") || i.name.toLowerCase().includes("butter")) {
            allergenList.push("dairy");
          }

          return {
            orderItemId: i.id,
            name: i.name,
            quantity: i.quantity,
            course: i.course,
            stationId,
            modifiers: formattedMods,
            specialInstructions: i.specialInstructions,
            allergens: allergenList,
            hasAllergens: allergenList.length > 0,
            seatNumber: i.seatNumber || diner?.seatNumber,
            dinerName: diner?.displayName,
            status: "queued" as const
          };
        }),
        createdAt: now
      };

      session.tickets.push(ticket);
      newTickets.push(ticket);

      await this.emit(
        session,
        "TICKET_CREATED",
        "ticket",
        ticket.id,
        {
          ticketId: ticket.id,
          stationId,
          course,
          itemCount: ticket.items.length
        },
        ctx
      );
    }

    await this.emit(
      session,
      "COURSE_FIRED",
      "order",
      `course_${course}_${session.id}`,
      { course, firedItemCount: itemsToFire.length },
      ctx
    );

    this.recordIdempotency(session, ctx.idempotencyKey, newTickets);
    await this.repo.save(session);
    return { session, tickets: newTickets, projection: projectTableSession(session) };
  }

  async acceptKitchenTicket(
    sessionId: string,
    ticketId: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const ticket = session.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    ticket.status = "accepted";
    ticket.acceptedAt = new Date().toISOString();

    await this.emit(
      session,
      "TICKET_ACCEPTED",
      "ticket",
      ticket.id,
      { ticketId: ticket.id, acceptedBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  async startTicketItem(
    sessionId: string,
    ticketId: string,
    orderItemId: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const ticket = session.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const ticketItem = ticket.items.find((i) => i.orderItemId === orderItemId);
    if (!ticketItem) throw new Error(`Item ${orderItemId} not found in ticket ${ticketId}`);

    const now = new Date().toISOString();
    ticketItem.status = "preparing";
    ticketItem.startedAt = now;
    ticket.status = "in_prep";
    if (!ticket.startedAt) ticket.startedAt = now;

    const orderItem = session.items.find((i) => i.id === orderItemId);
    if (orderItem && orderItem.status !== "voided") {
      orderItem.status = "preparing";
    }

    await this.emit(
      session,
      "ITEM_STARTED",
      "item",
      orderItemId,
      { ticketId, orderItemId, stationId: ticket.stationId },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  async markTicketItemReady(
    sessionId: string,
    ticketId: string,
    orderItemId: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const ticket = session.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const ticketItem = ticket.items.find((i) => i.orderItemId === orderItemId);
    if (!ticketItem) throw new Error(`Item ${orderItemId} not found in ticket ${ticketId}`);

    const now = new Date().toISOString();
    ticketItem.status = "ready";
    ticketItem.readyAt = now;

    const orderItem = session.items.find((i) => i.id === orderItemId);
    if (orderItem && orderItem.status !== "voided") {
      orderItem.status = "ready";
    }

    const allReady = ticket.items.every((i) => i.status === "ready" || i.status === "voided");
    if (allReady) {
      ticket.status = "ready";
      ticket.readyAt = now;
    }

    await this.emit(
      session,
      "ITEM_READY",
      "item",
      orderItemId,
      { ticketId, orderItemId, stationId: ticket.stationId },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  async deliverTicketItems(
    sessionId: string,
    ticketId: string,
    orderItemIds: string[],
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const ticket = session.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const now = new Date().toISOString();
    for (const itemId of orderItemIds) {
      const ticketItem = ticket.items.find((i) => i.orderItemId === itemId);
      if (ticketItem) {
        ticketItem.status = "delivered";
        ticketItem.deliveredAt = now;
      }

      const orderItem = session.items.find((i) => i.id === itemId);
      if (orderItem && orderItem.status !== "voided") orderItem.status = "delivered";

      await this.emit(
        session,
        "ITEM_DELIVERED",
        "item",
        itemId,
        { ticketId, orderItemId: itemId, deliveredBy: ctx.actorId },
        ctx
      );
    }

    const allDelivered = ticket.items.every(
      (i) => i.status === "delivered" || i.status === "voided"
    );
    if (allDelivered) {
      ticket.status = "delivered";
      ticket.deliveredAt = now;
    }

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  /**
   * Recalls a recently completed or ready ticket back into in_prep state for line rework/correction.
   */
  async recallKitchenTicket(
    sessionId: string,
    ticketId: string,
    reason: string = "Line recall / quality correction",
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const ticket = session.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const now = new Date().toISOString();
    ticket.status = "in_prep";
    ticket.recalledAt = now;
    ticket.recallReason = reason;

    for (const item of ticket.items) {
      if (item.status !== "voided") {
        item.status = "preparing";
        item.recalledAt = now;
        const orderItem = session.items.find((i) => i.id === item.orderItemId);
        if (orderItem && orderItem.status !== "voided") {
          orderItem.status = "preparing";
        }
      }
    }

    await this.emit(
      session,
      "TICKET_RECALLED",
      "ticket",
      ticket.id,
      { ticketId: ticket.id, reason, recalledBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  /**
   * Recalls an individual item on a ticket back into preparing state.
   */
  async recallTicketItem(
    sessionId: string,
    ticketId: string,
    orderItemId: string,
    reason: string = "Item rework",
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const ticket = session.tickets.find((t) => t.id === ticketId);
    if (!ticket) throw new Error(`Ticket ${ticketId} not found`);

    const ticketItem = ticket.items.find((i) => i.orderItemId === orderItemId);
    if (!ticketItem) throw new Error(`Item ${orderItemId} not found in ticket ${ticketId}`);

    const now = new Date().toISOString();
    ticketItem.status = "preparing";
    ticketItem.recalledAt = now;
    ticket.status = "in_prep";

    const orderItem = session.items.find((i) => i.id === orderItemId);
    if (orderItem && orderItem.status !== "voided") {
      orderItem.status = "preparing";
    }

    await this.emit(
      session,
      "TICKET_ITEM_RECALLED",
      "item",
      orderItemId,
      { ticketId, orderItemId, reason, recalledBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  /**
   * Expo Master action: marks all ready station tickets for a table's course as delivered to the floor.
   */
  async deliverExpoCourse(
    sessionId: string,
    course: Course,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const courseTickets = session.tickets.filter((t) => t.course === course && t.status !== "cancelled");

    for (const ticket of courseTickets) {
      await this.deliverTicketItems(
        sessionId,
        ticket.id,
        ticket.items.map((i) => i.orderItemId),
        ctx
      );
    }

    return { session, projection: projectTableSession(session) };
  }

  async createGuestRequest(
    sessionId: string,
    rawCategoryOrType: RequestCategory | string,
    descriptionOrNotes?: string,
    dinerId?: string,
    ctx: CommandContext = { actorType: "guest" }
  ): Promise<{ session: TableSession; request: GuestRequest; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const cached = this.checkIdempotency<GuestRequest>(session, ctx.idempotencyKey);
    if (cached) {
      return { session, request: cached, projection: projectTableSession(session) };
    }

    const category = normalizeRequestCategory(rawCategoryOrType);
    const reqId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const diner = session.diners.find((d) => d.id === dinerId);
    const routing = routeRequest(category, { assignedServerId: session.assignedServerId });

    const request: GuestRequest = {
      id: reqId,
      sessionId: session.id,
      tableId: session.tableId,
      tableLabel: session.tableLabel,
      diningAreaId: session.diningAreaId,
      dinerId,
      dinerName: diner?.displayName,
      category,
      type: category,
      description: descriptionOrNotes,
      notes: descriptionOrNotes,
      priority: routing.priority,
      status: "OPEN",
      assignedRole: routing.assignedRole,
      assignedEmployeeId: routing.assignedEmployeeId,
      escalationState: "NORMAL",
      createdAt: new Date().toISOString()
    };

    session.requests.push(request);
    this.recordIdempotency(session, ctx.idempotencyKey, request);

    await this.emit(
      session,
      "REQUEST_CREATED",
      "request",
      request.id,
      {
        requestId: request.id,
        category: request.category,
        priority: request.priority,
        assignedRole: request.assignedRole,
        assignedEmployeeId: request.assignedEmployeeId,
        dinerName: request.dinerName,
        description: request.description
      },
      ctx
    );

    await this.repo.save(session);
    return { session, request, projection: projectTableSession(session) };
  }

  async acknowledgeGuestRequest(
    sessionId: string,
    requestId: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; request: GuestRequest; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const request = session.requests.find((r) => r.id === requestId);
    if (!request) throw new Error(`Request ${requestId} not found`);
    if (request.status === "COMPLETED" || request.status === "CANCELLED") {
      throw new Error(`Cannot acknowledge request ${requestId} in status ${request.status}`);
    }

    request.status = "ACKNOWLEDGED";
    request.acknowledgedAt = new Date().toISOString();
    request.acknowledgedByEmployeeId = ctx.actorId;
    if (ctx.actorId && !request.assignedEmployeeId) {
      request.assignedEmployeeId = ctx.actorId;
    }

    await this.emit(
      session,
      "REQUEST_ACKNOWLEDGED",
      "request",
      request.id,
      { requestId: request.id, acknowledgedBy: ctx.actorId, assignedEmployeeId: request.assignedEmployeeId },
      ctx
    );

    await this.repo.save(session);
    return { session, request, projection: projectTableSession(session) };
  }

  async claimGuestRequest(
    sessionId: string,
    requestId: string,
    employeeId: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; request: GuestRequest; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const request = session.requests.find((r) => r.id === requestId);
    if (!request) throw new Error(`Request ${requestId} not found`);
    if (request.status === "COMPLETED" || request.status === "CANCELLED") {
      throw new Error(`Cannot claim request ${requestId} in status ${request.status}`);
    }

    request.assignedEmployeeId = employeeId;
    if (request.status === "OPEN") {
      request.status = "ACKNOWLEDGED";
      request.acknowledgedAt = new Date().toISOString();
      request.acknowledgedByEmployeeId = ctx.actorId;
    }

    await this.emit(
      session,
      "REQUEST_CLAIMED",
      "request",
      request.id,
      { requestId: request.id, assignedEmployeeId: employeeId, claimedBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, request, projection: projectTableSession(session) };
  }

  async startGuestRequest(
    sessionId: string,
    requestId: string,
    employeeId?: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; request: GuestRequest; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const request = session.requests.find((r) => r.id === requestId);
    if (!request) throw new Error(`Request ${requestId} not found`);
    if (request.status === "COMPLETED" || request.status === "CANCELLED") {
      throw new Error(`Cannot start request ${requestId} in status ${request.status}`);
    }

    request.status = "IN_PROGRESS";
    request.inProgressAt = new Date().toISOString();
    request.inProgressByEmployeeId = employeeId ?? ctx.actorId;
    if (employeeId) request.assignedEmployeeId = employeeId;

    await this.emit(
      session,
      "REQUEST_IN_PROGRESS",
      "request",
      request.id,
      { requestId: request.id, inProgressBy: request.inProgressByEmployeeId },
      ctx
    );

    await this.repo.save(session);
    return { session, request, projection: projectTableSession(session) };
  }

  async completeGuestRequest(
    sessionId: string,
    requestId: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; request: GuestRequest; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const request = session.requests.find((r) => r.id === requestId);
    if (!request) throw new Error(`Request ${requestId} not found`);
    if (request.status === "COMPLETED") {
      return { session, request, projection: projectTableSession(session) };
    }
    if (request.status === "CANCELLED") {
      throw new Error(`Cannot complete cancelled request ${requestId}`);
    }

    request.status = "COMPLETED";
    request.completedAt = new Date().toISOString();
    request.completedByEmployeeId = ctx.actorId;

    await this.emit(
      session,
      "REQUEST_COMPLETED",
      "request",
      request.id,
      { requestId: request.id, completedBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, request, projection: projectTableSession(session) };
  }

  async cancelGuestRequest(
    sessionId: string,
    requestId: string,
    reason: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; request: GuestRequest; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const request = session.requests.find((r) => r.id === requestId);
    if (!request) throw new Error(`Request ${requestId} not found`);
    if (request.status === "COMPLETED") {
      throw new Error(`Cannot cancel completed request ${requestId}`);
    }

    request.status = "CANCELLED";
    request.cancelledAt = new Date().toISOString();
    request.cancelledByEmployeeId = ctx.actorId;
    request.cancellationReason = reason;

    await this.emit(
      session,
      "REQUEST_CANCELLED",
      "request",
      request.id,
      { requestId: request.id, reason, cancelledBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, request, projection: projectTableSession(session) };
  }

  async escalateGuestRequest(
    sessionId: string,
    requestId: string,
    reason?: string,
    ctx: CommandContext = { actorType: "system" }
  ): Promise<{ session: TableSession; request: GuestRequest; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const request = session.requests.find((r) => r.id === requestId);
    if (!request) throw new Error(`Request ${requestId} not found`);

    request.escalationState = "ESCALATED";
    request.escalatedAt = new Date().toISOString();

    await this.emit(
      session,
      "REQUEST_ESCALATED",
      "request",
      request.id,
      { requestId: request.id, reason: reason || "Response target exceeded" },
      ctx
    );

    await this.repo.save(session);
    return { session, request, projection: projectTableSession(session) };
  }

  async resolveEscalation(
    sessionId: string,
    requestId: string,
    resolution: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; request: GuestRequest; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const request = session.requests.find((r) => r.id === requestId);
    if (!request) throw new Error(`Request ${requestId} not found`);

    request.status = "COMPLETED";
    request.completedAt = new Date().toISOString();
    request.completedByEmployeeId = ctx.actorId;
    request.notes = resolution;

    await this.emit(
      session,
      "ESCALATION_RESOLVED",
      "request",
      request.id,
      { requestId: request.id, resolution, resolvedBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, request, projection: projectTableSession(session) };
  }

  async createCheck(
    sessionId: string,
    title: string,
    dinerIds: string[] = [],
    taxRatePercent = 8.25,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; check: Check; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const checkId = `chk_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const billableItems = session.items.filter(
      (i) => i.status !== "voided" && i.status !== "proposed"
    );

    // If dinerIds specified, filter items belonging to those diners, otherwise all table items
    const relevantItems = dinerIds.length > 0
      ? billableItems.filter((i) => i.dinerId && dinerIds.includes(i.dinerId))
      : billableItems;

    const subtotalCents = relevantItems.reduce(
      (acc, i) => acc + (i.basePriceCents + i.selectedModifiers.reduce((mAcc, m) => mAcc + m.priceCents, 0)) * i.quantity,
      0
    );
    const taxCents = Math.round((subtotalCents * taxRatePercent) / 100);
    const totalCents = subtotalCents + taxCents;

    const check: Check = {
      id: checkId,
      sessionId: session.id,
      title,
      dinerIds,
      items: relevantItems.map((i) => ({
        orderItemId: i.id,
        name: i.name,
        cents: (i.basePriceCents + i.selectedModifiers.reduce((mAcc, m) => mAcc + m.priceCents, 0)) * i.quantity,
        dinerId: i.dinerId
      })),
      subtotalCents,
      taxCents,
      tipCents: 0,
      totalCents,
      paidCents: 0,
      balanceCents: totalCents,
      status: "presented",
      createdAt: new Date().toISOString()
    };

    session.checks.push(check);
    await this.emit(
      session,
      "CHECK_CREATED",
      "check",
      check.id,
      { checkId: check.id, title, totalCents, dinerCount: dinerIds.length },
      ctx
    );

    await this.repo.save(session);
    return { session, check, projection: projectTableSession(session) };
  }

  async claimCheck(
    sessionId: string,
    checkId: string,
    dinerId: string,
    ctx: CommandContext = { actorType: "guest" }
  ): Promise<{ session: TableSession; check: Check; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const check = session.checks.find((c) => c.id === checkId);
    if (!check) throw new Error(`Check ${checkId} not found`);

    if (!check.dinerIds.includes(dinerId)) {
      check.dinerIds.push(dinerId);
    }
    check.status = "settling";

    await this.emit(
      session,
      "CHECK_CLAIMED",
      "check",
      check.id,
      { checkId: check.id, claimedByDinerId: dinerId },
      ctx
    );

    await this.repo.save(session);
    return { session, check, projection: projectTableSession(session) };
  }

  async processPayment(
    sessionId: string,
    checkId: string,
    amountCents: number,
    tipCents = 0,
    providerReference?: string,
    ctx: CommandContext = { actorType: "guest" }
  ): Promise<{ session: TableSession; payment: Payment; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const check = session.checks.find((c) => c.id === checkId);
    if (!check) throw new Error(`Check ${checkId} not found`);
    if (amountCents <= 0) throw new Error("Payment amount must be positive");

    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await this.emit(
      session,
      "PAYMENT_STARTED",
      "payment",
      paymentId,
      { paymentId, checkId, amountCents, tipCents },
      ctx
    );

    const payment: Payment = {
      id: paymentId,
      checkId,
      sessionId: session.id,
      amountCents,
      tipCents,
      method: "card",
      provider: "mock_gateway",
      providerReference: providerReference ?? `mock_ref_${Date.now()}`,
      status: "authorized",
      actorType: ctx.actorType,
      actorId: ctx.actorId,
      createdAt: new Date().toISOString()
    };

    session.payments.push(payment);

    check.paidCents += amountCents;
    check.tipCents += tipCents;
    check.balanceCents = Math.max(0, check.totalCents - check.paidCents);
    if (check.balanceCents === 0) {
      check.status = "closed";
      check.closedAt = new Date().toISOString();
    }

    await this.emit(
      session,
      "PAYMENT_COMPLETED",
      "payment",
      payment.id,
      {
        paymentId: payment.id,
        checkId,
        amountCents,
        tipCents,
        remainingBalanceCents: check.balanceCents
      },
      ctx
    );

    await this.repo.save(session);
    return { session, payment, projection: projectTableSession(session) };
  }

  async processDinerPayment(
    sessionId: string,
    dinerId: string,
    amountCents: number,
    tipCents = 0,
    providerReference?: string,
    ctx: CommandContext = { actorType: "guest" }
  ): Promise<{ session: TableSession; payment: Payment; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const cached = this.checkIdempotency<Payment>(session, ctx.idempotencyKey);
    if (cached) {
      return { session, payment: cached, projection: projectTableSession(session) };
    }

    if (amountCents <= 0) throw new Error("Payment amount must be positive");

    // Ensure or find a check for this diner
    let check = session.checks.find((c) => c.dinerIds.includes(dinerId) && c.balanceCents > 0);
    if (!check) {
      const diner = session.diners.find((d) => d.id === dinerId);
      const { check: newCheck } = await this.createCheck(
        session.id,
        `${diner?.displayName || "Diner"} Check`,
        [dinerId],
        8.25,
        ctx
      );
      check = newCheck;
    }

    const paymentId = `pay_diner_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    await this.emit(
      session,
      "PAYMENT_STARTED",
      "payment",
      paymentId,
      { paymentId, checkId: check.id, dinerId, amountCents, tipCents },
      ctx
    );

    const payment: Payment = {
      id: paymentId,
      checkId: check.id,
      sessionId: session.id,
      dinerId,
      amountCents,
      tipCents,
      method: "card",
      provider: "mock_gateway",
      providerReference: providerReference ?? `mock_ref_diner_${Date.now()}`,
      status: "authorized",
      actorType: ctx.actorType,
      actorId: dinerId,
      createdAt: new Date().toISOString()
    };

    session.payments.push(payment);
    this.recordIdempotency(session, ctx.idempotencyKey, payment);

    check.paidCents += amountCents;
    check.tipCents += tipCents;
    check.balanceCents = Math.max(0, check.totalCents - check.paidCents);
    if (check.balanceCents === 0) {
      check.status = "closed";
      check.closedAt = new Date().toISOString();
    }

    await this.emit(
      session,
      "DINER_PAYMENT_PROCESSED",
      "payment",
      payment.id,
      {
        paymentId: payment.id,
        checkId: check.id,
        dinerId,
        amountCents,
        tipCents,
        remainingCheckBalance: check.balanceCents
      },
      ctx
    );

    await this.repo.save(session);
    return { session, payment, projection: projectTableSession(session) };
  }

  async closeTableSession(
    sessionId: string,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    if (ctx.actorType === "guest") {
      throw new Error("Permission denied: Guests cannot close table sessions");
    }
    const session = await this.mustGetSession(sessionId);
    if (session.closedAt) {
      throw new Error(`Session ${sessionId} is already closed`);
    }

    const { unpaidBalanceCents } = deriveFinancials(session.items, session.payments);
    if (unpaidBalanceCents > 0) {
      throw new Error(`Cannot close table session with unpaid balance of ${unpaidBalanceCents} cents`);
    }

    const openRequests = session.requests.filter(
      (r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS"
    );
    if (openRequests.length > 0) {
      throw new Error(`Cannot close table with ${openRequests.length} uncompleted guest requests`);
    }

    session.closedAt = new Date().toISOString();

    await this.emit(
      session,
      "TABLE_CLOSED",
      "session",
      session.id,
      { closedAt: session.closedAt, closedBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  async setStage(
    sessionId: string,
    stage: DiningStage,
    ctx: CommandContext = { actorType: "employee" }
  ): Promise<{ session: TableSession; projection: TableSessionProjection }> {
    const session = await this.mustGetSession(sessionId);
    const prevStage = deriveDiningStage(session);
    session.manualStageOverride = stage;

    await this.emit(
      session,
      "STAGE_CHANGED",
      "session",
      session.id,
      { fromStage: prevStage, toStage: stage, setBy: ctx.actorId },
      ctx
    );

    await this.repo.save(session);
    return { session, projection: projectTableSession(session) };
  }

  private async mustGetSession(sessionId: string): Promise<TableSession> {
    const session = await this.repo.findById(sessionId);
    if (!session) throw new Error(`Table session ${sessionId} not found`);
    return session;
  }
}
