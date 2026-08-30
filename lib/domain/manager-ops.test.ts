import { describe, it, expect, beforeEach } from "bun:test";
import { deriveManagerOperationsOverview } from "./models/manager-ops";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  type TableSession
} from "@/lib/domain";

describe("Restaurant Operating System: Manager Operations Command Center", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  describe("1. Live Operational State & Exception Aggregation", () => {
    it("aggregates critical food quality issues and overdue kitchen tickets", async () => {
      // Table 14: Food quality issue reported
      const { session: s14 } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_14",
        tableLabel: "Table 14",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });
      const { diner: d1 } = await service.addDiner(s14.id, "Alice", 1);
      await service.createGuestRequest(
        s14.id,
        "FOOD_ISSUE",
        "Pizza crust is completely burnt on one side",
        d1.id,
        { actorType: "guest", actorId: d1.id }
      );

      // Table 18: Delayed kitchen ticket
      const { session: s18 } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_18",
        tableLabel: "Table 18",
        diningAreaId: "patio",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });
      const { diner: d2 } = await service.addDiner(s18.id, "Bob", 1);
      await service.addItem(s18.id, {
        menuItemId: "pizza_margherita",
        name: "Margherita Pizza",
        course: "mains",
        stationId: "PIZZA",
        basePriceCents: 1900,
        selectedModifiers: [],
        splitMode: "single",
        assignedDinerIds: [d2.id],
        dinerId: d2.id
      });
      await service.fireCourse(s18.id, "mains");

      // Table 22: Clean table with no issues
      const { session: s22 } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_22",
        tableLabel: "Table 22",
        diningAreaId: "main",
        openedByEmployeeId: "emp_taylor",
        assignedServerId: "emp_taylor"
      });
      await service.addDiner(s22.id, "Charlie", 1);

      // Mutate ticket timestamp to simulate 25 minutes delay on Table 18
      const s18Obj = (await repo.findById(s18.id))!;
      s18Obj.tickets[0].createdAt = new Date(Date.now() - 25 * 60 * 1000).toISOString();
      await repo.save(s18Obj);

      const allSessions = await repo.listAll();
      const overview = deriveManagerOperationsOverview(allSessions);

      expect(overview.totalActiveTables).toBe(3);
      expect(overview.totalSeatedGuests).toBe(3);
      expect(overview.criticalCount).toBeGreaterThanOrEqual(1);

      // Food issue on Table 14 must be ranked top as CRITICAL
      const foodAlert = overview.needsAttention.find((a) => a.category === "FOOD_ISSUE");
      expect(foodAlert).toBeDefined();
      expect(foodAlert?.tableLabel).toBe("Table 14");
      expect(foodAlert?.severity).toBe("critical");
      expect(foodAlert?.can1TapResolve).toBe(true);

      // Kitchen delay on Table 18
      const ticketAlert = overview.needsAttention.find((a) => a.category === "TICKET_DELAY");
      expect(ticketAlert).toBeDefined();
      expect(ticketAlert?.tableLabel).toBe("Table 18");
      expect(ticketAlert?.elapsedMinutes).toBeGreaterThanOrEqual(24);

      // Kitchen flow summary
      expect(overview.kitchenFlow.totalDelayedTickets).toBeGreaterThanOrEqual(1);
      const pizzaStation = overview.kitchenFlow.stations.find((s) => s.stationId === "PIZZA");
      expect(pizzaStation).toBeDefined();
      expect(pizzaStation?.delayedCount).toBeGreaterThanOrEqual(1);
    });

    it("detects staff load imbalances across servers", async () => {
      // Assign 4 tables to Jordan, 1 table to Taylor
      const sessions: TableSession[] = [];

      for (let i = 1; i <= 4; i++) {
        const { session } = await service.openTableSession({
          restaurantId: "rest_1",
          locationId: "loc_1",
          tableId: `tbl_j_${i}`,
          tableLabel: `Table J${i}`,
          diningAreaId: "main",
          openedByEmployeeId: "emp_jordan",
          assignedServerId: "emp_jordan"
        });
        await service.addDiner(session.id, `Guest ${i}`, 1);
        sessions.push((await repo.findById(session.id))!);
      }

      const { session: sTaylor } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_t_1",
        tableLabel: "Table T1",
        diningAreaId: "patio",
        openedByEmployeeId: "emp_taylor",
        assignedServerId: "emp_taylor"
      });
      await service.addDiner(sTaylor.id, "Guest Taylor", 1);
      sessions.push((await repo.findById(sTaylor.id))!);

      const overview = deriveManagerOperationsOverview(sessions);

      expect(overview.staffLoad.servers.length).toBe(2);
      const jordanLoad = overview.staffLoad.servers.find((s) => s.employeeId === "emp_jordan");
      const taylorLoad = overview.staffLoad.servers.find((s) => s.employeeId === "emp_taylor");

      expect(jordanLoad?.tableCount).toBe(4);
      expect(jordanLoad?.isOverloaded).toBe(true);
      expect(taylorLoad?.tableCount).toBe(1);

      expect(overview.staffLoad.hasLoadImbalance).toBe(true);
      expect(overview.staffLoad.imbalanceRecommendation).toContain("Reassign");
    });
  });

  describe("2. Manager Intervention Workflows", () => {
    it("resolves escalated food issue and emits ESCALATION_RESOLVED audit event", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_14",
        tableLabel: "Table 14",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      const { diner } = await service.addDiner(session.id, "Alice", 1);
      const { request } = await service.createGuestRequest(
        session.id,
        "FOOD_ISSUE",
        "Steak cooked well-done instead of medium-rare",
        diner.id
      );

      expect(request.status).toBe("OPEN");

      // Manager tableside intervention & comp resolution
      const { request: resolvedReq, session: updatedSession } = await service.resolveEscalation(
        session.id,
        request.id,
        "Manager spoke with guest: remade steak medium-rare and comped dessert",
        { actorType: "employee", actorId: "emp_sam_mgr" }
      );

      expect(resolvedReq.status).toBe("COMPLETED");
      expect(resolvedReq.completedByEmployeeId).toBe("emp_sam_mgr");
      expect(resolvedReq.notes).toContain("remade steak");

      const escalationEvent = updatedSession.events.find((e) => e.type === "ESCALATION_RESOLVED");
      expect(escalationEvent).toBeDefined();
      expect(escalationEvent?.actorId).toBe("emp_sam_mgr");
    });

    it("tracks 86'd unavailable items in manager operations summary", () => {
      const emptySessions: TableSession[] = [];
      const unavailable = ["top_basil", "drink_negroni"];

      const overview = deriveManagerOperationsOverview(emptySessions, unavailable);
      expect(overview.unavailableItemIds).toContain("top_basil");
      expect(overview.unavailableItemIds).toContain("drink_negroni");
    });
  });
});
