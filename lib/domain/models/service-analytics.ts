import { money } from "@/lib/utils";
import type { TableSession } from "./session";
import type { RequestCategory } from "./request";

export interface MetricDefinition {
  name: string;
  category: "TIMING" | "KITCHEN" | "SERVICE" | "QUALITY" | "FINANCIAL";
  startTrigger: string;
  endTrigger: string;
  targetBenchmarkMinutes?: number;
  description: string;
  whyItMatters: string;
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  GREET_TIME: {
    name: "Average Greet Time",
    category: "SERVICE",
    startTrigger: "TABLE_OPENED",
    endTrigger: "DINER_ADDED / First Drink Item Added",
    targetBenchmarkMinutes: 2,
    description: "Elapsed minutes from table session creation to first server interaction (seating diners or initial drinks order).",
    whyItMatters: "First impressions dictate perceived wait time; $>3\\text{m}$ creates guest anxiety."
  },
  SEATED_TO_FIRST_ORDER: {
    name: "Seated to First Food Order",
    category: "SERVICE",
    startTrigger: "TABLE_OPENED",
    endTrigger: "First Appetizer / Main Course Added or Fired",
    targetBenchmarkMinutes: 8,
    description: "Elapsed duration from party arrival until the table's first food order is submitted.",
    whyItMatters: "Identifies ordering hesitations or delayed server check-ins."
  },
  TICKET_PREP_TIME: {
    name: "Station Ticket Prep Duration",
    category: "KITCHEN",
    startTrigger: "TICKET_CREATED / COURSE_FIRED",
    endTrigger: "ITEM_READY / All items on ticket marked READY",
    targetBenchmarkMinutes: 14,
    description: "Time elapsed while kitchen station prepares line items before calling expo.",
    whyItMatters: "Direct indicator of station throughput, line bottlenecks, and fire timing precision."
  },
  FOOD_READY_TO_DELIVERED: {
    name: "Runner Delivery Latency (Expo to Table)",
    category: "SERVICE",
    startTrigger: "ITEM_READY (Kitchen)",
    endTrigger: "ITEM_DELIVERED (Server / Runner)",
    targetBenchmarkMinutes: 2,
    description: "Elapsed minutes from food completing under the heat lamp until runner delivers to table.",
    whyItMatters: "Hot pizza degrades rapidly under lamps; $>3\\text{m}$ causes cold food complaints."
  },
  CHECK_REQUEST_TO_PAYMENT: {
    name: "Check Request to Payment Settlement",
    category: "FINANCIAL",
    startTrigger: "REQUEST_CREATED (CHECK) / CHECK_CREATED",
    endTrigger: "PAYMENT_COMPLETED",
    targetBenchmarkMinutes: 4,
    description: "Duration from guest asking for check / check presentation to final transaction completion.",
    whyItMatters: "Guests want to leave immediately after deciding to pay; long payment waits hurt tips."
  },
  TABLE_TURN_TIME: {
    name: "Table Turn Duration",
    category: "TIMING",
    startTrigger: "TABLE_OPENED",
    endTrigger: "TABLE_CLOSED",
    targetBenchmarkMinutes: 65,
    description: "Total lifecycle of a dining party from initial seating through final table settlement.",
    whyItMatters: "Controls dining room seat capacity and dinner rush throughput."
  },
  VOID_RATE: {
    name: "Item Void Rate",
    category: "QUALITY",
    startTrigger: "ITEM_VOIDED",
    endTrigger: "Total Ordered Items",
    description: "Percentage of entered items that were subsequently voided with waste or mistake reasons.",
    whyItMatters: "Measures order entry accuracy, server training gaps, and food waste."
  },
  FOOD_ISSUE_RATE: {
    name: "Food Issue / Remake Rate",
    category: "QUALITY",
    startTrigger: "REQUEST_CREATED (FOOD_ISSUE) / ESCALATION_RESOLVED",
    endTrigger: "Total Table Sessions",
    description: "Frequency of reported food quality complaints requiring kitchen remake or manager comp.",
    whyItMatters: "Direct measure of kitchen execution consistency and recipe compliance."
  }
};

export interface StationAnalytics {
  stationId: string;
  stationName: string;
  totalTicketsCount: number;
  avgPrepMinutes: number;
  delayedTicketsCount: number;
  delayedPercent: number;
  avgReadyToDeliveredMinutes: number;
  bottleneckScore: "optimal" | "moderate" | "bottleneck";
}

