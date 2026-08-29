import { z } from "zod";
import type { TableSession } from "./session";
import { deriveDiningStage, deriveFinancials } from "./session";
import { deriveRequestAgeMinutes, deriveRequestEscalation } from "./request";

export const attentionSeveritySchema = z.enum([
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO"
]);
export type AttentionSeverity = z.infer<typeof attentionSeveritySchema>;

export const attentionRuleKeySchema = z.enum([
  "SEATED_NO_DRINKS",
  "GUEST_PROPOSAL_PENDING",
  "REQUEST_UNACKNOWLEDGED",
  "REQUEST_OVERDUE_OR_ESCALATED",
  "FOOD_ISSUE_ALERT",
  "KITCHEN_TICKET_LATE",
  "ITEMS_READY_FOR_DELIVERY",
  "CHECK_REQUESTED_UNSETTLED",
  "TABLE_PAID_UNCLEARED",
  "COURSE_PACING_GAP",
  "DINER_MISSING_ENTREE"
]);
export type AttentionRuleKey = z.infer<typeof attentionRuleKeySchema>;

export interface AttentionConfig {
  locationId: string;
  seatedWithoutDrinksMinutes: number; // default: 4 min
  guestProposalWaitMinutes: number; // default: 2 min
  unacknowledgedRequestMinutes: number; // default: 3 min
  kitchenTicketLateThresholdMinutes: number; // default: 18 min
  readyItemsWaitingMinutes: number; // default: 2 min
  checkRequestedWaitMinutes: number; // default: 3 min
  tablePaidUnclearedMinutes: number; // default: 5 min
  coursePacingGapMinutes: number; // default: 12 min
}

export const DEFAULT_ATTENTION_CONFIG: AttentionConfig = {
  locationId: "default",
  seatedWithoutDrinksMinutes: 4,
  guestProposalWaitMinutes: 2,
  unacknowledgedRequestMinutes: 3,
  kitchenTicketLateThresholdMinutes: 18,
  readyItemsWaitingMinutes: 2,
  checkRequestedWaitMinutes: 3,
  tablePaidUnclearedMinutes: 5,
  coursePacingGapMinutes: 12
};

export interface AttentionItem {
  id: string; // deterministic key: `${ruleKey}:${sessionId}:${targetId}`
  ruleKey: AttentionRuleKey;
  severity: AttentionSeverity;
  tableId: string;
  tableLabel: string;
  sessionId: string;
  assignedServerId?: string;
  dinerId?: string;
  dinerName?: string;
  reason: string;
  details?: string;
  ageMinutes: number;
  recommendedAction: string;
  actionRoute: "orders" | "tasks" | "checks" | "kitchen" | "floor" | "bill" | "diner";
  source: {
    type: "session" | "request" | "ticket" | "item" | "check" | "diner";
    id: string;
  };
  canDismiss: boolean;
  autoResolves: boolean;
  createdAt: string;
}

const SEVERITY_WEIGHT: Record<AttentionSeverity, number> = {
  URGENT: 5,
  HIGH: 4,
  MEDIUM: 3,
  LOW: 2,
  INFO: 1
};

/**
 * Pure deterministic rules evaluation engine converting live table sessions into prioritized actions.
 */
