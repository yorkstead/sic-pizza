import { z } from "zod";
import { courseSchema, type Course } from "./menu";

export const STATION_CODES = [
  "pizza",
  "grill",
  "fry",
  "salad",
  "bar",
  "dessert",
  "expo"
] as const;
export type StationCode = (typeof STATION_CODES)[number] | (string & {});

export const kitchenStationSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  name: z.string().min(1), // e.g. "Pizza Oven", "Grill", "Fry", "Salad / Cold Prep", "Bar", "Dessert", "Expo"
  code: z.string(),
  color: z.string().optional()
});
export type KitchenStation = z.infer<typeof kitchenStationSchema>;

export const STANDARD_KITCHEN_STATIONS: KitchenStation[] = [
  { id: "expo", locationId: "loc_main", name: "Expo / Quality Control", code: "EXPO", color: "purple" },
  { id: "pizza", locationId: "loc_main", name: "Pizza Oven Station", code: "PIZZA", color: "red" },
  { id: "grill", locationId: "loc_main", name: "Grill Station", code: "GRILL", color: "orange" },
  { id: "fry", locationId: "loc_main", name: "Fry Station", code: "FRY", color: "amber" },
  { id: "salad", locationId: "loc_main", name: "Salad / Cold Prep", code: "SALAD", color: "emerald" },
  { id: "bar", locationId: "loc_main", name: "Beverage Bar", code: "BAR", color: "cyan" },
  { id: "dessert", locationId: "loc_main", name: "Dessert & Pastry", code: "DESSERT", color: "pink" }
];

export const ticketStatusSchema = z.enum([
  "queued",
  "accepted",
  "in_prep",
  "ready",
  "delivered",
  "recalled",
  "cancelled"
]);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketItemStatusSchema = z.enum([
  "queued",
  "preparing",
  "ready",
  "delivered",
  "recalled",
  "voided"
]);
export type TicketItemStatus = z.infer<typeof ticketItemStatusSchema>;

export const ticketItemSchema = z.object({
  orderItemId: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  course: courseSchema,
  stationId: z.string().default("pizza"),
  modifiers: z.array(z.string()).default([]),
  specialInstructions: z.string().optional(),
  allergens: z.array(z.string()).default([]),
  hasAllergens: z.boolean().default(false),
  status: ticketItemStatusSchema.default("queued"),
  seatNumber: z.number().int().optional(),
  dinerName: z.string().optional(),
  startedAt: z.string().optional(),
  readyAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  recalledAt: z.string().optional()
});
export type TicketItem = z.infer<typeof ticketItemSchema>;

export const kitchenTicketSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  orderId: z.string(),
  stationId: z.string(),
  tableLabel: z.string(),
  course: courseSchema,
  status: ticketStatusSchema.default("queued"),
  items: z.array(ticketItemSchema),
  createdAt: z.string(),
  acceptedAt: z.string().optional(),
  startedAt: z.string().optional(),
  readyAt: z.string().optional(),
  deliveredAt: z.string().optional(),
  recalledAt: z.string().optional(),
  recallReason: z.string().optional()
});
export type KitchenTicket = z.infer<typeof kitchenTicketSchema>;

/**
 * Consolidated view of all station tickets for a table/order at the Expo station.
 */
export interface ExpoOrderProjection {
  orderId: string;
  sessionId: string;
  tableLabel: string;
  course: Course;
  createdAt: string;
  ageMinutes: number;
  stationTickets: {
    stationId: string;
    stationName: string;
    ticketId: string;
    status: TicketStatus;
    items: TicketItem[];
    isReady: boolean;
  }[];
  totalItemsCount: number;
  readyItemsCount: number;
  isAllStationsReady: boolean;
  isDelivered: boolean;
}

/**
 * Derives consolidated Expo projections across all table tickets.
 */
export function deriveExpoOrderProjections(
  tickets: readonly KitchenTicket[],
  now: Date = new Date()
): ExpoOrderProjection[] {
  const groups = new Map<string, KitchenTicket[]>();

  for (const ticket of tickets) {
    const key = `${ticket.sessionId}:${ticket.course}`;
    const list = groups.get(key) || [];
    list.push(ticket);
    groups.set(key, list);
  }

  const projections: ExpoOrderProjection[] = [];

  groups.forEach((groupTickets) => {
    const first = groupTickets[0];
    if (!first) return;

    const oldestCreatedAt = groupTickets.reduce((oldest, t) => {
      const time = new Date(t.createdAt).getTime();
      return time < oldest ? time : oldest;
    }, new Date(first.createdAt).getTime());

    const ageMinutes = Math.max(0, Math.floor((now.getTime() - oldestCreatedAt) / 60000));

    const stationTickets = groupTickets.map((t) => {
      const station = STANDARD_KITCHEN_STATIONS.find((s) => s.id === t.stationId);
      const isReady = t.status === "ready" || t.status === "delivered";
      return {
        stationId: t.stationId,
        stationName: station?.name || t.stationId.toUpperCase(),
        ticketId: t.id,
        status: t.status,
        items: t.items,
        isReady
      };
    });

    const allItems = groupTickets.flatMap((t) => t.items);
    const totalItemsCount = allItems.length;
    const readyItemsCount = allItems.filter(
      (i) => i.status === "ready" || i.status === "delivered"
    ).length;
    const isAllStationsReady = stationTickets.every((st) => st.isReady);
    const isDelivered = stationTickets.every((st) => st.status === "delivered");

    projections.push({
      orderId: first.orderId,
      sessionId: first.sessionId,
      tableLabel: first.tableLabel,
      course: first.course,
      createdAt: new Date(oldestCreatedAt).toISOString(),
      ageMinutes,
      stationTickets,
      totalItemsCount,
      readyItemsCount,
      isAllStationsReady,
      isDelivered
    });
  });

  return projections.sort((a, b) => b.ageMinutes - a.ageMinutes);
}
