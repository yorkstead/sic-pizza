import { z } from "zod";

export const requestCategorySchema = z.enum([
  "SERVER_NEEDED",
  "DRINK_REORDER",
  "REFILL",
  "CONDIMENT",
  "TO_GO_BOX",
  "UTENSILS",
  "CHECK",
  "MISSING_ITEM",
  "FOOD_ISSUE",
  "OTHER"
]);
export type RequestCategory = z.infer<typeof requestCategorySchema>;

// Backward compatibility alias for legacy call sites
export type RequestType = RequestCategory;

export const requestPrioritySchema = z.enum(["LOW", "NORMAL", "HIGH", "URGENT"]);
export type RequestPriority = z.infer<typeof requestPrioritySchema>;

export const requestStatusSchema = z.enum([
  "OPEN",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED"
]);
export type RequestStatus = z.infer<typeof requestStatusSchema>;

export const escalationStateSchema = z.enum(["NORMAL", "OVERDUE", "ESCALATED"]);
export type EscalationState = z.infer<typeof escalationStateSchema>;

export const guestRequestSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  tableId: z.string(),
  tableLabel: z.string(),
  diningAreaId: z.string().optional(),
  diningAreaName: z.string().optional(),
  dinerId: z.string().optional(),
  dinerName: z.string().optional(),
  category: requestCategorySchema,
  description: z.string().max(300).optional(),
  priority: requestPrioritySchema.default("NORMAL"),
  status: requestStatusSchema.default("OPEN"),
  assignedRole: z.enum(["server", "runner", "bartender", "expo", "manager"]).default("server"),
  assignedEmployeeId: z.string().optional(),
  assignedEmployeeName: z.string().optional(),
  createdAt: z.string(),
  acknowledgedAt: z.string().optional(),
  acknowledgedByEmployeeId: z.string().optional(),
  inProgressAt: z.string().optional(),
  inProgressByEmployeeId: z.string().optional(),
  completedAt: z.string().optional(),
  completedByEmployeeId: z.string().optional(),
  cancelledAt: z.string().optional(),
  cancelledByEmployeeId: z.string().optional(),
  cancellationReason: z.string().optional(),
  escalationState: escalationStateSchema.default("NORMAL"),
  escalatedAt: z.string().optional(),
  // Backward compatibility alias
  type: requestCategorySchema.optional(),
  notes: z.string().optional()
});
export type GuestRequest = z.infer<typeof guestRequestSchema>;

/**
 * Normalizes legacy request types (e.g. water_refill, call_server, drop_check) to standard categories.
 */
export function normalizeRequestCategory(raw: string): RequestCategory {
  const clean = raw.trim().toUpperCase();
  if (requestCategorySchema.safeParse(clean).success) {
    return clean as RequestCategory;
  }

  const legacyMap: Record<string, RequestCategory> = {
    WATER_REFILL: "REFILL",
    WATER: "REFILL",
    CALL_SERVER: "SERVER_NEEDED",
    HELP: "SERVER_NEEDED",
    CONDIMENTS: "CONDIMENT",
    SAUCE: "CONDIMENT",
    DROP_CHECK: "CHECK",
    BILL: "CHECK",
    PAYMENT: "CHECK",
    CUTLERY: "UTENSILS",
    FORK: "UTENSILS",
    BOX: "TO_GO_BOX",
    TAKEOUT_BOX: "TO_GO_BOX",
    SPILL_CLEANUP: "OTHER",
    CUSTOM: "OTHER"
  };

  return legacyMap[clean] || "OTHER";
}

export interface RoutingRule {
  assignedRole: "server" | "runner" | "bartender" | "expo" | "manager";
  priority: RequestPriority;
  maxResponseMinutes: number;
}

/**
 * Deterministic routing rules for operational requests.
 */
export function routeRequest(
  category: RequestCategory,
  options?: { assignedServerId?: string }
): RoutingRule & { assignedEmployeeId?: string } {
  switch (category) {
    case "FOOD_ISSUE":
      return {
        assignedRole: "manager",
        priority: "URGENT",
        maxResponseMinutes: 3,
        assignedEmployeeId: options?.assignedServerId
      };

    case "MISSING_ITEM":
      return {
        assignedRole: "expo",
        priority: "HIGH",
        maxResponseMinutes: 4,
        assignedEmployeeId: options?.assignedServerId
      };

    case "CHECK":
      return {
        assignedRole: "server",
        priority: "HIGH",
        maxResponseMinutes: 4,
        assignedEmployeeId: options?.assignedServerId
      };

    case "SERVER_NEEDED":
      return {
        assignedRole: "server",
        priority: "HIGH",
        maxResponseMinutes: 4,
        assignedEmployeeId: options?.assignedServerId
      };

    case "DRINK_REORDER":
      return {
        assignedRole: "server",
        priority: "NORMAL",
        maxResponseMinutes: 5,
        assignedEmployeeId: options?.assignedServerId
      };

    case "REFILL":
      return {
        assignedRole: "runner",
        priority: "NORMAL",
        maxResponseMinutes: 6
      };

    case "CONDIMENT":
      return {
        assignedRole: "runner",
        priority: "NORMAL",
        maxResponseMinutes: 6
      };

    case "UTENSILS":
      return {
        assignedRole: "runner",
        priority: "NORMAL",
        maxResponseMinutes: 5
      };

    case "TO_GO_BOX":
      return {
        assignedRole: "runner",
        priority: "LOW",
        maxResponseMinutes: 10
      };

    case "OTHER":
    default:
      return {
        assignedRole: "server",
        priority: "NORMAL",
        maxResponseMinutes: 8,
        assignedEmployeeId: options?.assignedServerId
      };
  }
}

/**
 * Calculates age of a request in elapsed minutes.
 */
export function deriveRequestAgeMinutes(
  createdAt: string,
  completedAt?: string,
  now = new Date()
): number {
  const start = new Date(createdAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : now.getTime();
  return Math.max(0, Math.floor((end - start) / 60000));
}

/**
 * Derives escalation state based on elapsed wait time and priority thresholds.
 */
export function deriveRequestEscalation(
  request: GuestRequest,
  now = new Date()
): EscalationState {
  if (request.status === "COMPLETED" || request.status === "CANCELLED") {
    return "NORMAL";
  }

  const age = deriveRequestAgeMinutes(request.createdAt, undefined, now);
  const rule = routeRequest(request.category);

  if (age >= rule.maxResponseMinutes * 2) {
    return "ESCALATED";
  }
  if (age >= rule.maxResponseMinutes) {
    return "OVERDUE";
  }
  return "NORMAL";
}
