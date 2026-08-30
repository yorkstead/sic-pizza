import { describe, it, expect } from "bun:test";
import {
  evaluateAttentionRules,
  AttentionService,
  DEFAULT_ATTENTION_CONFIG,
  type TableSession
} from "@/lib/domain";

function createMockSession(overrides: Partial<TableSession> = {}): TableSession {
  return {
    id: "sess_1",
    restaurantId: "rest_1",
    locationId: "loc_1",
    tableId: "tbl_1",
    tableLabel: "Table 1",
    diningAreaId: "main",
    joinTokenHash: "hash_tbl_1",
    openedAt: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10m ago
    openedByEmployeeId: "emp_1",
    assignedServerId: "emp_1",
    assistingEmployeeIds: [],
    diners: [
      {
        id: "d1",
        sessionId: "sess_1",
        displayName: "Alex",
        isGuestUser: false,
        seatNumber: 1,
        joinedAt: new Date().toISOString()
      },
      {
        id: "d2",
        sessionId: "sess_1",
        displayName: "Sam",
        isGuestUser: false,
        seatNumber: 2,
        joinedAt: new Date().toISOString()
      }
    ],
    items: [],
    tickets: [],
    requests: [],
    checks: [],
    payments: [],
    events: [],
    version: 1,
    executedIdempotencyKeys: {},
    ...overrides
  };
}

