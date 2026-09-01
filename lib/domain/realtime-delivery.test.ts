import { describe, it, expect, beforeEach } from "bun:test";
import { RealtimeEventBus, type RealtimeEnvelope } from "../server/realtime/event-bus";
import {
  TableSessionService,
  InMemoryTableSessionRepository
} from "./index";

describe("Restaurant Operating System: Realtime Delivery with Recovery", () => {
  let eventBus: RealtimeEventBus;
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    eventBus = new RealtimeEventBus();
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo, (event, session) => {
      eventBus.publish(session.id, event, session.version || 1);
    });
  });

  describe("1. Realtime Event Publishing & Monotonic Sequence Numbering", () => {
    it("publishes events with sequential sequence numbers and session versions", async () => {
      const receivedEnvelopes: RealtimeEnvelope[] = [];
      const unsubscribe = eventBus.subscribeSession("sess_rt_01", (env) => {
        receivedEnvelopes.push(env);
      });

      // Open Table
      const { session } = await service.openTableSession({
        id: "sess_rt_01",
        restaurantId: "sic_pizza_org",
        locationId: "loc_downtown",
        tableId: "tbl_01",
        tableLabel: "Table 01",
        diningAreaId: "area_main",
        openedByEmployeeId: "emp_jordan"
      });

      // Add Diner
      await service.addDiner(session.id, "Alice", 1, { actorType: "employee", actorId: "emp_jordan" });

      // Propose Item
      await service.proposeItem(
        session.id,
        {
          menuItemId: "pizza_cheese",
          name: "Cheese Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1600,
          dinerId: "diner_alice"
        },
        { actorType: "guest", actorId: "diner_alice" }
      );

      unsubscribe();

      expect(receivedEnvelopes.length).toBe(3); // TABLE_OPENED, DINER_ADDED, ITEM_PROPOSED
      expect(receivedEnvelopes[0].seq).toBe(1);
      expect(receivedEnvelopes[1].seq).toBe(2);
      expect(receivedEnvelopes[2].seq).toBe(3);
      expect(receivedEnvelopes[0].event.type).toBe("TABLE_OPENED");
      expect(receivedEnvelopes[1].event.type).toBe("DINER_ADDED");
      expect(receivedEnvelopes[2].event.type).toBe("ITEM_PROPOSED");
    });

    it("delivers events simultaneously to floor subscribers and session subscribers", async () => {
      const sessionEvents: RealtimeEnvelope[] = [];
      const floorEvents: RealtimeEnvelope[] = [];

      eventBus.subscribeSession("sess_rt_02", (env) => sessionEvents.push(env));
      eventBus.subscribeFloor("loc_downtown", (env) => floorEvents.push(env));

      const { session } = await service.openTableSession({
        id: "sess_rt_02",
        restaurantId: "sic_pizza_org",
        locationId: "loc_downtown",
        tableId: "tbl_02",
        tableLabel: "Table 02",
        diningAreaId: "area_main",
        openedByEmployeeId: "emp_jordan"
      });

      await service.createGuestRequest(session.id, "WATER", "Extra ice please", undefined, {
        actorType: "guest"
      });

      expect(sessionEvents.length).toBe(2);
      expect(floorEvents.length).toBe(2);
      expect(sessionEvents[1].event.type).toBe("REQUEST_CREATED");
      expect(floorEvents[1].event.type).toBe("REQUEST_CREATED");
    });
  });

  describe("2. Reconnection Recovery & Replay Buffer", () => {
    it("replays missed events when client reconnects with sinceSeq", async () => {
      const { session } = await service.openTableSession({
        id: "sess_rt_03",
        restaurantId: "sic_pizza_org",
        locationId: "loc_downtown",
        tableId: "tbl_03",
        tableLabel: "Table 03",
        diningAreaId: "area_main",
        openedByEmployeeId: "emp_jordan"
      });

      // Events 2, 3, 4 occur while client was disconnected
      await service.addDiner(session.id, "Bob", 1, { actorType: "employee" });
      await service.addItem(

        session.id,
        {
          menuItemId: "pizza_pep",
          name: "Pepperoni Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 2000
        },
        { actorType: "employee", actorId: "emp_jordan" }
      );
      await service.fireCourse(session.id, "mains", { actorType: "employee", actorId: "emp_jordan" });

      // Client reconnects having only seen seq 1 (TABLE_OPENED)
      const recovery = eventBus.getMissedEvents(session.id, 1);
      expect(recovery.reconciled).toBe(true);
      expect(recovery.requiresFullSync).toBe(false);
      expect(recovery.events.length).toBe(4);
      expect(recovery.events[0].seq).toBe(2);
      expect(recovery.events[0].event.type).toBe("DINER_ADDED");
      expect(recovery.events[1].seq).toBe(3);
      expect(recovery.events[1].event.type).toBe("ITEM_ADDED");
      expect(recovery.events[2].seq).toBe(4);
      expect(recovery.events[2].event.type).toBe("TICKET_CREATED");
      expect(recovery.events[3].seq).toBe(5);
      expect(recovery.events[3].event.type).toBe("COURSE_FIRED");
    });

    it("returns empty missed list when client is already at current sequence", async () => {
      const { session } = await service.openTableSession({
        id: "sess_rt_04",
        restaurantId: "sic_pizza_org",
        locationId: "loc_downtown",
        tableId: "tbl_04",
        tableLabel: "Table 04",
        diningAreaId: "area_main",
        openedByEmployeeId: "emp_jordan"
      });

      const recovery = eventBus.getMissedEvents(session.id, 1);
      expect(recovery.reconciled).toBe(true);
      expect(recovery.events.length).toBe(0);
      expect(recovery.requiresFullSync).toBe(false);
    });
  });

  describe("3. End-to-End Multi-Device Realtime Lifecycle with Recovery", () => {
    it("synchronizes actions across staff POS, guest mobile, and KDS with simulated network drop", async () => {
      // 1. Staff opens table session
      const { session } = await service.openTableSession({
        id: "sess_e2e_rt",
        restaurantId: "sic_pizza_org",
        locationId: "loc_downtown",
        tableId: "tbl_15",
        tableLabel: "Table 15",
        diningAreaId: "area_main",
        openedByEmployeeId: "emp_jordan"
      });

      const staffEvents: RealtimeEnvelope[] = [];
      const guestEvents: RealtimeEnvelope[] = [];

      // Staff listens to floor events
      const unsubsStaff = eventBus.subscribeFloor("loc_downtown", (env) => staffEvents.push(env));

      // Guest scans QR and listens to session events
      let unsubsGuest = eventBus.subscribeSession(session.id, (env) => guestEvents.push(env));

      // 2. Guest proposes an item -> arrives live in staff POS
      const propRes = await service.proposeItem(
        session.id,
        {
          menuItemId: "pizza_special",
          name: "Truffle Mushroom Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 2200,
          dinerId: "diner_dana"
        },
        { actorType: "guest", actorId: "diner_dana" }
      );

      expect(staffEvents.length).toBe(1);
      expect(staffEvents[0].event.type).toBe("ITEM_PROPOSED");
      expect(guestEvents.length).toBe(1);

      // 3. Simulated Network Drop: Guest disconnects (e.g. phone screen locks)
      unsubsGuest();
      const guestLastSeq = guestEvents[guestEvents.length - 1].seq; // seq 1

      // 4. Staff approves proposal & fires course while guest is offline
      await service.approveItem(session.id, propRes.item.id, {
        actorType: "employee",
        actorId: "emp_jordan"
      });
      await service.fireCourse(session.id, "mains", {
        actorType: "employee",
        actorId: "emp_jordan"
      });

      // Staff received all live (ITEM_PROPOSED, ITEM_APPROVED, TICKET_CREATED, COURSE_FIRED)
      expect(staffEvents.length).toBe(4);

      // 5. Guest unlocks phone: reconnects with guestLastSeq (1)
      const missed = eventBus.getMissedEvents(session.id, guestLastSeq);
      expect(missed.reconciled).toBe(true);
      expect(missed.events.length).toBe(3);
      expect(missed.events[0].event.type).toBe("ITEM_APPROVED");
      expect(missed.events[1].event.type).toBe("TICKET_CREATED");
      expect(missed.events[2].event.type).toBe("COURSE_FIRED");

      // Apply missed events to guest state
      for (const env of missed.events) {
        guestEvents.push(env);
      }



      // Re-subscribe live
      unsubsGuest = eventBus.subscribeSession(session.id, (env) => guestEvents.push(env));

      // 6. Kitchen finishes pizza -> accepted -> ready -> delivered
      const currentSession = (await repo.findById(session.id))!;
      const ticket = currentSession.tickets[0];
      const itemId = ticket.items[0].orderItemId;
      await service.acceptKitchenTicket(session.id, ticket.id, { actorType: "employee" });
      await service.markTicketItemReady(session.id, ticket.id, itemId, { actorType: "employee" });
      await service.deliverTicketItems(session.id, ticket.id, [itemId], { actorType: "employee" });

      expect(guestEvents.length).toBe(7);
      expect(guestEvents[4].event.type).toBe("TICKET_ACCEPTED");
      expect(guestEvents[5].event.type).toBe("ITEM_READY");
      expect(guestEvents[6].event.type).toBe("ITEM_DELIVERED");



      unsubsStaff();
      unsubsGuest();
    });
  });
});
