import { describe, it, expect, beforeEach } from "bun:test";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  generateRotatingQRToken,
  validateRotatingQRToken
} from "@/lib/domain";

describe("Restaurant Operating System: Customer Table Session & Hospitality Boundaries", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  describe("1. Rotating QR Code Credentials & Expiration", () => {
    it("generates and validates active rotating QR tokens within grace window", () => {
      const now = new Date();
      const token = generateRotatingQRToken("sess_11", "Table 11", "test_secret", now);

      const result = validateRotatingQRToken(token, "sess_11", "test_secret", now);
      expect(result.valid).toBe(true);
      expect(result.payload?.tableLabel).toBe("Table 11");
    });

    it("rejects expired QR tokens from old screenshots (> 10m ago)", () => {
      const pastTime = new Date(Date.now() - 25 * 60 * 1000); // 25 min ago
      const expiredToken = generateRotatingQRToken("sess_11", "Table 11", "test_secret", pastTime);

      const now = new Date();
      const result = validateRotatingQRToken(expiredToken, "sess_11", "test_secret", now);
      expect(result.valid).toBe(false);
      expect(result.reason).toContain("QR code expired");
    });

    it("rejects mismatched session IDs or tampered token signatures", () => {
      const now = new Date();
      const token = generateRotatingQRToken("sess_11", "Table 11", "test_secret", now);

      // Validate against wrong session
      const wrongSession = validateRotatingQRToken(token, "sess_99", "test_secret", now);
      expect(wrongSession.valid).toBe(false);
      expect(wrongSession.reason).toContain("does not match active table session");

      // Validate with wrong secret
      const wrongSecret = validateRotatingQRToken(token, "sess_11", "hacked_secret", now);
      expect(wrongSecret.valid).toBe(false);
      expect(wrongSecret.reason).toContain("Invalid QR code signature");
    });
  });

  describe("2. Guest Proposal & Server Approval Gate", () => {
    it("allows guests to propose food items without direct unverified kitchen insertion", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_11",
        tableLabel: "Table 11",
        diningAreaId: "main",
        openedByEmployeeId: "emp_server",
        assignedServerId: "emp_server"
      });

      const { diner } = await service.addDiner(session.id, "Brandon", 1);

      // Guest proposes a pizza
      const { item } = await service.proposeItem(
        session.id,
        {
          menuItemId: "pizza_margherita",
          name: "Margherita Pizza",
          course: "mains",
          basePriceCents: 1900,
          quantity: 1,
          selectedModifiers: [],
          dinerId: diner.id,
          splitMode: "single",
          assignedDinerIds: [diner.id]
        },
        { actorType: "guest", actorId: diner.id }
      );

      expect(item.status).toBe("proposed");
      expect(item.proposedByDinerId).toBe(diner.id);

      // Verify domain event emitted
      const events = await repo.getEvents(session.id);
      const proposedEvt = events.find((e) => e.type === "ITEM_PROPOSED");
      expect(proposedEvt).toBeDefined();
      expect(proposedEvt?.actorType).toBe("guest");

      // Server approves item
      const { item: approvedItem } = await service.approveItem(
        session.id,
        item.id,
        { actorType: "employee", actorId: "emp_server" }
      );

      expect(approvedItem.status).toBe("confirmed");
      expect(approvedItem.confirmedByEmployeeId).toBe("emp_server");

      const approveEvt = (await repo.getEvents(session.id)).find((e) => e.type === "ITEM_APPROVED");
      expect(approveEvt).toBeDefined();
      expect(approveEvt?.actorType).toBe("employee");
    });
  });

  describe("3. Strict Permission Boundaries for Guests", () => {
    it("strictly blocks guests from voiding items, firing courses, approving proposals, and transferring tables", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_5",
        tableLabel: "Table 5",
        diningAreaId: "main",
        openedByEmployeeId: "emp_server",
        assignedServerId: "emp_server"
      });

      const { diner } = await service.addDiner(session.id, "GuestUser", 1);

      await service.addItem(session.id, {
        menuItemId: "salad_caesar",
        name: "Caesar Salad",
        course: "starters",
        basePriceCents: 1200,
        selectedModifiers: [],
        splitMode: "single",
        assignedDinerIds: [diner.id],
        dinerId: diner.id
      });

      const current = (await repo.findById(session.id))!;
      const saladItem = current.items[0];

      // 1. Guest attempts to void item -> REJECTED
      expect(
        service.voidItem(session.id, saladItem.id, "Changed mind", { actorType: "guest", actorId: diner.id })
      ).rejects.toThrow("Permission denied: Guests cannot void finalized items");

      // 2. Guest attempts to fire kitchen course -> REJECTED
      expect(
        service.fireCourse(session.id, "starters", { actorType: "guest", actorId: diner.id })
      ).rejects.toThrow("Permission denied: Guests cannot fire kitchen courses");

      // 3. Guest attempts to approve proposed item -> REJECTED
      expect(
        service.approveItem(session.id, saladItem.id, { actorType: "guest", actorId: diner.id })
      ).rejects.toThrow("Permission denied: Guests cannot approve proposed items");

      // 4. Guest attempts to transfer table -> REJECTED
      expect(
        service.transferTable(session.id, "emp_other", "Table swap", { actorType: "guest", actorId: diner.id })
      ).rejects.toThrow("Permission denied: Guests cannot transfer tables");

      // 5. Guest attempts to close table session -> REJECTED
      expect(
        service.closeTableSession(session.id, { actorType: "guest", actorId: diner.id })
      ).rejects.toThrow("Permission denied: Guests cannot close table sessions");
    });
  });

  describe("4. Guest Self-Service Requests & Pre-Split Personal Payment", () => {
    it("allows guests to submit universal requests and settle their individual share", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_8",
        tableLabel: "Table 8",
        diningAreaId: "main",
        openedByEmployeeId: "emp_server",
        assignedServerId: "emp_server"
      });

      const { diner: d1 } = await service.addDiner(session.id, "Sam", 1);

      // Guest creates a Refill request
      const { request } = await service.createGuestRequest(
        session.id,
        "REFILL",
        "Sparkling water refill please",
        d1.id,
        { actorType: "guest", actorId: d1.id }
      );

      expect(request.category).toBe("REFILL");
      expect(request.status).toBe("OPEN");
      expect(request.assignedRole).toBe("runner");

      // Guest adds confirmed item and pays their share
      await service.addItem(session.id, {
        menuItemId: "pizza_margherita",
        name: "Personal Margherita",
        course: "mains",
        basePriceCents: 1800,
        selectedModifiers: [],
        splitMode: "single",
        assignedDinerIds: [d1.id],
        dinerId: d1.id
      });

      // Settle diner payment via guest app
      const { payment, projection } = await service.processDinerPayment(
        session.id,
        d1.id,
        1949, // 1800 + tax
        360, // tip
        "mock_apple_pay_token",
        { actorType: "guest", actorId: d1.id }
      );

      expect(payment.dinerId).toBe(d1.id);
      expect(payment.amountCents).toBe(1949);
      expect(payment.tipCents).toBe(360);
      expect(projection.dinerBills.find((b) => b.dinerId === d1.id)?.paidCents).toBe(1949);
    });
  });
});
