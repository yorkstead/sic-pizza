import { money } from "@/lib/utils";
import type { TableSession, DiningStage } from "./session";
import { deriveDiningStage, deriveElapsedMinutes, deriveFinancials } from "./session";
import { DEFAULT_ATTENTION_CONFIG, type AttentionConfig } from "./attention";

export type ManagerAlertSeverity = "critical" | "urgent" | "warning" | "info";

export interface ManagerAttentionItem {
  id: string;
  sessionId: string;
  tableId: string;
  tableLabel: string;
  serverName: string;
  category: "FOOD_ISSUE" | "TICKET_DELAY" | "REQUEST_OVERDUE" | "TABLE_OVERDUE" | "PAYMENT_EXCEPTION" | "PROPOSAL_PENDING";
  severity: ManagerAlertSeverity;
  headline: string;
  detail: string;
  elapsedMinutes: number;
  recommendedAction: string;
  referenceId?: string;
  can1TapResolve: boolean;
}

export interface StationFlowSummary {
  stationId: string;
  stationName: string;
  queuedCount: number;
  inPrepCount: number;
  readyCount: number;
  delayedCount: number;
  oldestTicketMinutes: number;
  isBottleneck: boolean;
}

export interface ServerLoadSummary {
  employeeId: string;
  employeeName: string;
  tableCount: number;
  guestCount: number;
  openRequestsCount: number;
  criticalAlertsCount: number;
  tableLabels: string[];
  isOverloaded: boolean;
}

export interface PaymentExceptionSummary {
  sessionId: string;
  tableLabel: string;
  serverName: string;
  elapsedMinutes: number;
  unpaidBalanceCents: number;
  unpaidBalanceFormatted: string;
  stage: DiningStage;
  reason: string;
}

export interface ManagerOperationsOverview {
  generatedAt: string;
  totalActiveTables: number;
  totalSeatedGuests: number;
  totalUnsettledBalanceCents: number;
  totalUnsettledBalanceFormatted: string;
  criticalCount: number;
  urgentCount: number;
  warningCount: number;
  needsAttention: ManagerAttentionItem[];
  kitchenFlow: {
    stations: StationFlowSummary[];
    totalActiveTickets: number;
    totalDelayedTickets: number;
    delayedTicketsList: Array<{
      ticketId: string;
      tableLabel: string;
      stationId: string;
      elapsedMinutes: number;
      itemsSummary: string;
    }>;
  };
  diningRoom: {
    tables: Array<{
      sessionId: string;
      tableId: string;
      tableLabel: string;
      stage: DiningStage;
      serverName: string;
      guestCount: number;
      elapsedMinutes: number;
      hasAlert: boolean;
      unpaidBalanceFormatted: string;
    }>;
    stageCounts: Record<DiningStage, number>;
  };
  staffLoad: {
    servers: ServerLoadSummary[];
    hasLoadImbalance: boolean;
    imbalanceRecommendation?: string;
  };
  paymentExceptions: PaymentExceptionSummary[];
  unavailableItemIds: string[];
}

const SERVER_NAMES_MAP: Record<string, string> = {
  emp_jordan: "Jordan",
  emp_morgan: "Morgan",
  emp_taylor: "Taylor",
  emp_alex: "Alex",
  emp_sam_mgr: "Sam (Manager)"
};

/**
 * Derives comprehensive live restaurant operational state for the Manager Operations Command Center.
 * Answers: "What is going wrong right now?" without historical SaaS charts.
 */
