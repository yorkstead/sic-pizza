import { z } from "zod";
import { courseTypeSchema } from "../core/types";

export const kitchenStationSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
  color: z.string().optional()
});
export type KitchenStation = z.infer<typeof kitchenStationSchema>;

export const courseDefinitionSchema = z.object({
  id: courseTypeSchema,
  label: z.string(),
  sortOrder: z.number().int(),
  targetPacingMinutes: z.number().int().optional()
});
export type CourseDefinition = z.infer<typeof courseDefinitionSchema>;

export const restaurantConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  tagline: z.string().optional(),
  currency: z.string().default("USD"),
  taxRatePercent: z.number().nonnegative().default(8.25),
  stations: z.array(kitchenStationSchema),
  courses: z.array(courseDefinitionSchema),
  features: z.object({
    enableGuestOrdering: z.boolean().default(true),
    requireServerApprovalForGuests: z.boolean().default(true),
    enableTableAssistanceRequests: z.boolean().default(true),
    enableEqualSplit: z.boolean().default(true),
    enableItemizedSplit: z.boolean().default(true)
  })
});
export type RestaurantConfig = z.infer<typeof restaurantConfigSchema>;