export function evaluateAttentionRules(
  sessions: TableSession[],
  config: Partial<AttentionConfig> = {},
  options: {
    assignedEmployeeId?: string;
    now?: Date;
    dismissedIds?: Set<string>;
  } = {}
): AttentionItem[] {
  const mergedConfig: AttentionConfig = {
    ...DEFAULT_ATTENTION_CONFIG,
    ...config
  };

  const now = options.now ?? new Date();
  const dismissed = options.dismissedIds ?? new Set<string>();
  const items: AttentionItem[] = [];

  for (const session of sessions) {
    if (session.closedAt) continue;

    const openedTime = new Date(session.openedAt).getTime();
    const sessionAgeMinutes = Math.max(0, Math.floor((now.getTime() - openedTime) / 60000));
    const activeItems = session.items.filter((i) => i.status !== "voided");
    const stage = deriveDiningStage(session);

    // ---------------------------------------------------------------------------------
    // 1. FOOD_ISSUE_ALERT: Table has an active, unresolved food problem
    // ---------------------------------------------------------------------------------
    const activeFoodIssues = session.requests.filter(
      (r) =>
        r.category === "FOOD_ISSUE" &&
        r.status !== "COMPLETED" &&
        r.status !== "CANCELLED"
    );
    for (const issue of activeFoodIssues) {
      const age = deriveRequestAgeMinutes(issue.createdAt, issue.completedAt, now);
      items.push({
        id: `FOOD_ISSUE_ALERT:${session.id}:${issue.id}`,
        ruleKey: "FOOD_ISSUE_ALERT",
        severity: "URGENT",
        tableId: session.tableId,
        tableLabel: session.tableLabel,
        sessionId: session.id,
        assignedServerId: session.assignedServerId,
        dinerId: issue.dinerId,
        dinerName: issue.dinerName,
        reason: `Unresolved food quality issue: "${issue.description || "Food Problem"}"`,
        details: `Reported ${age}m ago by ${issue.dinerName || "guest"}. Requires immediate manager or server table visit.`,
        ageMinutes: age,
        recommendedAction: "Visit Table Immediately",
        actionRoute: "tasks",
        source: { type: "request", id: issue.id },
        canDismiss: false,
        autoResolves: true,
        createdAt: issue.createdAt
      });
    }

    // ---------------------------------------------------------------------------------
    // 2. REQUEST_OVERDUE_OR_ESCALATED / REQUEST_UNACKNOWLEDGED
    // ---------------------------------------------------------------------------------
    const activeRequests = session.requests.filter(
      (r) =>
        r.category !== "FOOD_ISSUE" &&
        r.status !== "COMPLETED" &&
        r.status !== "CANCELLED"
    );

    for (const req of activeRequests) {
      const age = deriveRequestAgeMinutes(req.createdAt, req.completedAt, now);
      const escalation = deriveRequestEscalation(req, now);

      if (escalation === "ESCALATED" || escalation === "OVERDUE") {
        items.push({
          id: `REQUEST_OVERDUE_OR_ESCALATED:${session.id}:${req.id}`,
          ruleKey: "REQUEST_OVERDUE_OR_ESCALATED",
          severity: escalation === "ESCALATED" ? "URGENT" : "HIGH",
          tableId: session.tableId,
          tableLabel: session.tableLabel,
          sessionId: session.id,
          assignedServerId: session.assignedServerId,
          dinerId: req.dinerId,
          dinerName: req.dinerName,
          reason: `${req.category.replace(/_/g, " ")} ${escalation.toLowerCase()} (${age}m waiting)`,
          details: req.description || `Assigned to ${req.assignedRole}`,
          ageMinutes: age,
          recommendedAction: req.status === "OPEN" ? "Acknowledge Request" : "Fulfill Request",
          actionRoute: "tasks",
          source: { type: "request", id: req.id },
          canDismiss: false,
          autoResolves: true,
          createdAt: req.createdAt
        });
      } else if (req.status === "OPEN" && age >= mergedConfig.unacknowledgedRequestMinutes) {
        items.push({
          id: `REQUEST_UNACKNOWLEDGED:${session.id}:${req.id}`,
          ruleKey: "REQUEST_UNACKNOWLEDGED",
          severity: req.priority === "HIGH" || req.priority === "URGENT" ? "HIGH" : "MEDIUM",
          tableId: session.tableId,
          tableLabel: session.tableLabel,
          sessionId: session.id,
          assignedServerId: session.assignedServerId,
          dinerId: req.dinerId,
          dinerName: req.dinerName,
          reason: `Guest requested ${req.category.replace(/_/g, " ").toLowerCase()} ${age}m ago`,
          details: req.description,
          ageMinutes: age,
          recommendedAction: "Acknowledge Request",
          actionRoute: "tasks",
          source: { type: "request", id: req.id },
          canDismiss: false,
          autoResolves: true,
          createdAt: req.createdAt
        });
      }
    }

    // ---------------------------------------------------------------------------------
    // 3. GUEST_PROPOSAL_PENDING: Unapproved guest items awaiting server review
    // ---------------------------------------------------------------------------------
    const proposedItems = activeItems.filter((i) => i.status === "proposed");
    if (proposedItems.length > 0) {
      const oldestProposal = proposedItems.reduce((oldest, item) => {
        const itemTime = new Date(item.createdAt).getTime();
        return itemTime < oldest ? itemTime : oldest;
      }, Date.now());
      const proposalAge = Math.max(0, Math.floor((now.getTime() - oldestProposal) / 60000));

      items.push({
        id: `GUEST_PROPOSAL_PENDING:${session.id}`,
        ruleKey: "GUEST_PROPOSAL_PENDING",
        severity: proposalAge >= mergedConfig.guestProposalWaitMinutes ? "HIGH" : "MEDIUM",
        tableId: session.tableId,
        tableLabel: session.tableLabel,
        sessionId: session.id,
        assignedServerId: session.assignedServerId,
        reason: `${proposedItems.length} guest proposal${proposedItems.length > 1 ? "s" : ""} awaiting review`,
        details: proposedItems.map((p) => `${p.quantity}x ${p.name}`).join(", "),
        ageMinutes: proposalAge,
        recommendedAction: "Review Proposals",
        actionRoute: "orders",
        source: { type: "item", id: proposedItems[0].id },
        canDismiss: false,
        autoResolves: true,
        createdAt: new Date(oldestProposal).toISOString()
      });
    }

    // ---------------------------------------------------------------------------------
    // 4. ITEMS_READY_FOR_DELIVERY: Expo/Bar ticket ready for table delivery
    // ---------------------------------------------------------------------------------
    const readyTickets = session.tickets.filter((t) => t.status === "ready");
    for (const ticket of readyTickets) {
      const readyAt = ticket.readyAt ? new Date(ticket.readyAt).getTime() : now.getTime();
      const readyAge = Math.max(0, Math.floor((now.getTime() - readyAt) / 60000));

      if (readyAge >= mergedConfig.readyItemsWaitingMinutes) {
        items.push({
          id: `ITEMS_READY_FOR_DELIVERY:${session.id}:${ticket.id}`,
          ruleKey: "ITEMS_READY_FOR_DELIVERY",
          severity: readyAge >= 5 ? "URGENT" : "HIGH",
          tableId: session.tableId,
          tableLabel: session.tableLabel,
          sessionId: session.id,
          assignedServerId: session.assignedServerId,
          reason: `Station ${ticket.stationId} ticket ready for ${readyAge}m`,
          details: ticket.items.map((i) => `${i.quantity}x ${i.name}`).join(", "),
          ageMinutes: readyAge,
          recommendedAction: "Deliver to Table",
          actionRoute: "kitchen",
          source: { type: "ticket", id: ticket.id },
          canDismiss: false,
          autoResolves: true,
          createdAt: ticket.readyAt || new Date().toISOString()
        });
      }
    }

    // ---------------------------------------------------------------------------------
    // 5. KITCHEN_TICKET_LATE: Ticket exceeds expected preparation time
    // ---------------------------------------------------------------------------------
    const inPrepTickets = session.tickets.filter((t) => t.status === "in_prep" || t.status === "queued" || t.status === "accepted");
    for (const ticket of inPrepTickets) {
      const ticketStart = new Date(ticket.createdAt).getTime();
      const prepMinutes = Math.max(0, Math.floor((now.getTime() - ticketStart) / 60000));

      if (prepMinutes >= mergedConfig.kitchenTicketLateThresholdMinutes) {
        const overtimeMinutes = prepMinutes - mergedConfig.kitchenTicketLateThresholdMinutes;
        items.push({
          id: `KITCHEN_TICKET_LATE:${session.id}:${ticket.id}`,
          ruleKey: "KITCHEN_TICKET_LATE",
          severity: overtimeMinutes >= 8 ? "URGENT" : "HIGH",
          tableId: session.tableId,
          tableLabel: session.tableLabel,
          sessionId: session.id,
          assignedServerId: session.assignedServerId,
          reason: `${ticket.course ? ticket.course.toUpperCase() : "Kitchen"} running ${overtimeMinutes}m late (${prepMinutes}m total)`,
          details: `Ticket #${ticket.id.slice(-4)} at ${ticket.stationId}: ${ticket.items.map((i) => i.name).join(", ")}`,
          ageMinutes: prepMinutes,
          recommendedAction: "Check Kitchen Station",
          actionRoute: "kitchen",
          source: { type: "ticket", id: ticket.id },
          canDismiss: true,
          autoResolves: true,
          createdAt: ticket.createdAt
        });
      }
    }

    // ---------------------------------------------------------------------------------
    // 6. SEATED_NO_DRINKS: Table seated longer than threshold without drink or order
    // ---------------------------------------------------------------------------------
    const hasAnyDrinksOrItems = activeItems.length > 0;
    if (!hasAnyDrinksOrItems && sessionAgeMinutes >= mergedConfig.seatedWithoutDrinksMinutes) {
      items.push({
        id: `SEATED_NO_DRINKS:${session.id}`,
        ruleKey: "SEATED_NO_DRINKS",
        severity: sessionAgeMinutes >= mergedConfig.seatedWithoutDrinksMinutes * 2 ? "HIGH" : "MEDIUM",
        tableId: session.tableId,
        tableLabel: session.tableLabel,
        sessionId: session.id,
        assignedServerId: session.assignedServerId,
        reason: `Table seated for ${sessionAgeMinutes}m with no drink orders`,
        details: `${session.diners.length} guests waiting for greeting or beverage order`,
        ageMinutes: sessionAgeMinutes,
        recommendedAction: "Take Drink Order",
        actionRoute: "orders",
        source: { type: "session", id: session.id },
        canDismiss: true,
        autoResolves: true,
        createdAt: session.openedAt
      });
    }

    // ---------------------------------------------------------------------------------
    // 7. CHECK_REQUESTED_UNSETTLED: Check requested but payment not completed
    // ---------------------------------------------------------------------------------
    const checkRequests = session.requests.filter(
      (r) =>
        r.category === "CHECK" &&
        r.status !== "COMPLETED" &&
        r.status !== "CANCELLED"
    );
    const { unpaidBalanceCents } = deriveFinancials(session.items, session.payments);

    if ((checkRequests.length > 0 || stage === "CHECK_REQUESTED") && unpaidBalanceCents > 0) {
      const checkAge = checkRequests.length > 0
        ? deriveRequestAgeMinutes(checkRequests[0].createdAt, undefined, now)
        : 1;

      if (checkAge >= mergedConfig.checkRequestedWaitMinutes) {
        items.push({
          id: `CHECK_REQUESTED_UNSETTLED:${session.id}`,
          ruleKey: "CHECK_REQUESTED_UNSETTLED",
          severity: checkAge >= 6 ? "HIGH" : "MEDIUM",
          tableId: session.tableId,
          tableLabel: session.tableLabel,
          sessionId: session.id,
          assignedServerId: session.assignedServerId,
          reason: `Guest requested check ${checkAge}m ago (unpaid balance: $${(unpaidBalanceCents / 100).toFixed(2)})`,
          details: "Present bill or collect card / digital payment",
          ageMinutes: checkAge,
          recommendedAction: "Open Check & Settle",
          actionRoute: "checks",
          source: { type: "check", id: session.checks[0]?.id || session.id },
          canDismiss: false,
          autoResolves: true,
          createdAt: checkRequests[0]?.createdAt || new Date().toISOString()
        });
      }
    }

    // ---------------------------------------------------------------------------------
    // 8. TABLE_PAID_UNCLEARED: Paid in full but table session not closed/reset
    // ---------------------------------------------------------------------------------
    const { totalCents, paidCents } = deriveFinancials(session.items, session.payments);
    if (totalCents > 0 && paidCents >= totalCents && unpaidBalanceCents === 0) {
      const latestPayment = session.payments[session.payments.length - 1];
      const paidTime = latestPayment ? new Date(latestPayment.createdAt).getTime() : openedTime;
      const paidAge = Math.max(0, Math.floor((now.getTime() - paidTime) / 60000));

      if (paidAge >= mergedConfig.tablePaidUnclearedMinutes) {
        items.push({
          id: `TABLE_PAID_UNCLEARED:${session.id}`,
          ruleKey: "TABLE_PAID_UNCLEARED",
          severity: paidAge >= 10 ? "MEDIUM" : "LOW",
          tableId: session.tableId,
          tableLabel: session.tableLabel,
          sessionId: session.id,
          assignedServerId: session.assignedServerId,
          reason: `Table settled $${(paidCents / 100).toFixed(2)} in full ${paidAge}m ago`,
          details: "Clear and reset table for next party or close session",
          ageMinutes: paidAge,
          recommendedAction: "Close & Reset Table",
          actionRoute: "bill",
          source: { type: "session", id: session.id },
          canDismiss: true,
          autoResolves: true,
          createdAt: latestPayment?.createdAt || session.openedAt
        });
      }
    }

    // ---------------------------------------------------------------------------------
    // 9. COURSE_PACING_GAP: Appetizers finished/delivered long ago, mains not yet fired
    // ---------------------------------------------------------------------------------
    const deliveredStarters = activeItems.filter((i) => i.course === "starters" && i.status === "delivered");
    const unFiredMains = activeItems.filter((i) => i.course === "mains" && i.status === "confirmed");
    const activeMains = activeItems.filter((i) => i.course === "mains" && (i.status === "fired" || i.status === "preparing" || i.status === "ready" || i.status === "delivered"));

    if (deliveredStarters.length > 0 && unFiredMains.length > 0 && activeMains.length === 0) {
      // Find oldest delivered starter
      const oldestStarterTime = deliveredStarters.reduce((oldest, item) => {
        const itemTime = new Date(item.createdAt).getTime();
        return itemTime < oldest ? itemTime : oldest;
      }, Date.now());
      const gapMinutes = Math.max(0, Math.floor((now.getTime() - oldestStarterTime) / 60000));

      if (gapMinutes >= mergedConfig.coursePacingGapMinutes) {
        items.push({
          id: `COURSE_PACING_GAP:${session.id}`,
          ruleKey: "COURSE_PACING_GAP",
          severity: gapMinutes >= 20 ? "HIGH" : "MEDIUM",
          tableId: session.tableId,
          tableLabel: session.tableLabel,
          sessionId: session.id,
          assignedServerId: session.assignedServerId,
          reason: `Appetizers delivered ${gapMinutes}m ago; Entrées not yet fired`,
          details: `${unFiredMains.length} entrées held on hold status`,
          ageMinutes: gapMinutes,
          recommendedAction: "Fire Entrées Course",
          actionRoute: "orders",
          source: { type: "item", id: unFiredMains[0].id },
          canDismiss: true,
          autoResolves: true,
          createdAt: new Date(oldestStarterTime).toISOString()
        });
      }
    }

    // ---------------------------------------------------------------------------------
    // 10. DINER_MISSING_ENTREE: One diner has no main while rest of table has active mains
    // ---------------------------------------------------------------------------------
    if (session.diners.length >= 2) {
      const confirmedMains = activeItems.filter((i) => i.course === "mains" && i.status !== "voided");
      if (confirmedMains.length > 0) {
        const dinersWithMains = new Set<string>();
        for (const mainItem of confirmedMains) {
          const singleDinerId = mainItem.dinerId || (mainItem.assignedDinerIds && mainItem.assignedDinerIds[0]);
          if (mainItem.splitMode === "single" && singleDinerId) {
            dinersWithMains.add(singleDinerId);
          } else if (mainItem.splitMode === "shared_diners" && mainItem.assignedDinerIds) {
            for (const dId of mainItem.assignedDinerIds) {
              dinersWithMains.add(dId);
            }
          } else if (mainItem.splitMode === "whole_table") {
            for (const d of session.diners) dinersWithMains.add(d.id);
          }
        }

        const missingDiners = session.diners.filter((d) => !dinersWithMains.has(d.id));
        if (missingDiners.length > 0 && missingDiners.length < session.diners.length) {
          items.push({
            id: `DINER_MISSING_ENTREE:${session.id}`,
            ruleKey: "DINER_MISSING_ENTREE",
            severity: "MEDIUM",
            tableId: session.tableId,
            tableLabel: session.tableLabel,
            sessionId: session.id,
            assignedServerId: session.assignedServerId,
            reason: `${missingDiners.map((d) => d.displayName).join(", ")} has no entrée ordered`,
            details: "Verify if diner is sharing an item or needs to order a main dish",
            ageMinutes: sessionAgeMinutes,
            recommendedAction: "Check Diner Order",
            actionRoute: "diner",
            source: { type: "diner", id: missingDiners[0].id },
            canDismiss: true,
            autoResolves: true,
            createdAt: session.openedAt
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------
  // Filter out dismissed items and optionally filter by assigned employee
  // ---------------------------------------------------------------------------------
  const activeItemsFiltered = items.filter((item) => !dismissed.has(item.id));

  // Sort deterministically:
  // 1. Employee assignment match
  // 2. Severity weight (URGENT > HIGH > MEDIUM > LOW > INFO)
  // 3. Age minutes descending (oldest waiting first)
  return activeItemsFiltered.sort((a, b) => {
    if (options.assignedEmployeeId) {
      const aIsMine = a.assignedServerId === options.assignedEmployeeId;
      const bIsMine = b.assignedServerId === options.assignedEmployeeId;
      if (aIsMine && !bIsMine) return -1;
      if (!aIsMine && bIsMine) return 1;
    }

    const weightDiff = SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity];
    if (weightDiff !== 0) return weightDiff;

    return b.ageMinutes - a.ageMinutes;
  });
}
