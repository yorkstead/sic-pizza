import { describe, it, expect, beforeEach } from "bun:test";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  ClientMutationQueue
} from "@/lib/domain";

describe("Restaurant Operating System: Offline & Idempotent Mutation Foundation", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  describe("1. Server-Side Idempotent Mutation Deduplication", () => {
    it("deduplicates repeated addItem submissions with the same idempotency key (zero duplicate items)", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_12",
        tableLabel: "Table 12",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      const { diner } = await service.addDiner(session.id, "Mike", 1);
      const idempotencyKey = "mut_add_pizza_12345";

      // First submission
      const res1 = await service.addItem(
        session.id,
        {
          menuItemId: "pizza_pep",
          name: "Pepperoni Pizza",
          course: "mains",
          stationId: "PIZZA",
          basePriceCents: 2200,
          dinerId: diner.id
        },
        {
          actorType: "employee",
          actorId: "emp_jordan",
          idempotencyKey
        }
      );

      expect(res1.session.items.length).toBe(1);
      expect(res1.item.id).toBeDefined();

      // Network retry (identical idempotency key)
      const res2 = await service.addItem(
        session.id,
        {
          menuItemId: "pizza_pep",
          name: "Pepperoni Pizza",
          course: "mains",
          stationId: "PIZZA",
          basePriceCents: 2200,
          dinerId: diner.id
        },
        {
          actorType: "employee",
          actorId: "emp_jordan",
          idempotencyKey
        }
      );

      // Invariant check: Items array still has EXACTLY 1 item, same itemId returned
      const refreshed = (await repo.findById(session.id))!;
      expect(refreshed.items.length).toBe(1);
      expect(res2.item.id).toBe(res1.item.id);
      expect(res2.session.items.length).toBe(1);
    });

    it("deduplicates repeated fireCourse submissions with the same idempotency key (zero duplicate kitchen tickets)", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_14",
        tableLabel: "Table 14",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      const { diner } = await service.addDiner(session.id, "Sarah", 1);

      await service.addItem(session.id, {
        menuItemId: "pizza_margherita",
        name: "Margherita Pizza",
        course: "mains",
        stationId: "PIZZA",
        basePriceCents: 1900,
        dinerId: diner.id
      });

      const fireKey = "mut_fire_mains_998877";

      // First fire call
      const fireRes1 = await service.fireCourse(session.id, "mains", {
        actorType: "employee",
        actorId: "emp_jordan",
        idempotencyKey: fireKey
      });

      expect(fireRes1.tickets.length).toBe(1);
      const ticketId1 = fireRes1.tickets[0].id;

      // Simulated network retry of fireCourse (e.g. Wi-Fi blip during POST)
      const fireRes2 = await service.fireCourse(session.id, "mains", {
        actorType: "employee",
        actorId: "emp_jordan",
        idempotencyKey: fireKey
      });

      const refreshed = (await repo.findById(session.id))!;
      // Critical Invariant: Kitchen ticket count remains EXACTLY 1
      expect(refreshed.tickets.length).toBe(1);
      expect(fireRes2.tickets[0].id).toBe(ticketId1);
    });

    it("deduplicates payment processing with the same idempotency key (zero double charge)", async () => {
      const { session } = await service.openTableSession({
        restaurantId: "rest_1",
        locationId: "loc_1",
        tableId: "tbl_20",
        tableLabel: "Table 20",
        diningAreaId: "main",
        openedByEmployeeId: "emp_jordan",
        assignedServerId: "emp_jordan"
      });

      const { diner } = await service.addDiner(session.id, "Chris", 1);
      await service.addItem(session.id, {
        menuItemId: "pizza_pep",
        name: "Pepperoni Pizza",
        course: "mains",
        basePriceCents: 2000,
        dinerId: diner.id
      });

      const payKey = "mut_pay_card_554433";

      // First payment capture
      const pay1 = await service.processDinerPayment(
        session.id,
        diner.id,
        2000,
        400,
        "ref_gateway_1",
        {
          actorType: "guest",
          actorId: diner.id,
          idempotencyKey: payKey
        }
      );

      expect(pay1.payment.id).toBeDefined();
      expect(pay1.session.payments.length).toBe(1);

      // Duplicate payment submission (network retry)
      const pay2 = await service.processDinerPayment(
        session.id,
        diner.id,
        2000,
        400,
        "ref_gateway_1",
        {
          actorType: "guest",
          actorId: diner.id,
          idempotencyKey: payKey
        }
      );

      const refreshed = (await repo.findById(session.id))!;
      expect(refreshed.payments.length).toBe(1);
      expect(pay2.payment.id).toBe(pay1.payment.id);
    });
  });

  describe("2. Client Mutation Queue & Connectivity Transitions", () => {
    it("queues mutations locally when offline and syncs idempotently upon reconnection", async () => {
      const queue = new ClientMutationQueue();
      queue.setConnectivity("offline");

      expect(queue.getConnectivity()).toBe("offline");

      // Enqueue 2 mutations while offline
      const m1 = queue.enqueue("ADD_ITEM", "sess_100", { name: "Margherita" }, 1);
      const m2 = queue.enqueue("FIRE_COURSE", "sess_100", { course: "mains" }, 1);

      expect(queue.getQueue().length).toBe(2);
      expect(m1.status).toBe("pending");
      expect(m2.status).toBe("pending");

      // Flushing while offline does not sync
      const dryRun = await queue.flush(async () => ({ success: true }));
      expect(dryRun.synced).toBe(0);

      // Network reconnects
      queue.setConnectivity("online");
      expect(queue.getConnectivity()).toBe("online");

      const executedKeys: string[] = [];
      const flushResult = await queue.flush(async (mutation) => {
        executedKeys.push(mutation.idempotencyKey);
        return { success: true, data: { status: "recorded" } };
      });

      expect(flushResult.synced).toBe(2);
      expect(executedKeys).toEqual([m1.idempotencyKey, m2.idempotencyKey]);

      const afterSync = queue.getQueue();
      expect(afterSync.every((m) => m.status === "synced")).toBe(true);
    });

    it("handles retry backoff on simulated transport failure", async () => {
      const queue = new ClientMutationQueue();
      queue.enqueue("CREATE_REQUEST", "sess_200", { category: "WATER" });

      let attempts = 0;
      await queue.flush(async () => {
        attempts += 1;
        throw new Error("HTTP 504 Gateway Timeout");
      });

      expect(attempts).toBe(1);
      const updatedQueue = queue.getQueue();
      expect(updatedQueue[0].status).toBe("retrying");
      expect(updatedQueue[0].retryCount).toBe(1);
      expect(updatedQueue[0].error).toContain("504");
    });
  });
});
