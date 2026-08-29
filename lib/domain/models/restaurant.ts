import { z } from "zod";

export const restaurantSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  currency: z.string().default("USD"),
  timezone: z.string().default("America/New_York"),
  createdAt: z.string(),
  updatedAt: z.string()
});
export type Restaurant = z.infer<typeof restaurantSchema>;

export const locationSchema = z.object({
  id: z.string(),
  restaurantId: z.string(),
  name: z.string().min(1),
  address: z.string().optional(),
  timezone: z.string().default("America/New_York"),
  active: z.boolean().default(true),
  taxRatePercent: z.number().nonnegative().default(8.25),
  createdAt: z.string()
});
export type Location = z.infer<typeof locationSchema>;

export const diningAreaSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  name: z.string().min(1), // e.g. "Main Dining Room", "Patio", "Bar Area"
  code: z.string(),
  sortOrder: z.number().int().default(0)
});
export type DiningArea = z.infer<typeof diningAreaSchema>;

export const tableStatusSchema = z.enum(["available", "occupied", "reserved", "dirty"]);
export type TableStatus = z.infer<typeof tableStatusSchema>;

export const diningTableSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  diningAreaId: z.string(),
  label: z.string().min(1), // e.g. "Table 11", "Bar 03"
  capacity: z.number().int().positive(),
  status: tableStatusSchema.default("available"),
  activeSessionId: z.string().optional()
});
export type DiningTable = z.infer<typeof diningTableSchema>;

export const servicePeriodSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  name: z.string().min(1), // e.g. "Lunch", "Dinner", "Late Night", "Brunch"
  startTime: z.string(), // "11:00"
  endTime: z.string(),   // "16:00"
  active: z.boolean().default(true)
});
export type ServicePeriod = z.infer<typeof servicePeriodSchema>;
