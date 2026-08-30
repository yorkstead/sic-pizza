import { describe, it, expect, beforeEach } from "bun:test";
import { deriveServiceAnalytics } from "./models/service-analytics";
import {
  InMemoryTableSessionRepository,
  TableSessionService
} from "@/lib/domain";

describe("Restaurant Operating System: Service Analytics That Explain Why", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  describe("1. Event-Derived Timing Calculations", () => {
    it("calculates accurate greet time, seated to order, and table turn duration", async () => {
      // Table 14: Opened at T=0
      const baseTime = new Date("2026-08-30T18:00:00.000Z");

      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_14",
        tableLabel: "Table 14",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      // Override openedAt to baseTime
      const sObj = (await repo.findById(session.id))!;
      sObj.openedAt = baseTime.toISOString();
      await repo.save(sObj);

      // Greeted / Diners seated at T+2m (18:02:00)
      const greetTime = new Date(baseTime.getTime() + 2 * 60 * 1000).toISOString();
      const { diner } = await service.addDiner(session.id, "Alice", 1);
      const sObjGreet = (await repo.findById(session.id))!;
      const dinerEvent = sObjGreet.events.find((e) => e.type === "DINER_ADDED");
      if (dinerEvent) dinerEvent.timestamp = greetTime;
      await repo.save(sObjGreet);

      // Food ordered at T+7m (18:07:00)
      const orderTime = new Date(baseTime.getTime() + 7 * 60 * 1000).toISOString();
      const { item } = await service.addItem(session.id, {
        menuItemId: "pizza_pep",
        name: "Pepperoni Pizza",
        course: "mains",
        stationId: "PIZZA",
        basePriceCents: 2200,
        selectedModifiers: [],
        splitMode: "single",
        assignedDinerIds: [diner.id],
        dinerId: diner.id
      });
      const sObjOrder = (await repo.findById(session.id))!;
      const itemEvent = sObjOrder.events.find((e) => e.type === "ITEM_ADDED");
      if (itemEvent) itemEvent.timestamp = orderTime;
      await repo.save(sObjOrder);

      // Fired at T+8m (18:08:00)
      await service.fireCourse(session.id, "mains");
      const sObjFired = (await repo.findById(session.id))!;
      sObjFired.tickets[0].createdAt = new Date(baseTime.getTime() + 8 * 60 * 1000).toISOString();

      // Pizza ready at T+20m (18:20:00) -> 12m prep time
      const readyTime = new Date(baseTime.getTime() + 20 * 60 * 1000).toISOString();
      sObjFired.events.push({
        id: "evt_ready_1",
        restaurantId: "rest_1",
        locationId: "loc_1",
        sessionId: session.id,
        aggregateType: "ticket",
        aggregateId: sObjFired.tickets[0].id,
        type: "ITEM_READY",
        payload: { ticketId: sObjFired.tickets[0].id, itemId: item.id },
        timestamp: readyTime,
        actorType: "employee",
        actorId: "emp_cook"
      });

      // Pizza delivered at T+22m (18:22:00) -> 2m runner lag
      const delivTime = new Date(baseTime.getTime() + 22 * 60 * 1000).toISOString();
      sObjFired.events.push({
        id: "evt_deliv_1",
        restaurantId: "rest_1",
        locationId: "loc_1",
        sessionId: session.id,
        aggregateType: "ticket",
        aggregateId: sObjFired.tickets[0].id,
        type: "ITEM_DELIVERED",
        payload: { ticketId: sObjFired.tickets[0].id, itemId: item.id },
        timestamp: delivTime,
        actorType: "employee",
        actorId: "emp_runner"
      });
      await repo.save(sObjFired);

      // Check requested at T+50m (18:50:00)
      const { request: checkReq } = await service.createGuestRequest(
        session.id,
        "CHECK",
        "Ready to pay",
        diner.id
      );
      const sObjReq = (await repo.findById(session.id))!;
      sObjReq.requests.find((r) => r.id === checkReq.id)!.createdAt = new Date(baseTime.getTime() + 50 * 60 * 1000).toISOString();

      // Payment settled at T+53m (18:53:00) -> 3m check-to-payment
      const payTime = new Date(baseTime.getTime() + 53 * 60 * 1000).toISOString();
      sObjReq.payments.push({
        id: "pay_1",
        checkId: "chk_1",
        sessionId: session.id,
        amountCents: 2200,
        tipCents: 400,
        method: "card",
        status: "captured",
        provider: "mock_gateway",
        actorType: "guest",
        createdAt: payTime
      });

      // Table closed at T+58m (18:58:00) -> 58m turn time
      sObjReq.closedAt = new Date(baseTime.getTime() + 58 * 60 * 1000).toISOString();
      await repo.save(sObjReq);

      const allSessions = await repo.listAll();
      const report = deriveServiceAnalytics(allSessions);

      // Verify timing metrics
      expect(report.avgGreetMinutes).toBe(2);
      expect(report.avgSeatedToOrderMinutes).toBe(7);
      expect(report.avgTicketPrepMinutes).toBe(12);
      expect(report.avgFoodReadyToDeliveredMinutes).toBe(2);
      expect(report.avgCheckRequestToPaymentMinutes).toBe(3);
      expect(report.avgTableTurnMinutes).toBe(58);
    });
  });

  describe("2. Station Production & Quality Rates", () => {
    it("calculates station breakdown, delayed ticket percentage, and void rates", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_1",
        tableLabel: "Table 01",
        diningAreaId: "main",
        openedByEmployeeId: "emp_taylor",
        assignedServerId: "emp_taylor"
      });

      const { diner } = await service.addDiner(session.id, "Bob", 1);

      // Add item 1 (Kept)
      await service.addItem(session.id, {
        menuItemId: "pizza_margherita",
        name: "Margherita",
        course: "mains",
        stationId: "PIZZA",
        basePriceCents: 1900,
        selectedModifiers: [],
        dinerId: diner.id
      });

      // Add item 2 and void it (Mistake)
      const { item: voidItem } = await service.addItem(session.id, {
        menuItemId: "starter_knots",
        name: "Garlic Knots",
        course: "starters",
        stationId: "FRY",
        basePriceCents: 800,
        selectedModifiers: [],
        dinerId: diner.id
      });
      await service.voidItem(session.id, voidItem.id, "Entered wrong table by mistake", {
        actorType: "employee",
        actorId: "emp_taylor"
      });

      // Fire pizza course
      await service.fireCourse(session.id, "mains");

      // Report a food issue
      await service.createGuestRequest(
        session.id,
        "FOOD_ISSUE",
        "Pizza undercooked in center",
        diner.id
      );

      const allSessions = await repo.listAll();
      const report = deriveServiceAnalytics(allSessions);

      // Void Rate: 1 voided out of 2 items = 50%
      expect(report.totalVoidedItemsCount).toBe(1);
      expect(report.voidRatePercent).toBe(50);

      // Food Issue Rate: 1 table with issue out of 1 = 100%
      expect(report.totalFoodIssuesCount).toBe(1);
      expect(report.foodIssueRatePercent).toBe(100);

      // Station Breakdown: PIZZA station present
      const pizzaStation = report.stations.find((s) => s.stationId === "PIZZA");
      expect(pizzaStation).toBeDefined();
      expect(pizzaStation?.totalTicketsCount).toBeGreaterThanOrEqual(1);

      // Request breakdown: FOOD_ISSUE present
      const foodReqBreakdown = report.requestTypeBreakdown.find((r) => r.category === "FOOD_ISSUE");
      expect(foodReqBreakdown).toBeDefined();
      expect(foodReqBreakdown?.count).toBe(1);
    });
  });

  describe("3. Contextual Server Workload & Metric Glossary", () => {
    it("contextualizes server performance with party size and explains metric definitions", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_party",
        tableLabel: "Table 30 (Party)",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      // 6 guests in party
      for (let i = 1; i <= 6; i++) {
        await service.addDiner(session.id, `Guest ${i}`, i);
      }

      const allSessions = await repo.listAll();
      const report = deriveServiceAnalytics(allSessions);

      const jordanServer = report.servers.find((s) => s.serverId === "emp_jordan");
      expect(jordanServer).toBeDefined();
      expect(jordanServer?.avgPartySize).toBe(6);
      expect(jordanServer?.contextNote).toContain("Large party section");

      // Verify Metric Definitions Glossary
      expect(report.metricDefinitions.GREET_TIME).toBeDefined();
      expect(report.metricDefinitions.GREET_TIME.startTrigger).toContain("TABLE_OPENED");
      expect(report.metricDefinitions.FOOD_READY_TO_DELIVERED.whyItMatters).toContain("lamps");
      expect(report.metricDefinitions.CHECK_REQUEST_TO_PAYMENT.targetBenchmarkMinutes).toBe(4);
    });
  });
});
