import { describe, it, expect, beforeEach } from "bun:test";
import {
  routeRequest,
  normalizeRequestCategory,
  deriveRequestAgeMinutes,
  deriveRequestEscalation,
  TableSessionService,
  InMemoryTableSessionRepository,
  type TableSession
} from "@/lib/domain";

describe("Restaurant Operating System: Universal Staff Attention Queue & Request Routing", () => {
  describe("Deterministic Role Routing Rules", () => {
    it("routes condiment, refill, utensils, and to-go boxes to runners", () => {
      const condiment = routeRequest("CONDIMENT");
      expect(condiment.assignedRole).toBe("runner");
      expect(condiment.priority).toBe("NORMAL");

      const refill = routeRequest("REFILL");
      expect(refill.assignedRole).toBe("runner");
      expect(refill.priority).toBe("NORMAL");

      const utensils = routeRequest("UTENSILS");
      expect(utensils.assignedRole).toBe("runner");
      expect(utensils.priority).toBe("NORMAL");

      const toGoBox = routeRequest("TO_GO_BOX");
      expect(toGoBox.assignedRole).toBe("runner");
      expect(toGoBox.priority).toBe("LOW");
    });

    it("routes drink reorders and checks directly to the assigned server", () => {
      const serverId = "emp_server_jordan";

      const drink = routeRequest("DRINK_REORDER", { assignedServerId: serverId });
      expect(drink.assignedRole).toBe("server");
      expect(drink.assignedEmployeeId).toBe(serverId);
      expect(drink.priority).toBe("NORMAL");

      const check = routeRequest("CHECK", { assignedServerId: serverId });
      expect(check.assignedRole).toBe("server");
      expect(check.assignedEmployeeId).toBe(serverId);
      expect(check.priority).toBe("HIGH");

      const serverNeeded = routeRequest("SERVER_NEEDED", { assignedServerId: serverId });
      expect(serverNeeded.assignedRole).toBe("server");
      expect(serverNeeded.assignedEmployeeId).toBe(serverId);
      expect(serverNeeded.priority).toBe("HIGH");
    });

    it("routes missing items to expo with HIGH priority", () => {
      const missing = routeRequest("MISSING_ITEM");
      expect(missing.assignedRole).toBe("expo");
      expect(missing.priority).toBe("HIGH");
      expect(missing.maxResponseMinutes).toBe(4);
    });

    it("routes food quality issues to manager with URGENT priority", () => {
      const foodIssue = routeRequest("FOOD_ISSUE");
      expect(foodIssue.assignedRole).toBe("manager");
      expect(foodIssue.priority).toBe("URGENT");
      expect(foodIssue.maxResponseMinutes).toBe(3);
    });

    it("normalizes legacy request strings correctly", () => {
      expect(normalizeRequestCategory("water_refill")).toBe("REFILL");
      expect(normalizeRequestCategory("call_server")).toBe("SERVER_NEEDED");
      expect(normalizeRequestCategory("drop_check")).toBe("CHECK");
      expect(normalizeRequestCategory("condiments")).toBe("CONDIMENT");
      expect(normalizeRequestCategory("cutlery")).toBe("UTENSILS");
      expect(normalizeRequestCategory("custom")).toBe("OTHER");
    });
  });

  describe("Request Age and Escalation Derivation", () => {
    it("derives correct age in elapsed minutes", () => {
      const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      const age = deriveRequestAgeMinutes(fiveMinsAgo);
      expect(age).toBe(5);
    });

    it("evaluates NORMAL -> OVERDUE -> ESCALATED states against target response times", () => {
      const now = new Date();

      // Food issue has 3m target
      const foodIssueReq = {
        id: "req_1",
        sessionId: "s1",
        tableId: "t1",
        tableLabel: "Table 11",
        category: "FOOD_ISSUE" as const,
        priority: "URGENT" as const,
        status: "OPEN" as const,
        assignedRole: "manager" as const,
        createdAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString(), // 2m ago (normal)
        escalationState: "NORMAL" as const
      };
      expect(deriveRequestEscalation(foodIssueReq, now)).toBe("NORMAL");

      // 4m ago -> OVERDUE (> 3m)
      foodIssueReq.createdAt = new Date(now.getTime() - 4 * 60 * 1000).toISOString();
      expect(deriveRequestEscalation(foodIssueReq, now)).toBe("OVERDUE");

      // 7m ago -> ESCALATED (> 6m = 2x target)
      foodIssueReq.createdAt = new Date(now.getTime() - 7 * 60 * 1000).toISOString();
      expect(deriveRequestEscalation(foodIssueReq, now)).toBe("ESCALATED");

      // Completed requests are always NORMAL
      const completedReq = {
        ...foodIssueReq,
        status: "COMPLETED" as const,
        completedAt: now.toISOString()
      };
      expect(deriveRequestEscalation(completedReq, now)).toBe("NORMAL");
    });
  });

  describe("Lifecycle Transitions & Service Methods", () => {
    let repo: InMemoryTableSessionRepository;
    let service: TableSessionService;
    let session: TableSession;

    beforeEach(async () => {
      repo = new InMemoryTableSessionRepository();
      service = new TableSessionService(repo);

      const res = await service.openTableSession(
        {
          restaurantId: "rest_1",
          locationId: "loc_1",
          tableId: "tbl_11",
          tableLabel: "Table 11",
          diningAreaId: "main_dining",
          openedByEmployeeId: "emp_server_jordan",
          assignedServerId: "emp_server_jordan",
          initialDiners: ["Alex"]
        },
        { actorType: "employee", actorId: "emp_server_jordan" }
      );
      session = res.session;
    });

    it("creates, acknowledges, claims, starts, and completes a request with full event records", async () => {
      // 1. Create request
      const { request: created } = await service.createGuestRequest(
        session.id,
        "CONDIMENT",
        "Extra garlic butter",
        session.diners[0].id,
        { actorType: "guest", actorId: "guest_alex" }
      );

      expect(created.category).toBe("CONDIMENT");
      expect(created.status).toBe("OPEN");
      expect(created.assignedRole).toBe("runner");

      // 2. Acknowledge request
      const { request: acked } = await service.acknowledgeGuestRequest(session.id, created.id, {
        actorType: "employee",
        actorId: "emp_runner_luigi"
      });
      expect(acked.status).toBe("ACKNOWLEDGED");
      expect(acked.acknowledgedByEmployeeId).toBe("emp_runner_luigi");
      expect(acked.acknowledgedAt).toBeDefined();

      // 3. Claim request
      const { request: claimed } = await service.claimGuestRequest(
        session.id,
        created.id,
        "emp_runner_luigi",
        { actorType: "employee", actorId: "emp_runner_luigi" }
      );
      expect(claimed.assignedEmployeeId).toBe("emp_runner_luigi");

      // 4. Start request
      const { request: inPrep } = await service.startGuestRequest(
        session.id,
        created.id,
        "emp_runner_luigi",
        { actorType: "employee", actorId: "emp_runner_luigi" }
      );
      expect(inPrep.status).toBe("IN_PROGRESS");
      expect(inPrep.inProgressAt).toBeDefined();

      // 5. Complete request
      const { request: done } = await service.completeGuestRequest(session.id, created.id, {
        actorType: "employee",
        actorId: "emp_runner_luigi"
      });
      expect(done.status).toBe("COMPLETED");
      expect(done.completedAt).toBeDefined();

      // Verify domain events
      const events = await repo.getEvents(session.id);
      const reqEvents = events.filter((e) => e.aggregateType === "request");
      expect(reqEvents.map((e) => e.type)).toEqual([
        "REQUEST_CREATED",
        "REQUEST_ACKNOWLEDGED",
        "REQUEST_CLAIMED",
        "REQUEST_IN_PROGRESS",
        "REQUEST_COMPLETED"
      ]);
    });

    it("cancels an open request with mandatory audit reason", async () => {
      const { request: created } = await service.createGuestRequest(
        session.id,
        "UTENSILS",
        "Extra fork",
        undefined,
        { actorType: "guest" }
      );

      const { request: cancelled } = await service.cancelGuestRequest(
        session.id,
        created.id,
        "Guest already received fork from food runner",
        { actorType: "employee", actorId: "emp_server_jordan" }
      );

      expect(cancelled.status).toBe("CANCELLED");
      expect(cancelled.cancellationReason).toBe("Guest already received fork from food runner");
      expect(cancelled.cancelledByEmployeeId).toBe("emp_server_jordan");

      // Cannot complete cancelled request
      expect(
        service.completeGuestRequest(session.id, created.id, {
          actorType: "employee",
          actorId: "emp_server_jordan"
        })
      ).rejects.toThrow("Cannot complete cancelled request");
    });

    it("blocks closing table sessions with unresolved open requests", async () => {
      await service.createGuestRequest(session.id, "SERVER_NEEDED", "Need server");

      expect(
        service.closeTableSession(session.id, {
          actorType: "employee",
          actorId: "emp_server_jordan"
        })
      ).rejects.toThrow("uncompleted guest requests");
    });
  });
});
