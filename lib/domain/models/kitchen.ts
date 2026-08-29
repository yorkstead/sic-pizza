import { z } from "zod";
import { courseSchema } from "./menu";

export const kitchenStationSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  name: z.string().min(1), // e.g. "Pizza Oven", "Bar", "Sauté", "Cold Prep", "Expo"
  code: z.string(),
  color: z.string().optional()
});
export type KitchenStation = z.infer<typeof kitchenStationSchema>;

export const ticketStatusSchema = z.enum([
  "queued",
  "accepted",
  "in_prep",
  "ready",
  "delivered",
  "cancelled"
]);
export type TicketStatus = z.infer<typeof ticketStatusSchema>;

export const ticketItemStatusSchema = z.enum([
  "queued",
  "preparing",
  "ready",
  "delivered",
  "voided"
]);
export type TicketItemStatus = z.infer<typeof ticketItemStatusSchema>;

export const ticketItemSchema = z.object({
  orderItemId: z.string(),
  name: z.string(),
  quantity: z.number().int().positive(),
  course: courseSchema,
  modifiers: z.array(z.string()).default([]),
  specialInstructions: z.string().optional(),
  status: ticketItemStatusSchema.default("queued"),
  seatNumber: z.number().int().optional(),
  dinerName: z.string().optional()
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
  readyAt: z.string().optional(),
  deliveredAt: z.string().optional()
});
export type KitchenTicket = z.infer<typeof kitchenTicketSchema>;
