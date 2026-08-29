import { z } from "zod";

export const actorTypeSchema = z.enum(["employee", "guest", "system"]);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const domainEventTypeSchema = z.enum([
  "TABLE_OPENED",
  "DINER_ADDED",
  "DINER_REMOVED",
  "TABLE_TRANSFERRED",
  "ITEM_PROPOSED",
  "ITEM_APPROVED",
  "ITEM_ADDED",
  "ITEM_MODIFIED",
  "ITEM_OWNERSHIP_UPDATED",
  "ITEM_CLAIMED",
  "ITEM_UNCLAIMED",
  "ITEM_VOIDED",
  "COURSE_FIRED",
  "TICKET_CREATED",
  "TICKET_ACCEPTED",
  "TICKET_RECALLED",
  "ITEM_STARTED",
  "ITEM_READY",
  "ITEM_DELIVERED",
  "TICKET_ITEM_RECALLED",
  "REQUEST_CREATED",
  "REQUEST_ACKNOWLEDGED",
  "REQUEST_CLAIMED",
  "REQUEST_IN_PROGRESS",
  "REQUEST_COMPLETED",
  "REQUEST_CANCELLED",
  "REQUEST_ESCALATED",
  "CHECK_CREATED",
  "CHECK_CLAIMED",
  "PAYMENT_STARTED",
  "PAYMENT_COMPLETED",
  "DINER_PAYMENT_PROCESSED",
  "STAGE_CHANGED",
  "TABLE_CLOSED"
]);
export type DomainEventType = z.infer<typeof domainEventTypeSchema>;

export const domainEventSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  locationId: z.string(),
  sessionId: z.string(),
  aggregateType: z.enum(["session", "order", "item", "ticket", "request", "check", "payment"]),
  aggregateId: z.string(),
  type: domainEventTypeSchema,
  actorType: actorTypeSchema,
  actorId: z.string().optional(),
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown()),
  idempotencyKey: z.string().optional()
});
export type DomainEvent = z.infer<typeof domainEventSchema>;

export function createDomainEvent(params: {
  id?: string;
  restaurantId: string;
  locationId: string;
  sessionId: string;
  aggregateType: DomainEvent["aggregateType"];
  aggregateId: string;
  type: DomainEventType;
  actorType: ActorType;
  actorId?: string;
  timestamp?: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
}): DomainEvent {
  const genId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  return {
    id: params.id ?? genId,
    restaurantId: params.restaurantId,
    locationId: params.locationId,
    sessionId: params.sessionId,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    type: params.type,
    actorType: params.actorType,
    actorId: params.actorId,
    timestamp: params.timestamp ?? new Date().toISOString(),
    payload: params.payload,
    idempotencyKey: params.idempotencyKey
  };
}
