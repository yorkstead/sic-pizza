import { describe, it, expect, beforeEach } from "bun:test";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  deriveTableTransferSummary,
  deriveSectionHandoffReport
} from "@/lib/domain";

describe("Restaurant Operating System: Instant Table Handoffs & Shift Transfers", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  describe("1. Deterministic Transfer Summary Derivation (Zero Brain Dump)", () => {
    it("derives complete operational briefing from live table session state", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_14",
        tableLabel: "Table 14",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      // Add 4 diners
      const { diner: d1 } = await service.addDiner(session.id, "Alice", 1);
      const { diner: d2 } = await service.addDiner(session.id, "Bob", 2);
      await service.addDiner(session.id, "Charlie", 3);
      await service.addDiner(session.id, "Diana", 4);

      // Add entrees and mark delivered
      const { item: entree } = await service.addItem(session.id, {
        menuItemId: "pizza_pep",
        name: "Hot Honey Pepperoni Pizza",
        course: "mains",
        basePriceCents: 2400,
        selectedModifiers: [],
        splitMode: "whole_table",
        assignedDinerIds: [d1.id, d2.id]
      });
      const sObj1 = (await repo.findById(session.id))!;
      sObj1.items.find((i) => i.id === entree.id)!.status = "delivered";
      await repo.save(sObj1);

      // Guest request for beer
      await service.createGuestRequest(
        session.id,
        "DRINK_REORDER",
        "Another Peroni Lager please",
        d1.id,
        { actorType: "guest", actorId: d1.id }
      );

      const current = (await repo.findById(session.id))!;
      const summary = deriveTableTransferSummary(current);

      expect(summary.tableLabel).toBe("Table 14");
      expect(summary.guestCount).toBe(4);
      expect(summary.dinerNames).toContain("Alice");
      expect(summary.dinerNames).toContain("Bob");
      expect(summary.coursingSummary).toBe("Entrées delivered");
      expect(summary.openRequestsCount).toBe(1);
      expect(summary.openRequestsSummary[0]).toContain("Drink reorder requested (Alice)");
      expect(summary.checkState).toBe("Check not requested");
      expect(summary.unpaidBalanceCents).toBe(2598); // 2400 + 8.25% tax
      expect(summary.kitchenStatus).toBe("No kitchen delays");
      expect(summary.bulletPoints.length).toBeGreaterThan(3);
    });

    it("derives coursing gap with held entrees and open condiment requests", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_18",
        tableLabel: "Table 18",
        diningAreaId: "patio",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      const { diner: d1 } = await service.addDiner(session.id, "Mike", 1);
      await service.addDiner(session.id, "Sarah", 2);

      // Appetizer delivered
      const { item: app } = await service.addItem(session.id, {
        menuItemId: "starter_knots",
        name: "Garlic Knots",
        course: "starters",
        basePriceCents: 800,
        selectedModifiers: [],
        splitMode: "single",
        assignedDinerIds: [d1.id],
        dinerId: d1.id
      });

      // Entree held
      const { item: main } = await service.addItem(session.id, {
        menuItemId: "pizza_margherita",
        name: "Margherita Pizza",
        course: "mains",
        basePriceCents: 1900,
        selectedModifiers: [],
        splitMode: "single",
        assignedDinerIds: [d1.id],
        dinerId: d1.id
      });

      const sObj2 = (await repo.findById(session.id))!;
      sObj2.items.find((i) => i.id === app.id)!.status = "delivered";
      sObj2.items.find((i) => i.id === main.id)!.status = "held";
      await repo.save(sObj2);

      // Condiment request
      await service.createGuestRequest(
        session.id,
        "CONDIMENT",
        "Extra garlic butter",
        d1.id
      );

      // Check request
      await service.createGuestRequest(
        session.id,
        "CHECK",
        "Ready for check please",
        d1.id
      );

      const current = (await repo.findById(session.id))!;
      const summary = deriveTableTransferSummary(current);

      expect(summary.coursingSummary).toBe("Appetizers delivered · Entrées held");
      expect(summary.openRequestsCount).toBe(2);
      expect(summary.checkState).toContain("Check requested");
    });
  });

  describe("2. Single Table Transfer Workflow & Request Reassignment", () => {
    it("transfers table ownership and automatically updates server-routed open requests", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_11",
        tableLabel: "Table 11",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      const { diner } = await service.addDiner(session.id, "Sam", 1);

      // Create server-routed check request
      const { request } = await service.createGuestRequest(
        session.id,
        "CHECK",
        "Bill please",
        diner.id
      );

      expect(request.assignedEmployeeId).toBe("emp_jordan");

      // Transfer table from Jordan to Morgan
      const { session: transferred } = await service.transferTable(
        session.id,
        "emp_morgan",
        "Break cover (30m)",
        { actorType: "employee", actorId: "emp_jordan" }
      );

      expect(transferred.assignedServerId).toBe("emp_morgan");

      // Verify request reassigned to Morgan
      const updatedReq = transferred.requests.find((r) => r.id === request.id);
      expect(updatedReq?.assignedEmployeeId).toBe("emp_morgan");

      // Verify TABLE_TRANSFERRED domain event with transferSummary payload
      const events = await repo.getEvents(session.id);
      const transferEvt = events.find((e) => e.type === "TABLE_TRANSFERRED");
      expect(transferEvt).toBeDefined();
      expect(transferEvt?.payload.fromEmployeeId).toBe("emp_jordan");
      expect(transferEvt?.payload.toEmployeeId).toBe("emp_morgan");
      expect(transferEvt?.payload.reason).toBe("Break cover (30m)");
      expect(transferEvt?.payload.transferSummary).toBeDefined();
    });
  });

  describe("3. Bulk Section Handoff & Aggregate Reporting", () => {
    it("transfers an entire server section and generates aggregate handoff report", async () => {
      // Create 3 active tables for Jordan
      const { session: s1 } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_1",
        tableLabel: "Table 1",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });
      await service.addDiner(s1.id, "Diner 1", 1);

      const { session: s2 } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_2",
        tableLabel: "Table 2",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });
      await service.addDiner(s2.id, "Diner 2", 1);

      const allSessions = await repo.listAll();
      const reportBefore = deriveSectionHandoffReport(allSessions, "emp_jordan");
      expect(reportBefore.totalTables).toBe(2);
      expect(reportBefore.totalGuests).toBe(2);

      // Bulk transfer entire section to Taylor for shift change
      const { sessions: transferredList } = await service.transferMultipleTables(
        [s1.id, s2.id],
        "emp_taylor",
        "Shift change handoff",
        { actorType: "employee", actorId: "emp_jordan" }
      );

      expect(transferredList.length).toBe(2);
      expect(transferredList.every((s) => s.assignedServerId === "emp_taylor")).toBe(true);

      const updatedAll = await repo.listAll();
      const jordanReportAfter = deriveSectionHandoffReport(updatedAll, "emp_jordan");
      const taylorReportAfter = deriveSectionHandoffReport(updatedAll, "emp_taylor");

      expect(jordanReportAfter.totalTables).toBe(0);
      expect(taylorReportAfter.totalTables).toBe(2);
    });
  });

  describe("4. Temporary Assistance & Secondary Server Assignment", () => {
    it("assigns and removes secondary assisting servers with immutable audit events", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_9",
        tableLabel: "Table 9",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      // Assign Alex (Bartender) as assistant
      const { session: sWithAssistant } = await service.assignAssistingServer(
        session.id,
        "emp_alex",
        { actorType: "employee", actorId: "emp_jordan" }
      );

      expect(sWithAssistant.assistingEmployeeIds).toContain("emp_alex");
      expect(sWithAssistant.assignedServerId).toBe("emp_jordan"); // Primary remains Jordan

      const events = await repo.getEvents(session.id);
      expect(events.some((e) => e.type === "ASSISTANT_ASSIGNED")).toBe(true);

      // Remove assistant
      const { session: sWithoutAssistant } = await service.removeAssistingServer(
        session.id,
        "emp_alex",
        { actorType: "employee", actorId: "emp_jordan" }
      );

      expect(sWithoutAssistant.assistingEmployeeIds).not.toContain("emp_alex");
      const updatedEvents = await repo.getEvents(session.id);
      expect(updatedEvents.some((e) => e.type === "ASSISTANT_REMOVED")).toBe(true);
    });
  });
});
