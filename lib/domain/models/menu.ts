import { z } from "zod";

export const courseSchema = z.enum(["drinks", "starters", "mains", "desserts"]);
export type Course = z.infer<typeof courseSchema>;

export const modifierOptionSchema = z.object({
  id: z.string(),
  modifierGroupId: z.string(),
  name: z.string().min(1),
  priceCents: z.number().int().nonnegative().default(0),
  isDefault: z.boolean().default(false),
  allergens: z.array(z.string()).default([])
});
export type ModifierOption = z.infer<typeof modifierOptionSchema>;

export const modifierGroupSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  minSelection: z.number().int().nonnegative().default(0),
  maxSelection: z.number().int().positive().default(1),
  isRequired: z.boolean().default(false),
  options: z.array(modifierOptionSchema).default([])
});
export type ModifierGroup = z.infer<typeof modifierGroupSchema>;

export const menuItemSchema = z.object({
  id: z.string(),
  menuId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  course: courseSchema.default("mains"),
  stationId: z.string().default("kitchen"), // routes to kitchen station
  basePriceCents: z.number().int().nonnegative(),
  modifierGroups: z.array(modifierGroupSchema).default([]),
  allergens: z.array(z.string()).default([]),
  available: z.boolean().default(true)
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const menuSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  name: z.string().min(1),
  servicePeriodIds: z.array(z.string()).default([]),
  isDefault: z.boolean().default(false),
  items: z.array(menuItemSchema).default([]),
  active: z.boolean().default(true)
});
export type Menu = z.infer<typeof menuSchema>;
