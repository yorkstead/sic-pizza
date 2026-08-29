import { z } from "zod";

export const employeeRoleSchema = z.enum([
  "server",
  "bartender",
  "runner",
  "kitchen",
  "expo",
  "manager",
  "host",
  "admin"
]);
export type EmployeeRole = z.infer<typeof employeeRoleSchema>;

export const employeeSchema = z.object({
  id: z.string(),
  locationId: z.string(),
  displayName: z.string().min(1),
  role: employeeRoleSchema,
  pinHash: z.string(),
  active: z.boolean().default(true),
  createdAt: z.string()
});
export type Employee = z.infer<typeof employeeSchema>;
