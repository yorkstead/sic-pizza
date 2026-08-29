import { describe, it, expect, beforeEach } from "bun:test";
import {
  allocateIntegerCents,
  allocateItemToDiners,
  deriveTableBillSummary,
  TableSessionService,
  InMemoryTableSessionRepository,
  type TableSession
} from "@/lib/domain";

describe("Restaurant Operating System: Pre-Split Checks & Diner Item Ownership", () => {
  describe("Deterministic Integer-Cent Remainder Allocation", () => {
    it("divides $10.00 (1000 cents) among 3 diners with zero penny loss", () => {
      const participants = [
        { id: "brandon", weight: 1 },
        { id: "kylie", weight: 1 },
        { id: "mike", weight: 1 }
      ];

      const allocations = allocateIntegerCents(1000, participants);

      expect(allocations).toHaveLength(3);
      // 1000 / 3 = 333.333... -> 334, 333, 333
      expect(allocations[0].cents).toBe(334);
      expect(allocations[1].cents).toBe(333);
      expect(allocations[2].cents).toBe(333);

      const sum = allocations.reduce((acc, a) => acc + a.cents, 0);
      expect(sum).toBe(1000);
    });

    it("handles uneven proportional splits (e.g. 50%, 30%, 20%)", () => {
      const participants = [
        { id: "p1", weight: 50 },
        { id: "p2", weight: 30 },
        { id: "p3", weight: 20 }
      ];

      const allocations = allocateIntegerCents(2575, participants); // $25.75
      // 2575 * 0.5 = 1287.5 -> 1288
      // 2575 * 0.3 = 772.5 -> 772 or 773
      // 2575 * 0.2 = 515.0 -> 515
      const sum = allocations.reduce((acc, a) => acc + a.cents, 0);
      expect(sum).toBe(2575);
      expect(allocations[0].cents).toBe(1288);
      expect(allocations[1].cents).toBe(772);
      expect(allocations[2].cents).toBe(515);
    });

    it("handles edge cases: zero cents, 1 cent across 3 diners, 0 participants", () => {
      expect(allocateIntegerCents(0, [{ id: "a", weight: 1 }])).toEqual([
        { id: "a", cents: 0, shareRatio: 1 }
      ]);
      expect(allocateIntegerCents(1000, [])).toEqual([]);

      const oneCent = allocateIntegerCents(1, [
        { id: "a", weight: 1 },
        { id: "b", weight: 1 },
        { id: "c", weight: 1 }
      ]);
      expect(oneCent.reduce((acc, a) => acc + a.cents, 0)).toBe(1);
      expect(oneCent[0].cents).toBe(1);
      expect(oneCent[1].cents).toBe(0);
      expect(oneCent[2].cents).toBe(0);
    });
  });

  describe("Item-Level Allocation Across Split Modes", () => {
    const diners = [
      { id: "d1", sessionId: "s1", displayName: "Brandon", seatNumber: 1, isGuestUser: true, joinedAt: "2026-08-29T12:00:00Z" },
      { id: "d2", sessionId: "s1", displayName: "Kylie", seatNumber: 2, isGuestUser: true, joinedAt: "2026-08-29T12:00:00Z" },
      { id: "d3", sessionId: "s1", displayName: "Mike", seatNumber: 3, isGuestUser: true, joinedAt: "2026-08-29T12:00:00Z" }
    ];

    it("allocates a single diner item 100% to that diner", () => {
      const item = {
        id: "item_1",
        orderId: "ord_1",
        sessionId: "s1",
        menuItemId: "pizza_pep",
        name: "Large Pepperoni",
        course: "mains" as const,
        stationId: "pizza-oven",
        status: "confirmed" as const,
        quantity: 1,
        basePriceCents: 1900,
        selectedModifiers: [{ modifierOptionId: "opt_pep", name: "Pepperoni", priceCents: 175 }],
        dinerId: "d1",
        splitMode: "single" as const,
        assignedDinerIds: ["d1"],
        createdAt: "2026-08-29T12:00:00Z"
      };

      const allocations = allocateItemToDiners(item, diners);
      expect(allocations).toHaveLength(1);
      expect(allocations[0].dinerId).toBe("d1");
      expect(allocations[0].cents).toBe(2075); // $19.00 + $1.75
      expect(allocations[0].shareRatio).toBe(1);
    });

    it("allocates a shared pizza 50/50 between Brandon and Kylie", () => {
      const item = {
        id: "item_2",
        orderId: "ord_1",
        sessionId: "s1",
        menuItemId: "pizza_mush",
        name: "Mushroom Pizza",
        course: "mains" as const,
        stationId: "pizza-oven",
        status: "confirmed" as const,
        quantity: 1,
        basePriceCents: 1900,
        selectedModifiers: [],
        splitMode: "shared_diners" as const,
        assignedDinerIds: ["d1", "d2"],
        createdAt: "2026-08-29T12:00:00Z"
      };

      const allocations = allocateItemToDiners(item, diners);
      expect(allocations).toHaveLength(2);
      expect(allocations[0].dinerId).toBe("d1");
      expect(allocations[0].cents).toBe(950);
      expect(allocations[1].dinerId).toBe("d2");
      expect(allocations[1].cents).toBe(950);
      expect(allocations.reduce((sum, a) => sum + a.cents, 0)).toBe(1900);
    });

    it("allocates a whole-table appetizer equally across 3 diners with deterministic remainder", () => {
      const item = {
        id: "item_3",
        orderId: "ord_1",
        sessionId: "s1",
        menuItemId: "app_arancini",
        name: "Truffle Arancini",
        course: "starters" as const,
        stationId: "cold-prep",
        status: "confirmed" as const,
        quantity: 1,
        basePriceCents: 1250, // $12.50 / 3 = 416.666... -> 417, 417, 416
        selectedModifiers: [],
        splitMode: "whole_table" as const,
        assignedDinerIds: [],
        createdAt: "2026-08-29T12:00:00Z"
      };

      const allocations = allocateItemToDiners(item, diners);
      expect(allocations).toHaveLength(3);
      expect(allocations[0].cents).toBe(417);
      expect(allocations[1].cents).toBe(417);
      expect(allocations[2].cents).toBe(416);
      expect(allocations.reduce((sum, a) => sum + a.cents, 0)).toBe(1250);
    });
  });

  describe("Continuous Multi-Diner Table Bill Derivation & Payments", () => {
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
          tableId: "tbl_42",
          tableLabel: "Table 42",
          diningAreaId: "main_dining",
          openedByEmployeeId: "emp_server",
          initialDiners: ["Brandon", "Kylie", "Mike"]
        },
        { actorType: "employee", actorId: "emp_server" }
      );
      session = res.session;
    });

    it("continuously derives individual and shared subtotals, tax, and remaining balances", async () => {
      const brandonId = session.diners[0].id;
      const kylieId = session.diners[1].id;
      const mikeId = session.diners[2].id;

      // 1. Brandon orders an individual cocktail ($14.00)
      await service.addItem(
        session.id,
        {
          menuItemId: "drink_negroni",
          name: "Negroni",
          course: "drinks",
          stationId: "bar",
          basePriceCents: 1400,
          splitMode: "single",
          dinerId: brandonId
        },
        { actorType: "employee", actorId: "emp_server" }
      );

      // 2. Kylie and Mike share a starter ($12.00 -> $6.00 each)
      await service.addItem(
        session.id,
        {
          menuItemId: "app_knots",
          name: "Garlic Knots",
          course: "starters",
          stationId: "cold-prep",
          basePriceCents: 1200,
          splitMode: "shared_diners",
          assignedDinerIds: [kylieId, mikeId]
        },
        { actorType: "employee", actorId: "emp_server" }
      );

      // 3. Whole table shares a large pizza ($21.00 -> $7.00 each)
      await service.addItem(
        session.id,
        {
          menuItemId: "pizza_large",
          name: "Large Custom Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 2100,
          splitMode: "whole_table"
        },
        { actorType: "employee", actorId: "emp_server" }
      );

      // Total subtotal: $14.00 + $12.00 + $21.00 = $47.00 (4700 cents)
      // Brandon subtotal: $14.00 (ind) + $7.00 (pizza) = $21.00 (2100 cents)
      // Kylie subtotal: $6.00 (knots) + $7.00 (pizza) = $13.00 (1300 cents)
      // Mike subtotal: $6.00 (knots) + $7.00 (pizza) = $13.00 (1300 cents)
      // Tax: 8.25% of 4700 = 388 cents ($3.88)
      // Brandon tax: round(388 * 2100 / 4700) = 173 cents
      // Kylie tax: round(388 * 1300 / 4700) = 107 cents or 108
      // Mike tax: round(388 * 1300 / 4700) = 107 cents or 108

      const curSession = (await repo.findById(session.id))!;
      const bill = deriveTableBillSummary(curSession, 8.25);

      expect(bill.subtotalCents).toBe(4700);
      expect(bill.individualSubtotalCents).toBe(1400);
      expect(bill.sharedSubtotalCents).toBe(3300);
      expect(bill.taxCents).toBe(388);
      expect(bill.totalCents).toBe(5088);
      expect(bill.unpaidBalanceCents).toBe(5088);

      // Verify each diner's subtotal
      const brandonBill = bill.dinerBills.find((d) => d.dinerId === brandonId)!;
      const kylieBill = bill.dinerBills.find((d) => d.dinerId === kylieId)!;
      const mikeBill = bill.dinerBills.find((d) => d.dinerId === mikeId)!;

      expect(brandonBill.subtotalCents).toBe(2100);
      expect(brandonBill.individualSubtotalCents).toBe(1400);
      expect(brandonBill.sharedSubtotalCents).toBe(700);

      expect(kylieBill.subtotalCents).toBe(1300);
      expect(kylieBill.individualSubtotalCents).toBe(0);
      expect(kylieBill.sharedSubtotalCents).toBe(1300);

      expect(mikeBill.subtotalCents).toBe(1300);
      expect(mikeBill.individualSubtotalCents).toBe(0);
      expect(mikeBill.sharedSubtotalCents).toBe(1300);

      // Exact tax sum verification
      const taxSum = brandonBill.taxCents + kylieBill.taxCents + mikeBill.taxCents;
      expect(taxSum).toBe(bill.taxCents);

      // Exact total sum verification
      const totalSum = brandonBill.totalCents + kylieBill.totalCents + mikeBill.totalCents;
      expect(totalSum).toBe(bill.totalCents);
    });

    it("supports partial payments per diner and reflects exact remaining balances", async () => {
      const brandonId = session.diners[0].id;
      const kylieId = session.diners[1].id;

      // Brandon orders $20 item
      await service.addItem(
        session.id,
        {
          menuItemId: "item_steak",
          name: "Steak",
          basePriceCents: 2000,
          splitMode: "single",
          dinerId: brandonId
        },
        { actorType: "employee", actorId: "emp_server" }
      );

      // Kylie orders $10 item
      await service.addItem(
        session.id,
        {
          menuItemId: "item_salad",
          name: "Caesar Salad",
          basePriceCents: 1000,
          splitMode: "single",
          dinerId: kylieId
        },
        { actorType: "employee", actorId: "emp_server" }
      );

      let cur = (await repo.findById(session.id))!;
      let bill = deriveTableBillSummary(cur, 8.25);
      const brandonTotal = bill.dinerBills.find((d) => d.dinerId === brandonId)!.totalCents;

      // Brandon pays their balance in full
      await service.processDinerPayment(
        session.id,
        brandonId,
        brandonTotal,
        400, // $4.00 tip
        undefined,
        { actorType: "guest", actorId: brandonId }
      );

      cur = (await repo.findById(session.id))!;
      bill = deriveTableBillSummary(cur, 8.25);

      const brandonAfter = bill.dinerBills.find((d) => d.dinerId === brandonId)!;
      const kylieAfter = bill.dinerBills.find((d) => d.dinerId === kylieId)!;

      expect(brandonAfter.paidCents).toBe(brandonTotal);
      expect(brandonAfter.unpaidBalanceCents).toBe(0);
      expect(brandonAfter.isFullyPaid).toBe(true);

      expect(kylieAfter.paidCents).toBe(0);
      expect(kylieAfter.unpaidBalanceCents).toBe(kylieAfter.totalCents);
      expect(kylieAfter.isFullyPaid).toBe(false);

      expect(bill.unpaidBalanceCents).toBe(kylieAfter.totalCents);
    });

    it("allows dynamically updating item ownership and claiming/unclaiming items", async () => {
      const brandonId = session.diners[0].id;
      const kylieId = session.diners[1].id;

      // Add item initially assigned only to Brandon
      const { item } = await service.addItem(
        session.id,
        {
          menuItemId: "pizza_special",
          name: "Special Pizza",
          basePriceCents: 2000,
          splitMode: "single",
          dinerId: brandonId
        },
        { actorType: "employee", actorId: "emp_server" }
      );

      // Kylie claims part of the pizza (converts to shared)
      await service.claimItem(session.id, item.id, kylieId, {
        actorType: "guest",
        actorId: kylieId
      });

      let cur = (await repo.findById(session.id))!;
      let updatedItem = cur.items.find((i) => i.id === item.id)!;
      expect(updatedItem.splitMode).toBe("shared_diners");
      expect(updatedItem.assignedDinerIds).toContain(brandonId);
      expect(updatedItem.assignedDinerIds).toContain(kylieId);

      let bill = deriveTableBillSummary(cur, 8.25);
      expect(bill.dinerBills.find((d) => d.dinerId === brandonId)!.subtotalCents).toBe(1000);
      expect(bill.dinerBills.find((d) => d.dinerId === kylieId)!.subtotalCents).toBe(1000);

      // Kylie unclaims the pizza
      await service.unclaimItem(session.id, item.id, kylieId, {
        actorType: "guest",
        actorId: kylieId
      });

      cur = (await repo.findById(session.id))!;
      updatedItem = cur.items.find((i) => i.id === item.id)!;
      expect(updatedItem.splitMode).toBe("single");
      expect(updatedItem.assignedDinerIds).toEqual([brandonId]);

      bill = deriveTableBillSummary(cur, 8.25);
      expect(bill.dinerBills.find((d) => d.dinerId === brandonId)!.subtotalCents).toBe(2000);
      expect(bill.dinerBills.find((d) => d.dinerId === kylieId)!.subtotalCents).toBe(0);
    });
  });
});