export function deriveManagerOperationsOverview(
  sessions: TableSession[],
  config: AttentionConfig = DEFAULT_ATTENTION_CONFIG,
  unavailableItemIds: string[] = ["top_basil"],
  now: Date = new Date()
): ManagerOperationsOverview {
  const activeSessions = sessions.filter((s) => !s.closedAt);
  const needsAttention: ManagerAttentionItem[] = [];
  const paymentExceptions: PaymentExceptionSummary[] = [];

  let totalSeatedGuests = 0;
  let totalUnsettledBalanceCents = 0;

  const stageCounts: Record<DiningStage, number> = {
    SEATED: 0,
    DRINKS: 0,
    ORDERING: 0,
    APPETIZERS: 0,
    ENTREES: 0,
    DESSERT: 0,
    CHECK_REQUESTED: 0,
    PAYING: 0,
    CLOSED: 0
  };

  // Staff load mapping
  const serverLoadMap = new Map<string, ServerLoadSummary>();

  // 1. Process Tables, Attention Items, and Requests
  for (const session of activeSessions) {
    const elapsedMinutes = deriveElapsedMinutes(session.openedAt, session.closedAt, now);
    const stage = session.manualStageOverride || deriveDiningStage(session);
    stageCounts[stage] = (stageCounts[stage] || 0) + 1;

    const guestCount = session.diners.length;
    totalSeatedGuests += guestCount;

    const { unpaidBalanceCents } = deriveFinancials(session.items, session.payments);
    totalUnsettledBalanceCents += unpaidBalanceCents;

    const serverId = session.assignedServerId || "unassigned";
    const serverName = SERVER_NAMES_MAP[serverId] || serverId;

    // Track staff load
    if (!serverLoadMap.has(serverId)) {
      serverLoadMap.set(serverId, {
        employeeId: serverId,
        employeeName: serverName,
        tableCount: 0,
        guestCount: 0,
        openRequestsCount: 0,
        criticalAlertsCount: 0,
        tableLabels: [],
        isOverloaded: false
      });
    }
    const load = serverLoadMap.get(serverId)!;
    load.tableCount += 1;
    load.guestCount += guestCount;
    load.tableLabels.push(session.tableLabel);

    // 1a. Food Quality Issues & Escalated Requests
    for (const req of session.requests) {
      if (req.status === "OPEN" || req.status === "ACKNOWLEDGED" || req.status === "IN_PROGRESS") {
        load.openRequestsCount += 1;
        const reqAgeMin = Math.floor((now.getTime() - new Date(req.createdAt).getTime()) / 60000);

        if (req.category === "FOOD_ISSUE" || req.escalationState === "ESCALATED") {
          load.criticalAlertsCount += 1;
          needsAttention.push({
            id: `alert_food_${req.id}`,
            sessionId: session.id,
            tableId: session.tableId,
            tableLabel: session.tableLabel,
            serverName,
            category: "FOOD_ISSUE",
            severity: "critical",
            headline: `Food Quality Issue on ${session.tableLabel}`,
            detail: `${req.description || "Reported food issue"} · Waiting ${reqAgeMin}m`,
            elapsedMinutes: reqAgeMin,
            recommendedAction: "Manager visit table immediately & offer tableside remake/comp",
            referenceId: req.id,
            can1TapResolve: true
          });
        } else if (reqAgeMin >= 5) {
          needsAttention.push({
            id: `alert_req_${req.id}`,
            sessionId: session.id,
            tableId: session.tableId,
            tableLabel: session.tableLabel,
            serverName,
            category: "REQUEST_OVERDUE",
            severity: reqAgeMin >= 8 ? "urgent" : "warning",
            headline: `${req.category} Request Overdue on ${session.tableLabel}`,
            detail: `Requested ${reqAgeMin}m ago · Assigned to ${req.assignedRole}`,
            elapsedMinutes: reqAgeMin,
            recommendedAction: `Dispatch runner or assist ${serverName} with ${req.category}`,
            referenceId: req.id,
            can1TapResolve: true
          });
        }
      }
    }

    // 1b. Pending Guest Item Proposals
    const pendingProposals = session.items.filter((i) => i.status === "proposed");
    if (pendingProposals.length > 0) {
      needsAttention.push({
        id: `alert_prop_${session.id}`,
        sessionId: session.id,
        tableId: session.tableId,
        tableLabel: session.tableLabel,
        serverName,
        category: "PROPOSAL_PENDING",
        severity: "info",
        headline: `${pendingProposals.length} Guest Item Proposal(s) Pending`,
        detail: pendingProposals.map((p) => `${p.quantity}x ${p.name}`).join(", "),
        elapsedMinutes: 2,
        recommendedAction: `Approve or verify proposals with ${serverName}`,
        referenceId: session.id,
        can1TapResolve: true
      });
    }

    // 1c. Payment Exceptions
    if (stage === "PAYING" && elapsedMinutes > 40 && unpaidBalanceCents > 0) {
      paymentExceptions.push({
        sessionId: session.id,
        tableLabel: session.tableLabel,
        serverName,
        elapsedMinutes,
        unpaidBalanceCents,
        unpaidBalanceFormatted: money(unpaidBalanceCents),
        stage,
        reason: `Table in PAYING stage with ${money(unpaidBalanceCents)} balance remaining`
      });

      needsAttention.push({
        id: `alert_pay_${session.id}`,
        sessionId: session.id,
        tableId: session.tableId,
        tableLabel: session.tableLabel,
        serverName,
        category: "PAYMENT_EXCEPTION",
        severity: "warning",
        headline: `Unsettled Payment on ${session.tableLabel}`,
        detail: `Unpaid balance of ${money(unpaidBalanceCents)} · Table seated ${elapsedMinutes}m`,
        elapsedMinutes,
        recommendedAction: "Check check presentation status or assist with card payment terminal",
        can1TapResolve: false
      });
    }

    // 1d. Table Overdue without orders
    if (stage === "SEATED" && elapsedMinutes >= 6 && session.items.length === 0) {
      needsAttention.push({
        id: `alert_seated_${session.id}`,
        sessionId: session.id,
        tableId: session.tableId,
        tableLabel: session.tableLabel,
        serverName,
        category: "TABLE_OVERDUE",
        severity: elapsedMinutes >= 10 ? "urgent" : "warning",
        headline: `Table Seated ${elapsedMinutes}m with No Order`,
        detail: `${guestCount} guests seated without water, drink, or food orders`,
        elapsedMinutes,
        recommendedAction: `Prompt ${serverName} to take drink order or greet table`,
        can1TapResolve: false
      });
    }
  }

  // 2. Kitchen Line Flow & Bottleneck Analysis
  const stationMap = new Map<string, StationFlowSummary>();
  const STANDARD_STATIONS: Array<{ id: string; name: string }> = [
    { id: "PIZZA", name: "Pizza Oven" },
    { id: "GRILL", name: "Grill Station" },
    { id: "FRY", name: "Fry Station" },
    { id: "SALAD", name: "Salad & Cold" },
    { id: "BAR", name: "Cocktail Bar" },
    { id: "DESSERT", name: "Dessert Station" },
    { id: "EXPO", name: "Expo Master" }
  ];

  for (const st of STANDARD_STATIONS) {
    stationMap.set(st.id, {
      stationId: st.id,
      stationName: st.name,
      queuedCount: 0,
      inPrepCount: 0,
      readyCount: 0,
      delayedCount: 0,
      oldestTicketMinutes: 0,
      isBottleneck: false
    });
  }

  const delayedTicketsList: Array<{
    ticketId: string;
    tableLabel: string;
    stationId: string;
    elapsedMinutes: number;
    itemsSummary: string;
  }> = [];

  let totalActiveTickets = 0;
  let totalDelayedTickets = 0;

  for (const session of activeSessions) {
    for (const ticket of session.tickets) {
      if (ticket.status !== "cancelled" && ticket.status !== "delivered") {
        totalActiveTickets += 1;
        const normStationId = (ticket.stationId || "").toUpperCase();
        const ticketAgeMin = Math.floor((now.getTime() - new Date(ticket.createdAt).getTime()) / 60000);
        const stationSummary = stationMap.get(normStationId) || {
          stationId: normStationId,
          stationName: normStationId,
          queuedCount: 0,
          inPrepCount: 0,
          readyCount: 0,
          delayedCount: 0,
          oldestTicketMinutes: 0,
          isBottleneck: false
        };

        if (ticket.status === "queued") stationSummary.queuedCount += 1;
        if (ticket.status === "accepted" || ticket.status === "in_prep") stationSummary.inPrepCount += 1;
        if (ticket.status === "ready") stationSummary.readyCount += 1;

        stationSummary.oldestTicketMinutes = Math.max(stationSummary.oldestTicketMinutes, ticketAgeMin);

        // Threshold for kitchen ticket delay: > 15 minutes (or 20 for pizza)
        const delayThreshold = normStationId === "PIZZA" ? 20 : 14;
        if (ticketAgeMin >= delayThreshold && ticket.status !== "ready") {
          totalDelayedTickets += 1;
          stationSummary.delayedCount += 1;

          const itemsSummary = ticket.items.map((ti) => `${ti.quantity}x ${ti.name}`).join(", ");
          delayedTicketsList.push({
            ticketId: ticket.id,
            tableLabel: ticket.tableLabel,
            stationId: normStationId,
            elapsedMinutes: ticketAgeMin,
            itemsSummary
          });

          needsAttention.push({
            id: `alert_kitch_${ticket.id}`,
            sessionId: session.id,
            tableId: session.tableId,
            tableLabel: session.tableLabel,
            serverName: SERVER_NAMES_MAP[session.assignedServerId || ""] || "Jordan",
            category: "TICKET_DELAY",
            severity: ticketAgeMin >= 22 ? "urgent" : "warning",
            headline: `Kitchen Delay at ${stationSummary.stationName}`,
            detail: `${itemsSummary} · Waiting ${ticketAgeMin}m on ${ticket.tableLabel}`,
            elapsedMinutes: ticketAgeMin,
            recommendedAction: `Expedite ${stationSummary.stationName} or notify table of delay`,
            referenceId: ticket.id,
            can1TapResolve: false
          });
        }

        stationMap.set(normStationId, stationSummary);
      }
    }
  }

  // Flag bottlenecks: stations with >= 2 delayed tickets or >= 5 active tickets
  for (const st of stationMap.values()) {
    if (st.delayedCount >= 2 || (st.inPrepCount + st.queuedCount) >= 5) {
      st.isBottleneck = true;
    }
  }

  // Sort needsAttention items by severity priority (critical > urgent > warning > info)
  const severityScore: Record<ManagerAlertSeverity, number> = {
    critical: 4,
    urgent: 3,
    warning: 2,
    info: 1
  };
  needsAttention.sort((a, b) => severityScore[b.severity] - severityScore[a.severity]);

  const criticalCount = needsAttention.filter((a) => a.severity === "critical").length;
  const urgentCount = needsAttention.filter((a) => a.severity === "urgent").length;
  const warningCount = needsAttention.filter((a) => a.severity === "warning").length;

  // 3. Staff Load Calculations
  const serversList = Array.from(serverLoadMap.values());
  const maxTables = serversList.length > 0 ? Math.max(...serversList.map((s) => s.tableCount)) : 0;
  const minTables = serversList.length > 0 ? Math.min(...serversList.map((s) => s.tableCount)) : 0;
  const hasLoadImbalance = serversList.length > 1 && (maxTables - minTables) >= 3;

  for (const s of serversList) {
    if (s.tableCount >= 4 || s.criticalAlertsCount >= 2) {
      s.isOverloaded = true;
    }
  }

  let imbalanceRecommendation: string | undefined;
  if (hasLoadImbalance) {
    const busiest = serversList.find((s) => s.tableCount === maxTables);
    const lightest = serversList.find((s) => s.tableCount === minTables);
    if (busiest && lightest) {
      imbalanceRecommendation = `Reassign 1-2 tables from ${busiest.employeeName} (${busiest.tableCount} tables) to ${lightest.employeeName} (${lightest.tableCount} tables)`;
    }
  }

  // 4. Dining Room Table Card Projections
  const diningRoomTables = activeSessions.map((session) => {
    const stage = session.manualStageOverride || deriveDiningStage(session);
    const elapsedMinutes = deriveElapsedMinutes(session.openedAt, session.closedAt, now);
    const serverName = SERVER_NAMES_MAP[session.assignedServerId || ""] || "Jordan";
    const { unpaidBalanceCents } = deriveFinancials(session.items, session.payments);
    const hasAlert = needsAttention.some((a) => a.sessionId === session.id);

    return {
      sessionId: session.id,
      tableId: session.tableId,
      tableLabel: session.tableLabel,
      stage,
      serverName,
      guestCount: session.diners.length,
      elapsedMinutes,
      hasAlert,
      unpaidBalanceFormatted: money(unpaidBalanceCents)
    };
  });

  return {
    generatedAt: now.toISOString(),
    totalActiveTables: activeSessions.length,
    totalSeatedGuests,
    totalUnsettledBalanceCents,
    totalUnsettledBalanceFormatted: money(totalUnsettledBalanceCents),
    criticalCount,
    urgentCount,
    warningCount,
    needsAttention,
    kitchenFlow: {
      stations: Array.from(stationMap.values()),
      totalActiveTickets,
      totalDelayedTickets,
      delayedTicketsList
    },
    diningRoom: {
      tables: diningRoomTables,
      stageCounts
    },
    staffLoad: {
      servers: serversList,
      hasLoadImbalance,
      imbalanceRecommendation
    },
    paymentExceptions,
    unavailableItemIds
  };
}
