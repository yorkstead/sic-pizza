import { money } from "@/lib/utils";
import type { TableSession, DiningStage } from "./session";
import { deriveDiningStage, deriveElapsedMinutes } from "./session";
import { deriveTableCoursePacing } from "./pacing";
import { deriveFinancials, derivePaymentState } from "./session";

export interface TableTransferSummary {
  sessionId: string;
  tableId: string;
  tableLabel: string;
  assignedServerId?: string;
  assistingEmployeeIds: string[];
  guestCount: number;
  dinerNames: string[];
  elapsedMinutes: number;
  stage: DiningStage;
  coursingSummary: string;
  openRequestsCount: number;
  openRequestsSummary: string[];
  unpaidBalanceCents: number;
  unpaidBalanceFormatted: string;
  checkState: string;
  kitchenStatus: string;
  attentionAlerts: string[];
  bulletPoints: string[];
}

export interface SectionHandoffReport {
  fromServerId: string;
  generatedAt: string;
  totalTables: number;
  totalGuests: number;
  totalUnpaidBalanceCents: number;
  totalUnpaidBalanceFormatted: string;
  totalOpenRequests: number;
  tables: TableTransferSummary[];
}

/**
 * Deterministically derives an operational handoff summary from live TableSession state.
 * Eliminates verbal "brain dumps" during breaks, section rebalancing, and shift changes.
 */
