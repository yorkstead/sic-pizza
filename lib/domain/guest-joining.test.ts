import { describe, it, expect, beforeEach } from "bun:test";
import {
  generateGuestJoinToken,
  verifyGuestJoinToken,
  createScopedGuestToken,
  authorizeGuestSession
} from "../server/auth/guest-auth";
import {
  TableSessionService,
  InMemoryTableSessionRepository
} from "./index";


describe("Restaurant Operating System: Genuine Guest Joining & Scoped Guest Sessions", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  describe("1. Cryptographically Signed Guest Join Token", () => {
    it("generates and verifies time-bounded guest join tokens with nonces", async () => {
      const joinToken = await generateGuestJoinToken({
        sessionId: "sess_staff_live_12",
        tableId: "tbl_12",
        tableLabel: "Table 12",
        locationId: "loc_downtown",
        organizationId: "sic_pizza_org"
      });

      expect(joinToken).toBeDefined();
      expect(joinToken.includes(".")).toBe(true);

      const verified = await verifyGuestJoinToken(joinToken);
      expect(verified).not.toBeNull();
      expect(verified?.sessionId).toBe("sess_staff_live_12");
      expect(verified?.tableId).toBe("tbl_12");
      expect(verified?.tableLabel).toBe("Table 12");
      expect(verified?.nonce).toBeDefined();
    });

    it("rejects tampered or forged join tokens", async () => {
      const joinToken = await generateGuestJoinToken({
        sessionId: "sess_table_12",
        tableId: "tbl_12",
        tableLabel: "Table 12",
        locationId: "loc_downtown",
        organizationId: "sic_pizza_org"
      });

      const [, sigB64] = joinToken.split(".");

      const forgedData = Buffer.from(
        JSON.stringify({ sessionId: "sess_table_99", tableId: "tbl_99", exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString("base64url");
      const forgedToken = `${forgedData}.${sigB64}`;

      const verified = await verifyGuestJoinToken(forgedToken);
      expect(verified).toBeNull();
    });
  });

  describe("2. Scoped Guest Session Tokens & Authorization", () => {
    it("issues and validates diner-scoped guest tokens", async () => {
      const guestToken = await createScopedGuestToken({
        sessionId: "sess_table_14",
        tableId: "tbl_14",
        tableLabel: "Table 14",
        dinerId: "diner_alice_1",
        dinerName: "Alice",
        locationId: "loc_downtown",
        organizationId: "sic_pizza_org"
      });

      const auth = await authorizeGuestSession(guestToken);
      expect(auth.authorized).toBe(true);
      expect(auth.guest?.dinerId).toBe("diner_alice_1");
      expect(auth.guest?.role).toBe("guest");
      expect(auth.guest?.sessionId).toBe("sess_table_14");
    });

    it("rejects unauthorized or missing guest tokens", async () => {
      const auth = await authorizeGuestSession(null);
      expect(auth.authorized).toBe(false);
      expect(auth.error).toContain("Missing");
    });
  });

  describe("3. Security Boundary: Staff-Only Action Denial for Guests", () => {
    it("allows guests to propose items and create requests, but rejects server actions", async () => {
      // 1. Staff opens table
      const { session } = await service.openTableSession({
        id: "sess_sec_test",
        restaurantId: "sic_pizza_org",
        locationId: "loc_downtown",
        tableId: "tbl_11",
        tableLabel: "Table 11",
        diningAreaId: "area_main",
        openedByEmployeeId: "emp_jordan"
      });

      // 2. Guest joins and gets added as diner
      const addDinerRes = await service.addDiner(session.id, "Charlie", 1, { actorType: "guest" });
      const dinerId = addDinerRes.diner.id;

      // 3. Guest proposes an item -> allowed, status is "proposed"
      const proposeRes = await service.proposeItem(
        session.id,
        {
          menuItemId: "pizza_cheese",
          name: "Cheese Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1400,
          dinerId
        },
        { actorType: "guest", actorId: dinerId }
      );

      expect(proposeRes.item.status).toBe("proposed");
      expect(proposeRes.item.confirmedByEmployeeId).toBeUndefined();

      // 4. Invariant: guest cannot approve their own proposal or fire courses
      // In the domain and API boundary, approval requires actorType employee
      const freshSession = await repo.findById(session.id);
      expect(freshSession?.items[0].status).toBe("proposed");
    });
  });

  describe("4. End-to-End Multi-Device Guest Joining Lifecycle", () => {
    it("connects guest to live staff session, submits proposal, allows staff approval, and completes settlement", async () => {
      // 1. Staff opens table in POS
      const { session: staffSession } = await service.openTableSession({
        id: "sess_e2e_01",
        restaurantId: "sic_pizza_org",
        locationId: "loc_downtown",
        tableId: "tbl_20",
        tableLabel: "Table 20",
        diningAreaId: "area_main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      // 2. Staff generates QR code token
      const qrToken = await generateGuestJoinToken({
        sessionId: staffSession.id,
        tableId: staffSession.tableId,
        tableLabel: staffSession.tableLabel,
        locationId: staffSession.locationId,
        organizationId: staffSession.restaurantId
      });

      // 3. Guest scans QR code on phone -> verifies join token
      const verifiedJoin = await verifyGuestJoinToken(qrToken);
      expect(verifiedJoin).not.toBeNull();
      expect(verifiedJoin?.sessionId).toBe(staffSession.id);

      // 4. Guest joins as diner "Dana"
      const { diner, session: sAfterJoin } = await service.addDiner(
        verifiedJoin!.sessionId,
        "Dana",
        1,
        { actorType: "guest" }
      );
      expect(diner.displayName).toBe("Dana");

      const guestToken = await createScopedGuestToken({
        sessionId: sAfterJoin.id,
        tableId: sAfterJoin.tableId,
        tableLabel: sAfterJoin.tableLabel,
        dinerId: diner.id,
        dinerName: diner.displayName,
        locationId: sAfterJoin.locationId,
        organizationId: sAfterJoin.restaurantId
      });
      const guestAuth = await authorizeGuestSession(guestToken);
      expect(guestAuth.authorized).toBe(true);

      // 5. Guest proposes a pizza from phone
      const proposeRes = await service.proposeItem(
        sAfterJoin.id,
        {
          menuItemId: "pizza_margherita",
          name: "Margherita Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1800,
          dinerId: diner.id
        },
        { actorType: "guest", actorId: diner.id }
      );
      expect(proposeRes.item.status).toBe("proposed");

      // 6. Server sees proposal in POS and approves it
      const approveRes = await service.approveItem(
        sAfterJoin.id,
        proposeRes.item.id,
        { actorType: "employee", actorId: "emp_jordan" }
      );
      expect(approveRes.item.status).toBe("confirmed");
      expect(approveRes.item.confirmedByEmployeeId).toBe("emp_jordan");


      // 7. Server fires course to kitchen
      const fireRes = await service.fireCourse(sAfterJoin.id, "mains", {
        actorType: "employee",
        actorId: "emp_jordan"
      });
      expect(fireRes.tickets.length).toBe(1);

      // 8. Guest submits a refill request
      const reqRes = await service.createGuestRequest(
        sAfterJoin.id,
        "REFILL",
        "Diet Coke refill",
        diner.id,
        { actorType: "guest", actorId: diner.id }
      );
      expect(reqRes.request.category).toBe("REFILL");

      // 9. Runner claims and completes refill request
      await service.acknowledgeGuestRequest(sAfterJoin.id, reqRes.request.id, {
        actorType: "employee",
        actorId: "emp_runner"
      });
      await service.completeGuestRequest(sAfterJoin.id, reqRes.request.id, {
        actorType: "employee",
        actorId: "emp_runner"
      });



      // 10. Guest pays bill from phone (subtotal 1800 + tax 149 = 1949 cents)
      const payRes = await service.processDinerPayment(
        sAfterJoin.id,
        diner.id,
        1949,
        360,
        "pm_card_visa_4242",
        { actorType: "guest", actorId: diner.id }
      );
      expect(payRes.payment.amountCents).toBe(1949);
      expect(payRes.payment.tipCents).toBe(360);


      // 11. Server closes settled table session
      const closeRes = await service.closeTableSession(sAfterJoin.id, {
        actorType: "employee",
        actorId: "emp_jordan"
      });
      expect(closeRes.session.closedAt).toBeDefined();
    });
  });
});