export interface ServerContextualAnalytics {
  serverId: string;
  serverName: string;
  totalTablesServed: number;
  totalGuestsServed: number;
  avgPartySize: number;
  avgTurnMinutes: number;
  avgGreetMinutes: number;
  avgRequestResponseMinutes: number;
  totalRequestsHandled: number;
  voidsCount: number;
  foodIssuesCount: number;
  contextNote: string;
}

export interface DaypartAnalytics {
  daypart: "Lunch" | "Dinner" | "Late Night" | "Other";
  totalTables: number;
  totalGuests: number;
  avgTurnMinutes: number;
  avgTicketMinutes: number;
  totalSalesCents: number;
  totalSalesFormatted: string;
}

export interface RequestTypeBreakdown {
  category: RequestCategory | string;
  count: number;
  percentOfTotal: number;
  avgResolutionMinutes: number;
}

export interface ServiceAnalyticsReport {
  generatedAt: string;
  dateRange: { from: string; to: string; label: string };
  totalTablesAnalyzed: number;
  totalGuestsAnalyzed: number;
  totalSalesCents: number;
  totalSalesFormatted: string;

  // Key Operational Timing
  avgGreetMinutes: number;
  avgSeatedToOrderMinutes: number;
  avgTicketPrepMinutes: number;
  avgFoodReadyToDeliveredMinutes: number;
  avgCheckRequestToPaymentMinutes: number;
  avgTableTurnMinutes: number;

  // Quality & Friction Rates
  voidRatePercent: number;
  totalVoidedItemsCount: number;
  foodIssueRatePercent: number;
  totalFoodIssuesCount: number;
  delayedTicketRatePercent: number;
  totalDelayedTicketsCount: number;

  // Breakdowns
  requestTypeBreakdown: RequestTypeBreakdown[];
  stations: StationAnalytics[];
  servers: ServerContextualAnalytics[];
  dayparts: DaypartAnalytics[];
  metricDefinitions: Record<string, MetricDefinition>;
}

export interface AnalyticsFilter {
  locationId?: string;
  datePreset?: "today" | "yesterday" | "last7days" | "all";
  serverId?: string;
  servicePeriodId?: string;
}

const SERVER_NAMES_MAP: Record<string, string> = {
  emp_jordan: "Jordan",
  emp_morgan: "Morgan",
  emp_taylor: "Taylor",
  emp_alex: "Alex",
  emp_sam_mgr: "Sam (Manager)"
};

const STATION_NAMES_MAP: Record<string, string> = {
  PIZZA: "Pizza Oven",
  GRILL: "Grill Station",
  FRY: "Fry Station",
  SALAD: "Salad & Cold",
  BAR: "Cocktail Bar",
  DESSERT: "Dessert Station",
  EXPO: "Expo Master",
  kitchen: "General Kitchen"
};

/**
 * Derives rigorous service and kitchen analytics directly from table session event streams.
 */