export function deriveTableTransferSummary(
  session: TableSession,
  now: Date = new Date()
): TableTransferSummary {
  const elapsedMinutes = deriveElapsedMinutes(session.openedAt, session.closedAt, now);
  const stage = session.manualStageOverride || deriveDiningStage(session);
  const { unpaidBalanceCents } = deriveFinancials(session.items, session.payments);
  const paymentState = derivePaymentState(
    session.items.reduce((sum, i) => sum + (i.status !== "voided" && i.status !== "proposed" ? i.basePriceCents : 0), 0),
    session.payments.reduce((sum, p) => sum + p.amountCents, 0),
    session.checks
  );

  const guestCount = session.diners.length;
  const dinerNames = session.diners.map((d) => d.displayName);

  // 1. Coursing & Pacing derivation
  const pacing = deriveTableCoursePacing(session, now);
  let coursingSummary = "Not ordered";
  const activeItems = session.items.filter((i) => i.status !== "voided" && i.status !== "proposed");
  
  if (activeItems.length > 0) {
    const mains = activeItems.filter((i) => i.course === "mains" || i.course === "entree");
    const starters = activeItems.filter((i) => i.course === "starters" || i.course === "appetizer" || i.course === "salad");
    const desserts = activeItems.filter((i) => i.course === "desserts" || i.course === "dessert");

    if (desserts.some((i) => i.status === "delivered")) {
      coursingSummary = "Dessert delivered";
    } else if (desserts.some((i) => i.status === "preparing" || i.status === "fired")) {
      coursingSummary = "Dessert in prep";
    } else if (mains.some((i) => i.status === "delivered")) {
      coursingSummary = "Entrées delivered";
    } else if (mains.some((i) => i.status === "preparing" || i.status === "fired" || i.status === "ready")) {
      if (starters.some((i) => i.status === "delivered")) {
        coursingSummary = "Appetizers delivered · Entrées in prep";
      } else {
        coursingSummary = "Entrées in prep";
      }
    } else if (starters.some((i) => i.status === "delivered") && mains.some((i) => i.status === "held")) {
      coursingSummary = "Appetizers delivered · Entrées held";
    } else if (starters.some((i) => i.status === "preparing" || i.status === "fired" || i.status === "ready")) {
      coursingSummary = "Appetizers in prep";
    } else if (activeItems.some((i) => i.course === "drinks" && i.status === "delivered")) {
      coursingSummary = "Drinks delivered · Awaiting food order";
    } else if (pacing.serverPacingMessage) {
      coursingSummary = pacing.serverPacingMessage;
    } else {
      coursingSummary = "Order placed";
    }
  }

  // 2. Open Requests Summary
  const openRequests = session.requests.filter((r) => r.status === "OPEN" || r.status === "ACKNOWLEDGED" || r.status === "IN_PROGRESS");
  const openRequestsSummary = openRequests.map((r) => {
    const diner = session.diners.find((d) => d.id === r.dinerId);
    const origin = diner ? ` (${diner.displayName})` : "";
    switch (r.category) {
      case "REFILL":
        return `Drink/water refill requested${origin}`;
      case "DRINK_REORDER":
        return `Drink reorder requested${origin}`;
      case "CONDIMENT":
        return `Condiment/sauce requested${origin}`;
      case "TO_GO_BOX":
        return `To-go boxes requested${origin}`;
      case "UTENSILS":
        return `Extra napkins/utensils requested${origin}`;
      case "CHECK":
        return `Guest requested check${origin}`;
      case "SERVER_NEEDED":
        return `Server assistance requested${origin}`;
      case "FOOD_ISSUE":
        return `FOOD ISSUE reported${origin}: ${r.description}`;
      case "MISSING_ITEM":
        return `MISSING ITEM reported${origin}: ${r.description}`;
      default:
        return `${r.category} request${origin}`;
    }
  });

  // 3. Check & Settlement State
  let checkState = "Check not requested";
  if (session.closedAt) {
    checkState = "Session closed";
  } else if (paymentState === "fully_paid") {
    checkState = "Fully paid · Table ready to clear";
  } else if (paymentState === "partially_paid") {
    checkState = `Partially paid · ${money(unpaidBalanceCents)} balance remaining`;
  } else if (openRequests.some((r) => r.category === "CHECK")) {
    checkState = `Check requested · ${money(unpaidBalanceCents)} balance`;
  } else if (session.checks.length > 0) {
    checkState = `Check presented · ${money(unpaidBalanceCents)} balance`;
  }

  // 4. Kitchen & Prep Delays
  let kitchenStatus = "No kitchen delays";
  const activeTickets = session.tickets.filter((t) => t.status !== "cancelled" && t.status !== "delivered");
  if (activeTickets.length > 0) {
    const delayedTicket = activeTickets.find((t) => {
      const ticketAgeMin = Math.floor((now.getTime() - new Date(t.createdAt).getTime()) / 60000);
      return ticketAgeMin > 20;
    });

    if (delayedTicket) {
      const delayMin = Math.floor((now.getTime() - new Date(delayedTicket.createdAt).getTime()) / 60000);
      kitchenStatus = `Kitchen ticket ${delayedTicket.stationId} ${delayMin}m in prep (DELAYED)`;
    } else {
      const inPrepCount = activeTickets.filter((t) => t.status === "in_prep" || t.status === "accepted").length;
      const readyCount = activeTickets.filter((t) => t.status === "ready").length;
      if (readyCount > 0) {
        kitchenStatus = `${readyCount} ticket(s) READY for runner`;
      } else if (inPrepCount > 0) {
        kitchenStatus = `${inPrepCount} ticket(s) in prep (on time)`;
      } else {
        kitchenStatus = `${activeTickets.length} ticket(s) queued`;
      }
    }
  }

  // 5. Attention Alerts
  const attentionAlerts: string[] = [];
  if (stage === "SEATED" && elapsedMinutes > 5 && activeItems.length === 0) {
    attentionAlerts.push(`Table seated ${elapsedMinutes}m without drink or food order`);
  }
  if (openRequests.length > 0) {
    const overdueReq = openRequests.find((r) => {
      const reqAge = Math.floor((now.getTime() - new Date(r.createdAt).getTime()) / 60000);
      return reqAge > 4;
    });
    if (overdueReq) {
      attentionAlerts.push(`Open request (${overdueReq.category}) waiting > 4 minutes`);
    }
  }
  if (kitchenStatus.includes("DELAYED")) {
    attentionAlerts.push(kitchenStatus);
  }

  // 6. Rapid Overview Bullet Points
  const bulletPoints: string[] = [
    `${guestCount} guest${guestCount === 1 ? "" : "s"} (${dinerNames.join(", ") || "No diners named"})`,
    `${elapsedMinutes} minutes seated · Stage: ${stage.toUpperCase()}`,
    coursingSummary
  ];

  if (openRequestsSummary.length > 0) {
    bulletPoints.push(...openRequestsSummary);
  } else {
    bulletPoints.push("No open guest requests");
  }

  bulletPoints.push(checkState);
  bulletPoints.push(`Outstanding balance: ${money(unpaidBalanceCents)}`);
  bulletPoints.push(kitchenStatus);

  return {
    sessionId: session.id,
    tableId: session.tableId,
    tableLabel: session.tableLabel,
    assignedServerId: session.assignedServerId,
    assistingEmployeeIds: session.assistingEmployeeIds ?? [],
    guestCount,
    dinerNames,
    elapsedMinutes,
    stage,
    coursingSummary,
    openRequestsCount: openRequests.length,
    openRequestsSummary,
    unpaidBalanceCents,
    unpaidBalanceFormatted: money(unpaidBalanceCents),
    checkState,
    kitchenStatus,
    attentionAlerts,
    bulletPoints
  };
}

/**
 * Derives a full section handoff report for a departing server or shift transition.
 */
export function deriveSectionHandoffReport(
  sessions: TableSession[],
  fromServerId: string,
  now: Date = new Date()
): SectionHandoffReport {
  const activeSessions = sessions.filter((s) => !s.closedAt && (s.assignedServerId === fromServerId || s.assistingEmployeeIds?.includes(fromServerId)));
  const tables = activeSessions.map((s) => deriveTableTransferSummary(s, now));

  const totalGuests = tables.reduce((sum, t) => sum + t.guestCount, 0);
  const totalUnpaidBalanceCents = tables.reduce((sum, t) => sum + t.unpaidBalanceCents, 0);
  const totalOpenRequests = tables.reduce((sum, t) => sum + t.openRequestsCount, 0);

  return {
    fromServerId,
    generatedAt: now.toISOString(),
    totalTables: tables.length,
    totalGuests,
    totalUnpaidBalanceCents,
    totalUnpaidBalanceFormatted: money(totalUnpaidBalanceCents),
    totalOpenRequests,
    tables
  };
}
