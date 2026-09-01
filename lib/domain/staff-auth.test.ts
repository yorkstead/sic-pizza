import { describe, it, expect, beforeEach } from "bun:test";
import {
  hashPin,
  timingSafeEqual,
  signToken,
  verifyToken,
  authenticateStaffPin,
  createManagerOverride,
  authorizeStaffAction
} from "../server/auth/staff-auth";
import {
  TableSessionService,
  InMemoryTableSessionRepository
} from "./index";

describe("Restaurant Operating System: Staff Authentication & Server RBAC", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  describe("1. Cryptographic PIN Hashing & Constant-Time Verification", () => {
    it("hashes PINs with PBKDF2-SHA256 and salt, preventing plaintext match", async () => {
      const salt = "salt_test_123";
      const hash1 = await hashPin("0420", salt);
      const hash2 = await hashPin("0420", salt);
      const hashWrong = await hashPin("9999", salt);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe("0420");
      expect(hash1).not.toBe(hashWrong);
      expect(timingSafeEqual(hash1, hash2)).toBe(true);
      expect(timingSafeEqual(hash1, hashWrong)).toBe(false);
    });

    it("authenticates valid seeded staff PINs and rejects incorrect ones", async () => {
      // 1. Server Jordan (PIN: 0420)
      const resJordan = await authenticateStaffPin("0420", "loc_downtown");
      expect(resJordan.success).toBe(true);
      expect(resJordan.payload?.role).toBe("server");
      expect(resJordan.payload?.displayName).toBe("Jordan Server");
      expect(resJordan.token).toBeDefined();

      // 2. Manager Alex (PIN: 8888)
      const resManager = await authenticateStaffPin("8888", "loc_downtown");
      expect(resManager.success).toBe(true);
      expect(resManager.payload?.role).toBe("manager");

      // 3. Invalid PIN
      const resInvalid = await authenticateStaffPin("0000", "loc_downtown");
      expect(resInvalid.success).toBe(false);
      expect(resInvalid.error).toContain("Invalid PIN");
    });
  });

  describe("2. Cryptographically Signed Session Tokens", () => {
    it("signs and verifies HMAC-SHA256 tokens and detects payload tampering", async () => {
      const payload = { userId: "emp_123", role: "server", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) };
      const token = await signToken(payload);

      const verified = await verifyToken<typeof payload>(token);
      expect(verified).not.toBeNull();
      expect(verified?.userId).toBe("emp_123");

      // Tamper with payload
      const [, sigB64] = token.split(".");
      const tamperedData = Buffer.from(JSON.stringify({ userId: "emp_admin", role: "admin" })).toString("base64url");
      const tamperedToken = `${tamperedData}.${sigB64}`;


      const tamperedVerified = await verifyToken(tamperedToken);
      expect(tamperedVerified).toBeNull();
    });

    it("rejects expired tokens automatically", async () => {
      const expiredPayload = {
        userId: "emp_old",
        exp: Math.floor(Date.now() / 1000) - 10, // 10 seconds in the past
        iat: Math.floor(Date.now() / 1000) - 100
      };

      const token = await signToken(expiredPayload);
      const verified = await verifyToken(token);
      expect(verified).toBeNull();
    });
  });

  describe("3. Role-Based Access Control (RBAC) Permission Boundaries", () => {
    it("enforces distinct permission boundaries between Server, Runner, Bartender, Expo, and Manager", async () => {
      // Server
      const jordanAuth = await authenticateStaffPin("0420", "loc_downtown");
      expect(jordanAuth.token).toBeDefined();

      const serverCanOpen = await authorizeStaffAction(jordanAuth.token, "TABLE_OPEN");
      const serverCanFire = await authorizeStaffAction(jordanAuth.token, "COURSE_FIRE");
      const serverCanVoid = await authorizeStaffAction(jordanAuth.token, "ITEM_VOID");

      expect(serverCanOpen.authorized).toBe(true);
      expect(serverCanFire.authorized).toBe(true);
      expect(serverCanVoid.authorized).toBe(false); // Server cannot void items!

      // Runner
      const runnerAuth = await authenticateStaffPin("1111", "loc_downtown");
      const runnerCanClaimReq = await authorizeStaffAction(runnerAuth.token, "REQUEST_CLAIM");
      const runnerCanFire = await authorizeStaffAction(runnerAuth.token, "COURSE_FIRE");
      const runnerCanOpen = await authorizeStaffAction(runnerAuth.token, "TABLE_OPEN");

      expect(runnerCanClaimReq.authorized).toBe(true);
      expect(runnerCanFire.authorized).toBe(false);
      expect(runnerCanOpen.authorized).toBe(false);

      // Expo
      const expoAuth = await authenticateStaffPin("3333", "loc_downtown");
      const expoCanBump = await authorizeStaffAction(expoAuth.token, "KDS_BUMP");
      const expoCanRecall = await authorizeStaffAction(expoAuth.token, "KDS_RECALL");
      const expoCanVoid = await authorizeStaffAction(expoAuth.token, "ITEM_VOID");

      expect(expoCanBump.authorized).toBe(true);
      expect(expoCanRecall.authorized).toBe(true);
      expect(expoCanVoid.authorized).toBe(false);

      // Manager
      const managerAuth = await authenticateStaffPin("8888", "loc_downtown");
      const managerCanVoid = await authorizeStaffAction(managerAuth.token, "ITEM_VOID");
      const managerCanOverride = await authorizeStaffAction(managerAuth.token, "MANAGER_OVERRIDE");

      expect(managerCanVoid.authorized).toBe(true);
      expect(managerCanOverride.authorized).toBe(true);
    });
  });

  describe("4. Manager Overrides for Protected Actions", () => {
    it("allows server actions requiring elevated permissions when accompanied by a valid manager override token", async () => {
      const serverAuth = await authenticateStaffPin("0420", "loc_downtown");

      // 1. Initial void attempt without override is denied
      const directVoid = await authorizeStaffAction(serverAuth.token, "ITEM_VOID");
      expect(directVoid.authorized).toBe(false);

      // 2. Request manager override with manager PIN
      const overrideRes = await createManagerOverride(
        "8888",
        "VOID_ITEM",
        "Customer changed mind after firing",
        "loc_downtown"
      );
      expect(overrideRes.success).toBe(true);
      expect(overrideRes.overrideToken).toBeDefined();

      // 3. Execute void with manager override token
      const authorizedVoid = await authorizeStaffAction(
        serverAuth.token,
        "ITEM_VOID",
        overrideRes.overrideToken
      );

      expect(authorizedVoid.authorized).toBe(true);
      expect(authorizedVoid.managerOverride?.managerName).toBe("Alex Manager");
    });

    it("rejects invalid manager PINs when requesting an override", async () => {
      const overrideRes = await createManagerOverride(
        "9999",
        "VOID_ITEM",
        "Invalid override attempt",
        "loc_downtown"
      );
      expect(overrideRes.success).toBe(false);
      expect(overrideRes.error).toContain("Invalid Manager PIN");
    });
  });

  describe("5. End-to-End Server-Authoritative Staff Workflow", () => {
    it("completes full table lifecycle with server validation and manager override audit", async () => {
      // 1. Authenticate server Jordan
      const serverAuth = await authenticateStaffPin("0420", "loc_downtown");
      expect(serverAuth.success).toBe(true);
      const serverToken = serverAuth.token!;

      // 2. Open table (server authorized)
      const authOpen = await authorizeStaffAction(serverToken, "TABLE_OPEN");
      expect(authOpen.authorized).toBe(true);

      const { session } = await service.openTableSession(
        {
          restaurantId: "sic_pizza_org",
          locationId: "loc_downtown",
          tableId: "tbl_11",
          tableLabel: "Table 11",
          diningAreaId: "area_main",
          openedByEmployeeId: serverAuth.payload!.employeeId,
          assignedServerId: serverAuth.payload!.employeeId,
          initialDiners: ["Alice", "Bob"]
        },
        { actorType: "employee", actorId: serverAuth.payload!.employeeId }
      );

      // 3. Propose and approve pizza
      const addRes = await service.addItem(
        session.id,
        {
          menuItemId: "pizza_pep",
          name: "Pepperoni Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1900,
          dinerId: session.diners[0].id
        },
        { actorType: "employee", actorId: serverAuth.payload!.employeeId }
      );

      // 4. Fire course to kitchen (server authorized)
      const authFire = await authorizeStaffAction(serverToken, "COURSE_FIRE");
      expect(authFire.authorized).toBe(true);

      const fireRes = await service.fireCourse(session.id, "mains", {
        actorType: "employee",
        actorId: serverAuth.payload!.employeeId
      });
      expect(fireRes.tickets.length).toBe(1);

      // 5. Customer asks to cancel/void item -> Server denied, manager override required
      const authVoidServer = await authorizeStaffAction(serverToken, "ITEM_VOID");
      expect(authVoidServer.authorized).toBe(false);

      const override = await createManagerOverride(
        "8888",
        "VOID_ITEM",
        "Customer ordered wrong crust",
        "loc_downtown"
      );
      const authVoidWithOverride = await authorizeStaffAction(
        serverToken,
        "ITEM_VOID",
        override.overrideToken
      );
      expect(authVoidWithOverride.authorized).toBe(true);

      // Void item with mandatory audit reason
      const voidRes = await service.voidItem(
        session.id,
        addRes.item.id,
        "Customer ordered wrong crust (Manager Approved: Alex Manager)",
        { actorType: "employee", actorId: serverAuth.payload!.employeeId }
      );
      expect(voidRes.item.status).toBe("voided");
      expect(voidRes.item.voidReason).toContain("Alex Manager");

      // 6. Close session
      const authClose = await authorizeStaffAction(serverToken, "TABLE_CLOSE");
      expect(authClose.authorized).toBe(true);

      const closeRes = await service.closeTableSession(session.id, {
        actorType: "employee",
        actorId: serverAuth.payload!.employeeId
      });
      expect(closeRes.session.closedAt).toBeDefined();
    });
  });
});
