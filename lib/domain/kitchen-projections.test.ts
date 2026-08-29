import { describe, it, expect } from "bun:test";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  deriveExpoOrderProjections
} from "@/lib/domain";

describe("Restaurant Operating System: One Order, Multiple Kitchen Projections", () => {
  const repo = new InMemoryTableSessionRepository();
  const service = new TableSessionService(repo);

  it("projects a single multi-station order into dedicated station tickets", async () => {
    const { session } = await service.openTableSession({
      restaurantId: "rest_1",
      locationId: "loc_1",
      tableId: "tbl_12",
      tableLabel: "Table 12",
      diningAreaId: "main",
      openedByEmployeeId: "emp_server",
      assignedServerId: "emp_server"
    });

    const { diner: d1 } = await service.addDiner(session.id, "Brandon", 1);
    const { diner: d2 } = await service.addDiner(session.id, "Kylie", 2);

    // 1. Add Pizza (Pizza Oven station)
    await service.addItem(session.id, {
      menuItemId: "pizza_margherita",
      name: "Margherita Pizza",
      course: "mains",
      stationId: "pizza",
      basePriceCents: 1900,
      selectedModifiers: [
        {
          modifierOptionId: "mod_basil",
          name: "Fresh Basil",
          level: "EXTRA",
          placement: "WHOLE",
          priceCents: 150
        }
      ],
      splitMode: "whole_table",
      assignedDinerIds: [d1.id, d2.id]
    });

    // 2. Add Caesar Salad with Dairy/Cheese (Salad station)
    await service.addItem(session.id, {
      menuItemId: "starter_salad",
      name: "Caesar Salad with Shaved Parm Cheese",
      course: "starters",
      stationId: "salad",
      basePriceCents: 1100,
      selectedModifiers: [],
      splitMode: "single",
      assignedDinerIds: [d1.id],
      dinerId: d1.id
    });

    // 3. Add Pesto Gnocchi with Pine Nuts (Grill station)
    await service.addItem(session.id, {
      menuItemId: "main_gnocchi",
      name: "Genovese Pesto Gnocchi with Pine Nuts",
      course: "mains",
      stationId: "grill",
      basePriceCents: 1800,
      selectedModifiers: [],
      splitMode: "single",
      assignedDinerIds: [d2.id],
      dinerId: d2.id
    });

    // 4. Add Margaritas (Bar station)
    await service.addItem(session.id, {
      menuItemId: "drink_margarita",
      name: "Classic Margarita",
      course: "drinks",
      stationId: "bar",
      basePriceCents: 1300,
      quantity: 2,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: [d1.id, d2.id]
    });

    // Fire Starters & Drinks
    const fireStarters = await service.fireCourse(session.id, "starters");
    expect(fireStarters.tickets).toHaveLength(1);
    expect(fireStarters.tickets[0].stationId).toBe("salad");
    expect(fireStarters.tickets[0].items[0].name).toBe("Caesar Salad with Shaved Parm Cheese");
    expect(fireStarters.tickets[0].items[0].hasAllergens).toBe(true);
    expect(fireStarters.tickets[0].items[0].allergens).toContain("dairy");

    // Fire Mains (Splits into Pizza and Grill stations!)
    const fireMains = await service.fireCourse(session.id, "mains");
    expect(fireMains.tickets).toHaveLength(2);

    const pizzaTicket = fireMains.tickets.find((t) => t.stationId === "pizza")!;
    const grillTicket = fireMains.tickets.find((t) => t.stationId === "grill")!;

    expect(pizzaTicket).toBeDefined();
    expect(grillTicket).toBeDefined();
    expect(pizzaTicket.items[0].name).toBe("Margherita Pizza");
    expect(pizzaTicket.items[0].modifiers[0]).toBe("EXTRA Fresh Basil");

    expect(grillTicket.items[0].name).toBe("Genovese Pesto Gnocchi with Pine Nuts");
    expect(grillTicket.items[0].hasAllergens).toBe(true);
    expect(grillTicket.items[0].allergens).toContain("tree_nuts");
  });

  it("propagates item status transitions across station tickets and underlying order items", async () => {
    const { session } = await service.openTableSession({
      restaurantId: "rest_1",
      locationId: "loc_1",
      tableId: "tbl_4",
      tableLabel: "Table 4",
      diningAreaId: "main",
      openedByEmployeeId: "emp_1",
      assignedServerId: "emp_1"
    });

    await service.addItem(session.id, {
      menuItemId: "pizza_pep",
      name: "Pepperoni Pizza",
      course: "mains",
      stationId: "pizza",
      basePriceCents: 2000,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: []
    });

    const { tickets } = await service.fireCourse(session.id, "mains");
    const ticket = tickets[0];
    const item = ticket.items[0];

    // Accept ticket
    await service.acceptKitchenTicket(session.id, ticket.id);
    let current = (await repo.findById(session.id))!;
    expect(current.tickets.find((t) => t.id === ticket.id)?.status).toBe("accepted");

    // Start item
    await service.startTicketItem(session.id, ticket.id, item.orderItemId);
    current = (await repo.findById(session.id))!;
    expect(current.tickets.find((t) => t.id === ticket.id)?.status).toBe("in_prep");
    expect(current.items.find((i) => i.id === item.orderItemId)?.status).toBe("preparing");

    // Mark item ready
    await service.markTicketItemReady(session.id, ticket.id, item.orderItemId);
    current = (await repo.findById(session.id))!;
    expect(current.tickets.find((t) => t.id === ticket.id)?.status).toBe("ready");
    expect(current.items.find((i) => i.id === item.orderItemId)?.status).toBe("ready");

    // Deliver item
    await service.deliverTicketItems(session.id, ticket.id, [item.orderItemId]);
    current = (await repo.findById(session.id))!;
    expect(current.tickets.find((t) => t.id === ticket.id)?.status).toBe("delivered");
    expect(current.items.find((i) => i.id === item.orderItemId)?.status).toBe("delivered");
  });

  it("handles the recall workflow from delivered/ready back to line in_prep", async () => {
    const { session } = await service.openTableSession({
      restaurantId: "rest_1",
      locationId: "loc_1",
      tableId: "tbl_9",
      tableLabel: "Table 9",
      diningAreaId: "main",
      openedByEmployeeId: "emp_1",
      assignedServerId: "emp_1"
    });

    await service.addItem(session.id, {
      menuItemId: "pizza_cheese",
      name: "Cheese Pizza",
      course: "mains",
      stationId: "pizza",
      basePriceCents: 1800,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: []
    });

    const { tickets } = await service.fireCourse(session.id, "mains");
    const ticket = tickets[0];
    const item = ticket.items[0];

    // Transition to delivered
    await service.acceptKitchenTicket(session.id, ticket.id);
    await service.startTicketItem(session.id, ticket.id, item.orderItemId);
    await service.markTicketItemReady(session.id, ticket.id, item.orderItemId);
    await service.deliverTicketItems(session.id, ticket.id, [item.orderItemId]);

    let current = (await repo.findById(session.id))!;
    expect(current.tickets.find((t) => t.id === ticket.id)?.status).toBe("delivered");

    // Recall ticket back to line
    await service.recallKitchenTicket(session.id, ticket.id, "Customer requested extra crispy crust");
    current = (await repo.findById(session.id))!;

    const recalledTicket = current.tickets.find((t) => t.id === ticket.id)!;
    expect(recalledTicket.status).toBe("in_prep");
    expect(recalledTicket.recallReason).toBe("Customer requested extra crispy crust");
    expect(recalledTicket.recalledAt).toBeDefined();
    expect(recalledTicket.items[0].status).toBe("preparing");

    // Underlying order item is also in preparing state
    expect(current.items.find((i) => i.id === item.orderItemId)?.status).toBe("preparing");

    // Verify domain event emitted
    const recallEvent = current.events.find((e) => e.type === "TICKET_RECALLED");
    expect(recallEvent).toBeDefined();
    expect(recallEvent?.payload.reason).toBe("Customer requested extra crispy crust");
  });

  it("consolidates multi-station readiness at the Expo station and delivers full course", async () => {
    const { session } = await service.openTableSession({
      restaurantId: "rest_1",
      locationId: "loc_1",
      tableId: "tbl_15",
      tableLabel: "Table 15",
      diningAreaId: "main",
      openedByEmployeeId: "emp_1",
      assignedServerId: "emp_1"
    });

    // 2 items on different stations for course mains
    await service.addItem(session.id, {
      menuItemId: "pizza_1",
      name: "Sicilian Pizza",
      course: "mains",
      stationId: "pizza",
      basePriceCents: 2200,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: []
    });

    await service.addItem(session.id, {
      menuItemId: "burger_1",
      name: "Smash Burger",
      course: "mains",
      stationId: "grill",
      basePriceCents: 1600,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: []
    });

    await service.fireCourse(session.id, "mains");
    let current = (await repo.findById(session.id))!;

    // Derive Expo projection
    let expoList = deriveExpoOrderProjections(current.tickets);
    expect(expoList).toHaveLength(1);
    expect(expoList[0].tableLabel).toBe("Table 15");
    expect(expoList[0].stationTickets).toHaveLength(2);
    expect(expoList[0].isAllStationsReady).toBe(false);

    // Pizza station finishes
    const pizzaTicket = current.tickets.find((t) => t.stationId === "pizza")!;
    await service.acceptKitchenTicket(session.id, pizzaTicket.id);
    await service.startTicketItem(session.id, pizzaTicket.id, pizzaTicket.items[0].orderItemId);
    await service.markTicketItemReady(session.id, pizzaTicket.id, pizzaTicket.items[0].orderItemId);

    current = (await repo.findById(session.id))!;
    expoList = deriveExpoOrderProjections(current.tickets);
    expect(expoList[0].readyItemsCount).toBe(1);
    expect(expoList[0].isAllStationsReady).toBe(false);

    // Grill station finishes
    const grillTicket = current.tickets.find((t) => t.stationId === "grill")!;
    await service.acceptKitchenTicket(session.id, grillTicket.id);
    await service.startTicketItem(session.id, grillTicket.id, grillTicket.items[0].orderItemId);
    await service.markTicketItemReady(session.id, grillTicket.id, grillTicket.items[0].orderItemId);

    current = (await repo.findById(session.id))!;
    expoList = deriveExpoOrderProjections(current.tickets);
    expect(expoList[0].readyItemsCount).toBe(2);
    expect(expoList[0].isAllStationsReady).toBe(true);

    // Expo delivers whole course to floor
    await service.deliverExpoCourse(session.id, "mains");
    current = (await repo.findById(session.id))!;
    expect(current.tickets.every((t) => t.status === "delivered")).toBe(true);
    expect(current.items.every((i) => i.status === "delivered")).toBe(true);
  });
});
