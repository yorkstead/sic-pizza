import { describe, expect, test, beforeEach } from "bun:test";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  deriveDiningStage,
  deriveOperationalAttention,
  deriveFinancials,
  derivePaymentState
} from "./index";

describe("Restaurant Operating System: Core Domain Lifecycle", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  const RESTAURANT_ID = "rest_001";
  const LOCATION_ID = "loc_001";
  const TABLE_ID = "tbl_11";
  const DINING_AREA_ID = "area_main";
  const SERVER_ID = "emp_jordan";

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  describe("Table Session Opening & Diners", () => {
    test("opens a table session and records TABLE_OPENED and DINER_ADDED events", async () => {
      const { session, projection } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID,
          assignedServerId: SERVER_ID,
          initialDiners: ["Alex", "Sam"]
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      expect(session.tableLabel).toBe("Table 11");
      expect(session.diners.length).toBe(2);
      expect(projection.stage).toBe("SEATED");
      expect(projection.operationalAttention.urgency).toBe("normal");

      const events = await repo.getEvents(session.id);
      expect(events.map((e) => e.type)).toEqual([
        "TABLE_OPENED",
        "DINER_ADDED",
        "DINER_ADDED"
      ]);
    });

    test("prevents opening multiple concurrent active sessions on the same table", async () => {
      await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      expect(
        service.openTableSession(
          {
            restaurantId: RESTAURANT_ID,
            locationId: LOCATION_ID,
            tableId: TABLE_ID,
            tableLabel: "Table 11",
            diningAreaId: DINING_AREA_ID,
            openedByEmployeeId: SERVER_ID
          },
          { actorType: "employee", actorId: SERVER_ID }
        )
      ).rejects.toThrow("already occupied");
    });

    test("adds and removes diners with event records and invariant checks", async () => {
      const { session } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      const { diner } = await service.addDiner(session.id, "Taylor", 1, {
        actorType: "employee",
        actorId: SERVER_ID
      });
      expect(diner.displayName).toBe("Taylor");

      // Add item for Taylor
      await service.addItem(
        session.id,
        {
          menuItemId: "item_pie",
          name: "Cheese Pizza",
          basePriceCents: 1400,
          dinerId: diner.id
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Cannot remove diner while they have active items
      expect(
        service.removeDiner(session.id, diner.id, {
          actorType: "employee",
          actorId: SERVER_ID
        })
      ).rejects.toThrow("active order items");
    });

    test("transfers table assignment to another server", async () => {
      const { session } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      const { session: updated } = await service.transferTable(
        session.id,
        "emp_morgan",
        "Shift change handoff",
        { actorType: "employee", actorId: SERVER_ID }
      );

      expect(updated.assignedServerId).toBe("emp_morgan");
      const events = await repo.getEvents(session.id);
      expect(events.some((e) => e.type === "TABLE_TRANSFERRED")).toBe(true);
    });
  });

  describe("Ordering, Guest Proposals, Modifiers & Coursing", () => {
    test("handles guest proposal and server approval gate", async () => {
      const { session } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      const { item: proposed } = await service.proposeItem(
        session.id,
        {
          menuItemId: "pizza_special",
          name: "Pineapple Hot Honey Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1900,
          selectedModifiers: [{ modifierOptionId: "opt_cheese", name: "Extra Cheese", priceCents: 225 }]
        },
        { actorType: "guest", actorId: "guest_sam" }
      );

      expect(proposed.status).toBe("proposed");

      // Cannot fire course when items are unconfirmed proposals
      expect(service.fireCourse(session.id, "mains")).rejects.toThrow("No confirmed items");

      // Server approves proposal
      const { item: approved } = await service.approveItem(session.id, proposed.id, {
        actorType: "employee",
        actorId: SERVER_ID
      });
      expect(approved.status).toBe("confirmed");
    });

    test("modifies and voids items with required audit reason", async () => {
      const { session } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      const { item } = await service.addItem(
        session.id,
        {
          menuItemId: "pizza_1",
          name: "Small Pizza",
          basePriceCents: 1400,
          selectedModifiers: []
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      await service.modifyItem(
        session.id,
        item.id,
        {
          selectedModifiers: [{ modifierOptionId: "opt_pep", name: "Pepperoni", priceCents: 175 }],
          specialInstructions: "Well done crust"
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Void requires non-empty reason
      expect(service.voidItem(session.id, item.id, "")).rejects.toThrow("Void reason is required");

      const { projection } = await service.voidItem(session.id, item.id, "Guest changed mind", {
        actorType: "employee",
        actorId: SERVER_ID
      });
      expect(projection.activeItems.length).toBe(0);
      expect(projection.totalCents).toBe(0);
    });

    test("fires course and creates station-routed kitchen tickets", async () => {
      const { session } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Add drink item (Bar station)
      await service.addItem(
        session.id,
        {
          menuItemId: "drink_beer",
          name: "IPA Draft",
          course: "drinks",
          stationId: "bar",
          basePriceCents: 800
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Add pizza item (Pizza Oven station)
      await service.addItem(
        session.id,
        {
          menuItemId: "pizza_margherita",
          name: "Margherita Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1800
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Fire drinks course
      const { tickets: drinkTickets, projection: proj1 } = await service.fireCourse(
        session.id,
        "drinks",
        { actorType: "employee", actorId: SERVER_ID }
      );

      expect(drinkTickets.length).toBe(1);
      expect(drinkTickets[0].stationId).toBe("bar");
      expect(drinkTickets[0].status).toBe("queued");
      expect(proj1.stage).toBe("DRINKS");
    });
  });

  describe("Kitchen Display Lifecycle (KDS)", () => {
    test("advances kitchen ticket from queued -> accepted -> in_prep -> ready -> delivered", async () => {
      const { session } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      const { item } = await service.addItem(
        session.id,
        {
          menuItemId: "pizza_pepperoni",
          name: "Pepperoni Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1900
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      const { tickets } = await service.fireCourse(session.id, "mains");
      const ticket = tickets[0];

      // 1. Kitchen accepts ticket
      await service.acceptKitchenTicket(session.id, ticket.id, {
        actorType: "employee",
        actorId: "emp_cook_luigi"
      });

      // 2. Line cook starts item
      await service.startTicketItem(session.id, ticket.id, item.id, {
        actorType: "employee",
        actorId: "emp_cook_luigi"
      });
      const currentSession = (await repo.findById(session.id))!;
      expect(currentSession.items[0].status).toBe("preparing");

      // 3. Mark ready for expo/runner
      const { projection: readyProj } = await service.markTicketItemReady(session.id, ticket.id, item.id, {
        actorType: "employee",
        actorId: "emp_cook_luigi"
      });
      expect(readyProj.kitchenProgress).toBe("ready_for_runner");

      // 4. Food runner delivers item to table
      const { projection: deliveredProj } = await service.deliverTicketItems(
        session.id,
        ticket.id,
        [item.id],
        { actorType: "employee", actorId: "emp_runner_dave" }
      );
      expect(deliveredProj.kitchenProgress).toBe("all_delivered");
      expect(deliveredProj.stage).toBe("ENTREES");
    });
  });

  describe("Guest Requests & Operational Task Queue", () => {
    test("tracks request lifecycle: requested -> acknowledged -> completed", async () => {
      const { session } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      const { request, projection: p1 } = await service.createGuestRequest(
        session.id,
        "water_refill",
        "Sparkling water please",
        undefined,
        { actorType: "guest" }
      );
      expect(request.status).toBe("OPEN");
      expect(p1.operationalAttention.urgency).toBe("urgent_guest_request");

      // Server acknowledges
      const { request: acked, projection: p2 } = await service.acknowledgeGuestRequest(
        session.id,
        request.id,
        { actorType: "employee", actorId: SERVER_ID }
      );
      expect(acked.status).toBe("ACKNOWLEDGED");
      expect(p2.operationalAttention.urgency).toBe("normal");

      // Complete request
      const { request: done, projection: p3 } = await service.completeGuestRequest(
        session.id,
        request.id,
        { actorType: "employee", actorId: SERVER_ID }
      );
      expect(done.status).toBe("COMPLETED");
      expect(p3.openRequests.length).toBe(0);
    });
  });

  describe("Check Split, Payment & Settlement", () => {
    test("handles itemized checks, exact integer-cent payments, and closure invariants", async () => {
      const { session } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID,
          initialDiners: ["Alex", "Sam"]
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      const alex = session.diners[0];
      const sam = session.diners[1];

      // Alex order ($19.00)
      await service.addItem(
        session.id,
        {
          menuItemId: "p1",
          name: "Large Pizza",
          basePriceCents: 1900,
          dinerId: alex.id
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Sam order ($10.00)
      await service.addItem(
        session.id,
        {
          menuItemId: "d1",
          name: "Cocktail",
          basePriceCents: 1000,
          dinerId: sam.id
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Subtotal = 2900, tax 8.25% = 239, total = 3139
      const financials = deriveFinancials(
        (await repo.findById(session.id))!.items,
        (await repo.findById(session.id))!.payments
      );
      expect(financials.subtotalCents).toBe(2900);
      expect(financials.taxCents).toBe(239);
      expect(financials.totalCents).toBe(3139);

      // Create Check #1 for Alex
      const { check: alexCheck } = await service.createCheck(
        session.id,
        "Check #1 (Alex)",
        [alex.id],
        8.25
      );
      expect(alexCheck.subtotalCents).toBe(1900);
      expect(alexCheck.totalCents).toBe(2057); // 1900 + 157 tax

      // Create Check #2 for Sam
      const { check: samCheck } = await service.createCheck(
        session.id,
        "Check #2 (Sam)",
        [sam.id],
        8.25
      );
      expect(samCheck.subtotalCents).toBe(1000);
      expect(samCheck.totalCents).toBe(1083); // 1000 + 83 tax

      // Cannot close table with unpaid balance
      expect(service.closeTableSession(session.id)).rejects.toThrow("unpaid balance");

      // Pay Alex Check
      await service.processPayment(
        session.id,
        alexCheck.id,
        alexCheck.totalCents,
        400, // tip
        "auth_alex_card",
        { actorType: "guest", actorId: alex.id }
      );

      // Pay Sam Check
      await service.processPayment(
        session.id,
        samCheck.id,
        samCheck.totalCents,
        250, // tip
        "auth_sam_card",
        { actorType: "guest", actorId: sam.id }
      );

      const afterPayment = (await repo.findById(session.id))!;
      const state = derivePaymentState(3139, 3140, afterPayment.checks);
      expect(state).toBe("fully_paid");

      const attention = deriveOperationalAttention(afterPayment);
      expect(attention.urgency).toBe("ready_to_clear");

      // Successfully close table
      const { session: closedSession, projection: finalProj } = await service.closeTableSession(
        session.id,
        { actorType: "employee", actorId: SERVER_ID }
      );

      expect(closedSession.closedAt).toBeDefined();
      expect(finalProj.stage).toBe("CLOSED");
      expect(finalProj.unpaidBalanceCents).toBe(0);

      const events = await repo.getEvents(session.id);
      expect(events.some((e) => e.type === "TABLE_CLOSED")).toBe(true);
    });
  });

  describe("Explicit Dining Stages & State Transitions", () => {
    test("automatically suggests stages across the full meal lifecycle", async () => {
      const { session } = await service.openTableSession(
        {
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: TABLE_ID,
          tableLabel: "Table 11",
          diningAreaId: DINING_AREA_ID,
          openedByEmployeeId: SERVER_ID
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // 1. Initially SEATED
      const proj = (await service.addDiner(session.id, "Jordan")).projection;
      expect(proj.stage).toBe("SEATED");

      // 2. Draft/proposed item -> ORDERING
      await service.proposeItem(session.id, {
        menuItemId: "item_pizza",
        name: "Pizza",
        basePriceCents: 1800
      });
      const curSession = (await repo.findById(session.id))!;
      expect(deriveDiningStage(curSession)).toBe("ORDERING");

      // 3. Drinks fired -> DRINKS
      await service.addItem(session.id, {
        menuItemId: "bev_1",
        name: "Cocktail",
        course: "drinks",
        stationId: "bar",
        basePriceCents: 1200
      });
      await service.fireCourse(session.id, "drinks");
      expect((await repo.findById(session.id))!.tickets.length).toBe(1);
      expect(deriveDiningStage((await repo.findById(session.id))!)).toBe("DRINKS");

      // 4. Appetizers fired -> APPETIZERS
      await service.addItem(session.id, {
        menuItemId: "app_1",
        name: "Arancini",
        course: "starters",
        stationId: "cold-prep",
        basePriceCents: 900
      });
      await service.fireCourse(session.id, "starters");
      expect(deriveDiningStage((await repo.findById(session.id))!)).toBe("APPETIZERS");

      // 5. Entrees fired -> ENTREES
      await service.addItem(session.id, {
        menuItemId: "main_1",
        name: "Detroit Deep Dish",
        course: "mains",
        stationId: "pizza-oven",
        basePriceCents: 2400
      });
      await service.fireCourse(session.id, "mains");
      expect(deriveDiningStage((await repo.findById(session.id))!)).toBe("ENTREES");

      // 6. Dessert fired -> DESSERT
      await service.addItem(session.id, {
        menuItemId: "des_1",
        name: "Cannoli",
        course: "desserts",
        stationId: "cold-prep",
        basePriceCents: 700
      });
      await service.fireCourse(session.id, "desserts");
      expect(deriveDiningStage((await repo.findById(session.id))!)).toBe("DESSERT");

      // 7. Check requested -> CHECK_REQUESTED
      await service.createGuestRequest(session.id, "drop_check", "Ready for bill");
      expect(deriveDiningStage((await repo.findById(session.id))!)).toBe("CHECK_REQUESTED");

      // 8. Payment in progress -> PAYING
      const { check } = await service.createCheck(session.id, "Full Check");
      await service.processPayment(session.id, check.id, 1000, 200);
      expect(deriveDiningStage((await repo.findById(session.id))!)).toBe("PAYING");

      // 9. Manual stage override capability
      const { projection: overrideProj } = await service.setStage(session.id, "DESSERT");
      expect(overrideProj.stage).toBe("DESSERT");
    });
  });
});