describe("Restaurant Operating System: Rules-Based Server Attention Engine", () => {
  const now = new Date();

  describe("Rule 1: SEATED_NO_DRINKS", () => {
    it("flags a table seated longer than threshold with no drinks or food items", () => {
      const session = createMockSession({
        openedAt: new Date(now.getTime() - 6 * 60 * 1000).toISOString(), // 6m ago
        items: []
      });

      const items = evaluateAttentionRules([session], { seatedWithoutDrinksMinutes: 4 }, { now });
      const match = items.find((i) => i.ruleKey === "SEATED_NO_DRINKS");

      expect(match).toBeDefined();
      expect(match?.recommendedAction).toBe("Take Drink Order");
      expect(match?.tableLabel).toBe("Table 1");
      expect(match?.severity).toBe("MEDIUM");
    });

    it("does not flag if drinks or items have already been ordered", () => {
      const session = createMockSession({
        openedAt: new Date(now.getTime() - 6 * 60 * 1000).toISOString(),
        items: [
          {
            id: "item_1",
            orderId: "ord_1",
            sessionId: "sess_1",
            menuItemId: "bev_peroni",
            name: "Peroni",
            course: "drinks",
            stationId: "bar",
            status: "confirmed",
            quantity: 1,
            basePriceCents: 700,
            selectedModifiers: [],
            splitMode: "single",
            assignedDinerIds: ["d1"],
            dinerId: "d1",
            createdAt: new Date().toISOString()
          }
        ]
      });

      const items = evaluateAttentionRules([session], { seatedWithoutDrinksMinutes: 4 }, { now });
      expect(items.find((i) => i.ruleKey === "SEATED_NO_DRINKS")).toBeUndefined();
    });
  });

  describe("Rule 2: GUEST_PROPOSAL_PENDING", () => {
    it("flags pending guest proposals for server approval", () => {
      const session = createMockSession({
        items: [
          {
            id: "item_prop",
            orderId: "ord_1",
            sessionId: "sess_1",
            menuItemId: "pizza_pep",
            name: "Pepperoni Pizza",
            course: "mains",
            stationId: "pizza",
            status: "proposed",
            quantity: 1,
            basePriceCents: 2100,
            selectedModifiers: [],
            splitMode: "whole_table",
            assignedDinerIds: ["d1", "d2"],
            createdAt: new Date(now.getTime() - 3 * 60 * 1000).toISOString()
          }
        ]
      });

      const items = evaluateAttentionRules([session], {}, { now });
      const match = items.find((i) => i.ruleKey === "GUEST_PROPOSAL_PENDING");

      expect(match).toBeDefined();
      expect(match?.recommendedAction).toBe("Review Proposals");
      expect(match?.severity).toBe("HIGH");
    });
  });

  describe("Rule 3 & 4: FOOD_ISSUE_ALERT & REQUEST_OVERDUE", () => {
    it("flags FOOD_ISSUE with URGENT severity and immediate table visit recommendation", () => {
      const session = createMockSession({
        requests: [
          {
            id: "req_food",
            sessionId: "sess_1",
            tableId: "tbl_1",
            tableLabel: "Table 1",
            category: "FOOD_ISSUE",
            priority: "URGENT",
            status: "OPEN",
            assignedRole: "manager",
            description: "Pizza crust is burnt",
            escalationState: "NORMAL",
            createdAt: new Date(now.getTime() - 2 * 60 * 1000).toISOString()
          }
        ]
      });

      const items = evaluateAttentionRules([session], {}, { now });
      const match = items.find((i) => i.ruleKey === "FOOD_ISSUE_ALERT");

      expect(match).toBeDefined();
      expect(match?.severity).toBe("URGENT");
      expect(match?.recommendedAction).toBe("Visit Table Immediately");
    });

    it("flags unacknowledged guest requests that exceed wait threshold", () => {
      const session = createMockSession({
        requests: [
          {
            id: "req_refill",
            sessionId: "sess_1",
            tableId: "tbl_1",
            tableLabel: "Table 1",
            category: "REFILL",
            priority: "NORMAL",
            status: "OPEN",
            assignedRole: "runner",
            escalationState: "NORMAL",
            createdAt: new Date(now.getTime() - 4 * 60 * 1000).toISOString() // 4m ago
          }
        ]
      });

      const items = evaluateAttentionRules([session], { unacknowledgedRequestMinutes: 3 }, { now });
      const match = items.find((i) => i.ruleKey === "REQUEST_UNACKNOWLEDGED");

      expect(match).toBeDefined();
      expect(match?.recommendedAction).toBe("Acknowledge Request");
    });
  });

  describe("Rule 5 & 6: KITCHEN_TICKET_LATE & ITEMS_READY_FOR_DELIVERY", () => {
    it("flags kitchen tickets running past late threshold", () => {
      const session = createMockSession({
        tickets: [
          {
            id: "tkt_1",
            sessionId: "sess_1",
            orderId: "ord_1",
            tableLabel: "Table 1",
            stationId: "pizza",
            course: "mains",
            status: "in_prep",
            items: [
              {
                orderItemId: "i1",
                name: "Margherita",
                course: "mains",
                stationId: "pizza",
                quantity: 1,
                modifiers: [],
                allergens: [],
                hasAllergens: false,
                status: "preparing"
              }
            ],
            createdAt: new Date(now.getTime() - 24 * 60 * 1000).toISOString() // 24m in prep (> 18m threshold)
          }
        ]
      });

      const items = evaluateAttentionRules([session], { kitchenTicketLateThresholdMinutes: 18 }, { now });
      const match = items.find((i) => i.ruleKey === "KITCHEN_TICKET_LATE");

      expect(match).toBeDefined();
      expect(match?.recommendedAction).toBe("Check Kitchen Station");
      expect(match?.severity).toBe("HIGH"); // 6m overtime (< 8m)
    });

    it("flags items ready at expo waiting for runner/server delivery", () => {
      const session = createMockSession({
        tickets: [
          {
            id: "tkt_ready",
            sessionId: "sess_1",
            orderId: "ord_1",
            tableLabel: "Table 1",
            stationId: "pizza",
            course: "mains",
            status: "ready",
            items: [
              {
                orderItemId: "i1",
                name: "Margherita",
                course: "mains",
                stationId: "pizza",
                quantity: 1,
                modifiers: [],
                allergens: [],
                hasAllergens: false,
                status: "ready"
              }
            ],
            createdAt: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
            readyAt: new Date(now.getTime() - 4 * 60 * 1000).toISOString() // ready for 4m (> 2m threshold)
          }
        ]
      });

      const items = evaluateAttentionRules([session], { readyItemsWaitingMinutes: 2 }, { now });
      const match = items.find((i) => i.ruleKey === "ITEMS_READY_FOR_DELIVERY");

      expect(match).toBeDefined();
      expect(match?.recommendedAction).toBe("Deliver to Table");
    });
  });

  describe("Rule 7 & 8: CHECK_REQUESTED_UNSETTLED & TABLE_PAID_UNCLEARED", () => {
    it("flags check requested with unpaid balance", () => {
      const session = createMockSession({
        items: [
          {
            id: "i1",
            orderId: "ord_1",
            sessionId: "sess_1",
            menuItemId: "pizza_1",
            name: "Pizza",
            course: "mains",
            stationId: "pizza",
            status: "delivered",
            quantity: 1,
            basePriceCents: 2000,
            selectedModifiers: [],
            splitMode: "whole_table",
            assignedDinerIds: ["d1", "d2"],
            createdAt: new Date().toISOString()
          }
        ],
        requests: [
          {
            id: "req_chk",
            sessionId: "sess_1",
            tableId: "tbl_1",
            tableLabel: "Table 1",
            category: "CHECK",
            priority: "HIGH",
            status: "OPEN",
            assignedRole: "server",
            escalationState: "NORMAL",
            createdAt: new Date(now.getTime() - 4 * 60 * 1000).toISOString() // 4m ago
          }
        ]
      });

      const items = evaluateAttentionRules([session], { checkRequestedWaitMinutes: 3 }, { now });
      const match = items.find((i) => i.ruleKey === "CHECK_REQUESTED_UNSETTLED");

      expect(match).toBeDefined();
      expect(match?.recommendedAction).toBe("Open Check & Settle");
    });

    it("flags table paid in full waiting for table clear/close", () => {
      const session = createMockSession({
        items: [
          {
            id: "i1",
            orderId: "ord_1",
            sessionId: "sess_1",
            menuItemId: "pizza_1",
            name: "Pizza",
            course: "mains",
            stationId: "pizza",
            status: "delivered",
            quantity: 1,
            basePriceCents: 2000,
            selectedModifiers: [],
            splitMode: "whole_table",
            assignedDinerIds: ["d1", "d2"],
            createdAt: new Date().toISOString()
          }
        ],
        payments: [
          {
            id: "pay_1",
            checkId: "chk_1",
            sessionId: "sess_1",
            amountCents: 2165,
            tipCents: 400,
            status: "captured",
            method: "card",
            provider: "manual",
            actorType: "employee",
            createdAt: new Date(now.getTime() - 8 * 60 * 1000).toISOString() // 8m ago
          }
        ]
      });

      const items = evaluateAttentionRules([session], { tablePaidUnclearedMinutes: 5 }, { now });
      const match = items.find((i) => i.ruleKey === "TABLE_PAID_UNCLEARED");

      expect(match).toBeDefined();
      expect(match?.recommendedAction).toBe("Close & Reset Table");
    });
  });

  describe("Rule 9 & 10: COURSE_PACING_GAP & DINER_MISSING_ENTREE", () => {
    it("flags course pacing gap when starters delivered and mains held unfired", () => {
      const session = createMockSession({
        items: [
          {
            id: "item_starter",
            orderId: "ord_1",
            sessionId: "sess_1",
            menuItemId: "starter_1",
            name: "Arancini",
            course: "starters",
            stationId: "appetizer",
            status: "delivered",
            quantity: 1,
            basePriceCents: 1200,
            selectedModifiers: [],
            splitMode: "whole_table",
            assignedDinerIds: ["d1", "d2"],
            createdAt: new Date(now.getTime() - 16 * 60 * 1000).toISOString() // delivered 16m ago (> 12m)
          },
          {
            id: "item_main",
            orderId: "ord_1",
            sessionId: "sess_1",
            menuItemId: "pizza_spicy",
            name: "Spicy Pizza",
            course: "mains",
            stationId: "pizza",
            status: "confirmed",
            quantity: 1,
            basePriceCents: 2200,
            selectedModifiers: [],
            splitMode: "whole_table",
            assignedDinerIds: ["d1", "d2"],
            createdAt: new Date(now.getTime() - 20 * 60 * 1000).toISOString()
          }
        ]
      });

      const items = evaluateAttentionRules([session], { coursePacingGapMinutes: 12 }, { now });
      const match = items.find((i) => i.ruleKey === "COURSE_PACING_GAP");

      expect(match).toBeDefined();
      expect(match?.recommendedAction).toBe("Fire Entrées Course");
    });

    it("flags when a diner has no main ordered while another diner does", () => {
      const session = createMockSession({
        diners: [
          {
            id: "d1",
            sessionId: "sess_1",
            displayName: "Alex",
            isGuestUser: false,
            seatNumber: 1,
            joinedAt: new Date().toISOString()
          },
          {
            id: "d2",
            sessionId: "sess_1",
            displayName: "Sam",
            isGuestUser: false,
            seatNumber: 2,
            joinedAt: new Date().toISOString()
          }
        ],
        items: [
          {
            id: "main_d1",
            orderId: "ord_1",
            sessionId: "sess_1",
            menuItemId: "pizza_margherita",
            name: "Margherita",
            course: "mains",
            stationId: "pizza",
            status: "confirmed",
            quantity: 1,
            basePriceCents: 1800,
            selectedModifiers: [],
            splitMode: "single",
            assignedDinerIds: ["d1"],
            dinerId: "d1",
            createdAt: new Date().toISOString()
          }
        ]
      });

      const items = evaluateAttentionRules([session], {}, { now });
      const match = items.find((i) => i.ruleKey === "DINER_MISSING_ENTREE");

      expect(match).toBeDefined();
      expect(match?.reason).toContain("Sam has no entrée ordered");
    });
  });

  describe("AttentionService & Dismissals", () => {
    it("handles dismissals and per-location config overrides", () => {
      const service = new AttentionService();
      service.setLocationConfig("loc_downtown", {
        seatedWithoutDrinksMinutes: 2
      });

      const config = service.getLocationConfig("loc_downtown");
      expect(config.seatedWithoutDrinksMinutes).toBe(2);
      expect(config.kitchenTicketLateThresholdMinutes).toBe(DEFAULT_ATTENTION_CONFIG.kitchenTicketLateThresholdMinutes);

      service.dismissItem("item_123");
      expect(service.getDismissedIds().has("item_123")).toBe(true);

      service.clearDismissals();
      expect(service.getDismissedIds().size).toBe(0);
    });
  });
});
