import { describe, it, expect, beforeEach } from "bun:test";
import { CommandOutbox } from "../client/outbox/command-outbox";

describe("Restaurant Operating System: Offline Command Outbox & Uncertain Outcomes", () => {
  let outbox: CommandOutbox;

  beforeEach(() => {
    outbox = new CommandOutbox();
    outbox.reset();
  });

  describe("1. Durable Command Enqueueing & Idempotency Key Generation", () => {
    it("enqueues commands with unique cryptographic idempotency keys and initial QUEUED status", () => {
      const cmd1 = outbox.enqueue({
        endpoint: "/api/staff/sessions/sess_11/action",
        actionName: "add_item",
        description: "Add Large Sicilian Pizza",
        payload: { menuItemId: "pizza_sicilian", basePriceCents: 2400 },
        token: "staff_token_abc"
      });

      const cmd2 = outbox.enqueue({
        endpoint: "/api/staff/sessions/sess_11/action",
        actionName: "fire_course",
        description: "Fire Mains Course",
        payload: { course: "mains" },
        token: "staff_token_abc"
      });

      expect(cmd1.id).toBeDefined();
      expect(cmd1.idempotencyKey).toBeDefined();
      expect(cmd1.status).toBe("QUEUED");
      expect(cmd2.idempotencyKey).not.toBe(cmd1.idempotencyKey);
      expect(outbox.getPendingCount()).toBe(2);
      expect(outbox.getCommands().length).toBe(2);
    });
  });

  describe("2. Outbox Processing & Successful Synchronization", () => {
    it("processes queued commands through mock fetch and marks them SYNCED", async () => {
      outbox.enqueue({
        endpoint: "/api/staff/sessions/sess_12/action",
        actionName: "approve_proposal",
        description: "Approve Guest Garlic Knots",
        payload: { orderItemId: "item_knots_01" }
      });

      // Mock server fetch returning 200 OK
      const mockFetch = (async (url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, idempotencyKey: body.idempotencyKey, itemStatus: "confirmed" })
        } as unknown as Response;
      }) as unknown as typeof fetch;


      const result = await outbox.processOutbox(mockFetch);
      expect(result.processed).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);

      const cmds = outbox.getCommands();
      expect(cmds[0].status).toBe("SYNCED");
      expect((cmds[0].response as { itemStatus: string }).itemStatus).toBe("confirmed");
      expect(outbox.getPendingCount()).toBe(0);
    });
  });

  describe("3. Uncertain Outcome Handling on Network Drops", () => {
    it("marks command as UNKNOWN_OUTCOME when network fails, preserving for reconnect retry", async () => {
      const cmd = outbox.enqueue({
        endpoint: "/api/staff/sessions/sess_14/action",
        actionName: "add_item",
        description: "Add Calzone in Walk-in Cooler",
        payload: { menuItemId: "calzone_01" }
      });

      // Mock network failure (offline / timeout)
      const mockFailingFetch = (async () => {
        throw new Error("Network request failed (offline dead-zone)");
      }) as unknown as typeof fetch;

      const result = await outbox.processOutbox(mockFailingFetch);
      expect(result.processed).toBe(1);
      expect(result.failed).toBe(1);

      const cmds = outbox.getCommands();
      expect(cmds[0].status).toBe("UNKNOWN_OUTCOME");
      expect(cmds[0].error).toContain("offline dead-zone");
      expect(cmds[0].idempotencyKey).toBe(cmd.idempotencyKey); // Idempotency key is preserved

      // When network recovers, retry uses the exact same idempotency key
      const mockSuccessFetch = (async (url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, keyUsed: body.idempotencyKey })
        } as unknown as Response;
      }) as unknown as typeof fetch;


      outbox.retry(cmd.id);
      const retryResult = await outbox.processOutbox(mockSuccessFetch);
      expect(retryResult.succeeded).toBe(1);
      expect(outbox.getCommands()[0].status).toBe("SYNCED");
    });
  });

  describe("4. Server Conflict (409) & Client Error (400) Isolation", () => {
    it("marks command as REJECTED without blocking other commands in the outbox", async () => {
      // Command 1: Invalid duplicate (will return 409)
      outbox.enqueue({
        endpoint: "/api/staff/sessions/sess_11/action",
        actionName: "close_table",
        description: "Close Table with Unpaid Balance",
        payload: {}
      });

      // Command 2: Valid item addition
      outbox.enqueue({
        endpoint: "/api/staff/sessions/sess_11/action",
        actionName: "add_item",
        description: "Add Soda",
        payload: { menuItemId: "drink_soda" }
      });

      const mockSelectiveFetch = (async (url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        if (body.action === "close_table" || body.actionName === "close_table") {
          return {
            ok: false,
            status: 409,
            json: async () => ({ error: "Conflict: Unpaid balance remaining on table." })
          } as unknown as Response;
        }

        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        } as unknown as Response;
      }) as unknown as typeof fetch;

      const result = await outbox.processOutbox(mockSelectiveFetch);
      expect(result.processed).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.succeeded).toBe(1);

      const cmds = outbox.getCommands();
      expect(cmds[0].status).toBe("REJECTED");
      expect(cmds[0].error).toContain("Unpaid balance");
      expect(cmds[1].status).toBe("SYNCED");
    });
  });

  describe("5. End-to-End Walk-in Cooler / Dead-Zone Shift Scenario", () => {
    it("buffers multiple staff mutations offline and flushes all sequentially upon reconnection", async () => {
      // 1. Staff is offline in basement walk-in cooler
      outbox.enqueue({
        endpoint: "/api/staff/sessions/sess_walkin/action",
        actionName: "add_item",
        description: "Order 1: Extra Mozzarella Sticks",
        payload: { menuItemId: "item_mozz", priceCents: 1000 }
      });
      outbox.enqueue({
        endpoint: "/api/staff/sessions/sess_walkin/action",
        actionName: "add_item",
        description: "Order 2: Caesar Salad",
        payload: { menuItemId: "item_caesar", priceCents: 1200 }
      });
      outbox.enqueue({
        endpoint: "/api/staff/sessions/sess_walkin/action",
        actionName: "fire_course",
        description: "Fire Starters",
        payload: { course: "starters" }
      });

      expect(outbox.getPendingCount()).toBe(3);

      // 2. Staff walks back into dining room Wi-Fi coverage -> trigger flush
      const flushedKeys: string[] = [];
      const mockOnlineFetch = (async (url: string, init?: RequestInit) => {
        const body = JSON.parse(init?.body as string);
        flushedKeys.push(body.idempotencyKey);
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true, processedKey: body.idempotencyKey })
        } as unknown as Response;
      }) as unknown as typeof fetch;


      const flushResult = await outbox.processOutbox(mockOnlineFetch);
      expect(flushResult.processed).toBe(3);
      expect(flushResult.succeeded).toBe(3);
      expect(flushedKeys.length).toBe(3);
      expect(new Set(flushedKeys).size).toBe(3); // All 3 had distinct idempotency keys

      expect(outbox.getPendingCount()).toBe(0);
      outbox.clearSynced();
      expect(outbox.getCommands().length).toBe(0);
    });
  });
});
