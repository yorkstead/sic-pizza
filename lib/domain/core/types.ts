import { z } from "zod";

export const actorTypeSchema = z.enum(["employee", "guest", "system"]);
export type ActorType = z.infer<typeof actorTypeSchema>;

export const employeeRoleSchema = z.enum([
  "server",
  "bartender",
  "runner",
  "kitchen",
  "expo",
  "manager",
  "admin"
]);
export type EmployeeRole = z.infer<typeof employeeRoleSchema>;

export const courseTypeSchema = z.enum(["drinks", "starters", "mains", "desserts"]);
export type CourseType = z.infer<typeof courseTypeSchema>;

export const itemStatusSchema = z.enum([
  "draft",
  "proposed",
  "confirmed",
  "held",
  "fired",
  "preparing",
  "ready",
  "delivered",
  "voided"
]);
export type ItemStatus = z.infer<typeof itemStatusSchema>;

export const orderStatusSchema = z.enum([
  "draft",
  "submitted",
  "making",
  "ready",
  "served",
  "paid"
]);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export type MoneyCents = number;