export function deriveServiceAnalytics(
  sessions: TableSession[],
  filter: AnalyticsFilter = { datePreset: "all" },
  now: Date = new Date()
): ServiceAnalyticsReport {
  let targetSessions = [...sessions];

  if (filter.locationId) {
    targetSessions = targetSessions.filter((s) => s.locationId === filter.locationId);
  }
  if (filter.serverId) {
    targetSessions = targetSessions.filter((s) => s.assignedServerId === filter.serverId);
  }
  if (filter.servicePeriodId) {
    targetSessions = targetSessions.filter((s) => s.servicePeriodId === filter.servicePeriodId);
  }

  // 1. Greet Time Calculation
  const greetDurations: number[] = [];
  const seatedToOrderDurations: number[] = [];
  const tableTurnDurations: number[] = [];
  const checkToPaymentDurations: number[] = [];
  const readyToDeliveredDurations: number[] = [];
  const ticketPrepDurations: number[] = [];

  let totalSalesCents = 0;
  let totalGuestsAnalyzed = 0;
  let totalVoidedItemsCount = 0;
  let totalOrderedItemsCount = 0;
  let totalFoodIssuesCount = 0;
  let totalDelayedTicketsCount = 0;
  let totalTicketsCount = 0;

  // Station and Server Map aggregates
  const stationStats = new Map<string, {
    prepTimes: number[];
    readyToDeliveredTimes: number[];
    delayedCount: number;
    totalCount: number;
  }>();

  const serverStats = new Map<string, {
    tables: number;
    guests: number;
    turnTimes: number[];
    greetTimes: number[];
    requestResponseTimes: number[];
    requestsHandled: number;
    voids: number;
    foodIssues: number;
  }>();

  const requestStats = new Map<string, { count: number; resolutionTimes: number[] }>();

  const daypartStats = new Map<"Lunch" | "Dinner" | "Late Night" | "Other", {
    tables: number;
    guests: number;
    turnTimes: number[];
    ticketTimes: number[];
    salesCents: number;
  }>();

  // Initialize Dayparts
  for (const dp of ["Lunch", "Dinner", "Late Night", "Other"] as const) {
    daypartStats.set(dp, { tables: 0, guests: 0, turnTimes: [], ticketTimes: [], salesCents: 0 });
  }

  for (const session of targetSessions) {
    const openedTime = new Date(session.openedAt).getTime();
    const closedTime = session.closedAt ? new Date(session.closedAt).getTime() : now.getTime();
    const isClosed = Boolean(session.closedAt);

    totalGuestsAnalyzed += session.diners.length;

    // Daypart calculation based on openedAt hour
    const openHour = new Date(session.openedAt).getHours();
    let daypart: "Lunch" | "Dinner" | "Late Night" | "Other" = "Other";
    if (openHour >= 11 && openHour < 16) daypart = "Lunch";
    else if (openHour >= 16 && openHour < 22) daypart = "Dinner";
    else if (openHour >= 22 || openHour < 4) daypart = "Late Night";

    const dpData = daypartStats.get(daypart)!;
    dpData.tables += 1;
    dpData.guests += session.diners.length;

    // Turn duration
    if (isClosed) {
      const turnMinutes = Math.max(1, Math.round((closedTime - openedTime) / 60000));
      tableTurnDurations.push(turnMinutes);
      dpData.turnTimes.push(turnMinutes);
    }

    // Server aggregation
    const serverId = session.assignedServerId || session.openedByEmployeeId || "unassigned";
    if (!serverStats.has(serverId)) {
      serverStats.set(serverId, {
        tables: 0,
        guests: 0,
        turnTimes: [],
        greetTimes: [],
        requestResponseTimes: [],
        requestsHandled: 0,
        voids: 0,
        foodIssues: 0
      });
    }
    const srv = serverStats.get(serverId)!;
    srv.tables += 1;
    srv.guests += session.diners.length;
    if (isClosed) {
      srv.turnTimes.push(Math.max(1, Math.round((closedTime - openedTime) / 60000)));
    }

    // Greet Time: TABLE_OPENED -> first DINER_ADDED or first item added
    const dinerAddedEvents = session.events.filter((e) => e.type === "DINER_ADDED");
    const itemAddedEvents = session.events.filter((e) => e.type === "ITEM_ADDED" || e.type === "ITEM_PROPOSED");

    let firstInteractionTime: number | null = null;
    if (dinerAddedEvents.length > 0) {
      firstInteractionTime = new Date(dinerAddedEvents[0].timestamp).getTime();
    } else if (itemAddedEvents.length > 0) {
      firstInteractionTime = new Date(itemAddedEvents[0].timestamp).getTime();
    }

    if (firstInteractionTime) {
      const greetMin = Math.max(0, Math.round((firstInteractionTime - openedTime) / 60000));
      greetDurations.push(greetMin);
      srv.greetTimes.push(greetMin);
    }

    // Seated to First Food Order
    const foodItems = session.items.filter((i) => i.course !== "drinks");
    if (foodItems.length > 0) {
      // Find earliest item added event for a food item
      const firstFoodItem = foodItems[0];
      const itemCreatedEvent = session.events.find(
        (e) => (e.type === "ITEM_ADDED" || e.type === "ITEM_PROPOSED") && (e.payload as Record<string, unknown>)?.itemId === firstFoodItem.id
      );
      const foodOrderTime = itemCreatedEvent ? new Date(itemCreatedEvent.timestamp).getTime() : openedTime + 8 * 60000;
      const seatedToOrderMin = Math.max(1, Math.round((foodOrderTime - openedTime) / 60000));
      seatedToOrderDurations.push(seatedToOrderMin);
    }

    // Items & Voids
    for (const item of session.items) {
      totalOrderedItemsCount += 1;
      if (item.status === "voided") {
        totalVoidedItemsCount += 1;
        srv.voids += 1;
      } else {
        totalSalesCents += (item.basePriceCents * (item.quantity || 1));
        dpData.salesCents += (item.basePriceCents * (item.quantity || 1));
      }
    }

    // Kitchen Tickets & Stations
    for (const ticket of session.tickets) {
      totalTicketsCount += 1;
      const stId = (ticket.stationId || "kitchen").toUpperCase();
      if (!stationStats.has(stId)) {
        stationStats.set(stId, { prepTimes: [], readyToDeliveredTimes: [], delayedCount: 0, totalCount: 0 });
      }
      const stData = stationStats.get(stId)!;
      stData.totalCount += 1;

      const ticketCreatedTime = new Date(ticket.createdAt).getTime();

      // Find when items were marked ready
      const readyItemEvents = session.events.filter(
        (e) => e.type === "ITEM_READY" && (e.payload as Record<string, unknown>)?.ticketId === ticket.id
      );

      let prepTimeMin: number;
      if (readyItemEvents.length > 0) {
        const readyTime = new Date(readyItemEvents[0].timestamp).getTime();
        prepTimeMin = Math.max(1, Math.round((readyTime - ticketCreatedTime) / 60000));
      } else if (ticket.status === "ready" || ticket.status === "delivered") {
        prepTimeMin = 12; // Fallback estimated
      } else {
        // In prep duration
        prepTimeMin = Math.max(1, Math.round((now.getTime() - ticketCreatedTime) / 60000));
      }

      ticketPrepDurations.push(prepTimeMin);
      stData.prepTimes.push(prepTimeMin);
      dpData.ticketTimes.push(prepTimeMin);

      const delayThreshold = stId === "PIZZA" ? 20 : 14;
      if (prepTimeMin > delayThreshold) {
        totalDelayedTicketsCount += 1;
        stData.delayedCount += 1;
      }

      // Ready to Delivered (Runner latency)
      const deliveredItemEvents = session.events.filter(
        (e) => e.type === "ITEM_DELIVERED" && (e.payload as Record<string, unknown>)?.ticketId === ticket.id
      );
      if (readyItemEvents.length > 0 && deliveredItemEvents.length > 0) {
        const readyTime = new Date(readyItemEvents[0].timestamp).getTime();
        const delivTime = new Date(deliveredItemEvents[0].timestamp).getTime();
        const lagMin = Math.max(0, Math.round((delivTime - readyTime) / 60000));
        readyToDeliveredDurations.push(lagMin);
        stData.readyToDeliveredTimes.push(lagMin);
      }
    }

    // Guest Requests & Response Duration
    for (const req of session.requests) {
      const cat = req.category;
      if (!requestStats.has(cat)) {
        requestStats.set(cat, { count: 0, resolutionTimes: [] });
      }
      const rData = requestStats.get(cat)!;
      rData.count += 1;
      srv.requestsHandled += 1;

      if (cat === "FOOD_ISSUE") {
        totalFoodIssuesCount += 1;
        srv.foodIssues += 1;
      }

      const reqCreated = new Date(req.createdAt).getTime();
      let resTimeMin: number | null = null;
      if (req.completedAt) {
        resTimeMin = Math.max(0, Math.round((new Date(req.completedAt).getTime() - reqCreated) / 60000));
      } else if (req.acknowledgedAt) {
        resTimeMin = Math.max(0, Math.round((new Date(req.acknowledgedAt).getTime() - reqCreated) / 60000));
      }

      if (resTimeMin !== null) {
        rData.resolutionTimes.push(resTimeMin);
        srv.requestResponseTimes.push(resTimeMin);
      }

      // Check request to payment time
      if (cat === "CHECK" && session.payments.length > 0) {
        const firstPaymentTime = new Date(session.payments[0].createdAt).getTime();
        const checkToPayMin = Math.max(0, Math.round((firstPaymentTime - reqCreated) / 60000));
        checkToPaymentDurations.push(checkToPayMin);
      }
    }
  }

  const avg = (arr: number[]) => (arr.length === 0 ? 0 : Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10);

  // Compile Station Analytics
  const stationResults: StationAnalytics[] = Array.from(stationStats.entries()).map(([stId, data]) => {
    const avgPrep = avg(data.prepTimes);
    const delayedPct = data.totalCount > 0 ? Math.round((data.delayedCount / data.totalCount) * 100) : 0;
    const avgLag = avg(data.readyToDeliveredTimes);

    let bottleneckScore: "optimal" | "moderate" | "bottleneck" = "optimal";
    if (delayedPct >= 20 || avgPrep > 18) bottleneckScore = "bottleneck";
    else if (delayedPct >= 10 || avgPrep > 14) bottleneckScore = "moderate";

    return {
      stationId: stId,
      stationName: STATION_NAMES_MAP[stId] || stId,
      totalTicketsCount: data.totalCount,
      avgPrepMinutes: avgPrep,
      delayedTicketsCount: data.delayedCount,
      delayedPercent: delayedPct,
      avgReadyToDeliveredMinutes: avgLag,
      bottleneckScore
    };
  });

  // Compile Server Contextual Analytics
  const serverResults: ServerContextualAnalytics[] = Array.from(serverStats.entries()).map(([srvId, data]) => {
    const avgParty = data.tables > 0 ? Math.round((data.guests / data.tables) * 10) / 10 : 0;
    const avgTurn = avg(data.turnTimes);
    const avgGreet = avg(data.greetTimes);
    const avgReq = avg(data.requestResponseTimes);

    let contextNote = "Standard section load";
    if (avgParty >= 4) {
      contextNote = "Large party section (longer meal turn is expected)";
    } else if (data.tables >= 4) {
      contextNote = "High table volume during rush";
    }

    return {
      serverId: srvId,
      serverName: SERVER_NAMES_MAP[srvId] || srvId,
      totalTablesServed: data.tables,
      totalGuestsServed: data.guests,
      avgPartySize: avgParty,
      avgTurnMinutes: avgTurn,
      avgGreetMinutes: avgGreet,
      avgRequestResponseMinutes: avgReq,
      totalRequestsHandled: data.requestsHandled,
      voidsCount: data.voids,
      foodIssuesCount: data.foodIssues,
      contextNote
    };
  });

  // Compile Request Type Breakdown
  const totalReqs = Array.from(requestStats.values()).reduce((sum, r) => sum + r.count, 0);
  const requestTypeBreakdown: RequestTypeBreakdown[] = Array.from(requestStats.entries()).map(([cat, data]) => ({
    category: cat,
    count: data.count,
    percentOfTotal: totalReqs > 0 ? Math.round((data.count / totalReqs) * 100) : 0,
    avgResolutionMinutes: avg(data.resolutionTimes)
  })).sort((a, b) => b.count - a.count);

  // Compile Daypart Analytics
  const dayparts: DaypartAnalytics[] = Array.from(daypartStats.entries()).map(([dp, data]) => ({
    daypart: dp,
    totalTables: data.tables,
    totalGuests: data.guests,
    avgTurnMinutes: avg(data.turnTimes),
    avgTicketMinutes: avg(data.ticketTimes),
    totalSalesCents: data.salesCents,
    totalSalesFormatted: money(data.salesCents)
  })).filter((d) => d.totalTables > 0);

  return {
    generatedAt: now.toISOString(),
    dateRange: { from: now.toISOString(), to: now.toISOString(), label: "Current Shift & Service Period" },
    totalTablesAnalyzed: targetSessions.length,
    totalGuestsAnalyzed,
    totalSalesCents,
    totalSalesFormatted: money(totalSalesCents),

    avgGreetMinutes: avg(greetDurations),
    avgSeatedToOrderMinutes: avg(seatedToOrderDurations),
    avgTicketPrepMinutes: avg(ticketPrepDurations),
    avgFoodReadyToDeliveredMinutes: avg(readyToDeliveredDurations),
    avgCheckRequestToPaymentMinutes: avg(checkToPaymentDurations),
    avgTableTurnMinutes: avg(tableTurnDurations),

    voidRatePercent: totalOrderedItemsCount > 0 ? Math.round((totalVoidedItemsCount / totalOrderedItemsCount) * 1000) / 10 : 0,
    totalVoidedItemsCount,
    foodIssueRatePercent: targetSessions.length > 0 ? Math.round((totalFoodIssuesCount / targetSessions.length) * 1000) / 10 : 0,
    totalFoodIssuesCount,
    delayedTicketRatePercent: totalTicketsCount > 0 ? Math.round((totalDelayedTicketsCount / totalTicketsCount) * 1000) / 10 : 0,
    totalDelayedTicketsCount,

    requestTypeBreakdown,
    stations: stationResults,
    servers: serverResults,
    dayparts,
    metricDefinitions: METRIC_DEFINITIONS
  };
}
