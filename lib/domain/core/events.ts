import { z } from "zod";
import { actorTypeSchema } from "./types";

export const domainEventSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  sessionId: z.string(),
  aggregateType: z.enum(["session", "order", "item", "kitchen", "service_task", "payment"]),
  aggregateId: z.string(),
  type: z.string(),
  actorType: actorTypeSchema,
  actorId: z.string().optional(),
  occurredAt: z.string(),
  version: z.number().int().nonnegative().default(1),
  payload: z.record(z.string(), z.unknown())
});

export type DomainEventEnvelope<TPayload = Record<string, unknown>> = Omit<
  z.infer<typeof domainEventSchema>,
  "payload"
> & {
  payload: TPayload;
};

export function createEventEnvelope<TPayload extends Record<string, unknown>>(
  params: Omit<DomainEventEnvelope<TPayload>, "id" | "occurredAt"> & {
    id?: string;
    occurredAt?: string;
  }
): DomainEventEnvelope<TPayload> {
  return {
    id: params.id ?? (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`),
    occurredAt: params.occurredAt ?? new Date().toISOString(),
    locationId: params.locationId,
    sessionId: params.sessionId,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    type: params.type,
    actorType: params.actorType,
    actorId: params.actorId,
    version: params.version ?? 1,
    payload: params.payload
  };
}
