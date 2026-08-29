import { describe, it, expect, beforeEach } from "bun:test";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  deriveTableCoursePacing,
  evaluateAttentionRules,
  normalizeCourse
} from "@/lib/domain";

describe("Restaurant Operating System: Course Pacing & Service Coordination", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  it("normalizes diverse restaurant course taxonomies consistently", () => {
    expect(normalizeCourse("Drinks")).toBe("drinks");
    expect(normalizeCourse("bar")).toBe("drinks");
    expect(normalizeCourse("Appetizer")).toBe("starters");
    expect(normalizeCourse("starters")).toBe("starters");
    expect(normalizeCourse("Salad")).toBe("salad");
    expect(normalizeCourse("Entree")).toBe("mains");
    expect(normalizeCourse("mains")).toBe("mains");
    expect(normalizeCourse("Dessert")).toBe("desserts");
    expect(normalizeCourse("Custom")).toBe("custom");
  });

  it("derives ASAP mode for initial drinks & starters and HOLD / FIRE_AFTER_COURSE for mains", async () => {
    const { session } = await service.openTableSession({
      restaurantId: "rest_1",
      locationId: "loc_1",
      tableId: "tbl_14",
      tableLabel: "Table 14",
      diningAreaId: "main",
      openedByEmployeeId: "emp_1",
      assignedServerId: "emp_1"
    });

    const { diner: d1 } = await service.addDiner(session.id, "Alice", 1);
    const { diner: d2 } = await service.addDiner(session.id, "Bob", 2);

    // Add drinks
    await service.addItem(session.id, {
      menuItemId: "drink_1",
      name: "Negroni",
      course: "drinks",
      basePriceCents: 1400,
      selectedModifiers: [],
      splitMode: "single",
      assignedDinerIds: [d1.id],
      dinerId: d1.id
    });

    // Add appetizers
    await service.addItem(session.id, {
      menuItemId: "app_1",
      name: "Crispy Calamari",
      course: "starters",
      basePriceCents: 1500,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: [d1.id, d2.id]
    });

    // Add entrées
    await service.addItem(session.id, {
      menuItemId: "main_1",
      name: "Ribeye Steak with Truffle Butter",
      course: "mains",
      basePriceCents: 3800,
      selectedModifiers: [],
      splitMode: "single",
      assignedDinerIds: [d2.id],
      dinerId: d2.id
    });

    // Add desserts
    await service.addItem(session.id, {
      menuItemId: "dessert_1",
      name: "Tiramisu",
      course: "desserts",
      basePriceCents: 1000,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: [d1.id, d2.id]
    });

    const current = (await repo.findById(session.id))!;
    const pacing = deriveTableCoursePacing(current);

    expect(pacing.courses).toHaveLength(4);

    const drinks = pacing.courses.find((c) => c.course === "drinks")!;
    const starters = pacing.courses.find((c) => c.course === "starters")!;
    const mains = pacing.courses.find((c) => c.course === "mains")!;
    const desserts = pacing.courses.find((c) => c.course === "desserts")!;

    expect(drinks.pacingMode).toBe("ASAP");
    expect(drinks.shouldFireNow).toBe(true);

    expect(starters.pacingMode).toBe("ASAP");
    expect(mains.pacingMode).toBe("FIRE_AFTER_COURSE");
    expect(mains.dependsOnCourse).toBe("starters");
    expect(mains.shouldFireNow).toBe(false); // starters not yet delivered

    expect(desserts.pacingMode).toBe("HOLD");
    expect(desserts.shouldFireNow).toBe(false);
  });

  it("suggests firing dependent Entrées immediately once Starters are delivered", async () => {
    const { session } = await service.openTableSession({
      restaurantId: "rest_1",
      locationId: "loc_1",
      tableId: "tbl_14",
      tableLabel: "Table 14",
      diningAreaId: "main",
      openedByEmployeeId: "emp_1",
      assignedServerId: "emp_1"
    });

    // Add starter and main
    await service.addItem(session.id, {
      menuItemId: "app_1",
      name: "Meatballs",
      course: "starters",
      basePriceCents: 1200,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: []
    });

    await service.addItem(session.id, {
      menuItemId: "main_1",
      name: "Spaghetti Bolognese",
      course: "mains",
      basePriceCents: 2000,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: []
    });

    // Fire Starters and advance to delivered
    const { tickets: starterTickets } = await service.fireCourse(session.id, "starters");
    const tkt = starterTickets[0];
    await service.acceptKitchenTicket(session.id, tkt.id);
    await service.startTicketItem(session.id, tkt.id, tkt.items[0].orderItemId);
    await service.markTicketItemReady(session.id, tkt.id, tkt.items[0].orderItemId);
    await service.deliverTicketItems(session.id, tkt.id, [tkt.items[0].orderItemId]);

    const current = (await repo.findById(session.id))!;
    const pacing = deriveTableCoursePacing(current);

    expect(pacing.hasPacingAlert).toBe(true);
    expect(pacing.nextSuggestedFireCourse).toBe("mains");
    expect(pacing.serverPacingMessage).toContain("Appetizers delivered · Entrées held · Suggested fire: NOW");

    const mains = pacing.courses.find((c) => c.course === "mains")!;
    expect(mains.shouldFireNow).toBe(true);
    expect(mains.suggestedAction).toBe("FIRE_NOW");

    // Server takes explicit action to fire mains
    await service.fireCourse(session.id, "mains");
    const afterMainsFired = (await repo.findById(session.id))!;
    const afterPacing = deriveTableCoursePacing(afterMainsFired);

    expect(afterPacing.courses.find((c) => c.course === "mains")?.status).toBe("fired");
  });

  it("handles scheduled FIRE_AT_TIME target triggers deterministically", async () => {
    const { session } = await service.openTableSession({
      restaurantId: "rest_1",
      locationId: "loc_1",
      tableId: "tbl_20",
      tableLabel: "Table 20",
      diningAreaId: "main",
      openedByEmployeeId: "emp_1",
      assignedServerId: "emp_1"
    });

    await service.addItem(session.id, {
      menuItemId: "main_roast",
      name: "Whole Roasted Duck",
      course: "mains",
      basePriceCents: 6500,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: []
    });

    const now = new Date();
    const futureFireTime = new Date(now.getTime() + 15 * 60 * 1000).toISOString(); // +15 min

    const current = (await repo.findById(session.id))!;

    // Before target time: should not fire
    const pacingBefore = deriveTableCoursePacing(current, now, {
      mains: { mode: "FIRE_AT_TIME", targetFireTime: futureFireTime }
    });
    expect(pacingBefore.courses.find((c) => c.course === "mains")?.shouldFireNow).toBe(false);

    // At or after target time: triggers fire recommendation!
    const targetReachedTime = new Date(now.getTime() + 16 * 60 * 1000);
    const pacingAfter = deriveTableCoursePacing(current, targetReachedTime, {
      mains: { mode: "FIRE_AT_TIME", targetFireTime: futureFireTime }
    });
    expect(pacingAfter.courses.find((c) => c.course === "mains")?.shouldFireNow).toBe(true);
    expect(pacingAfter.courses.find((c) => c.course === "mains")?.recommendationReason).toContain("Scheduled fire time reached");
  });

  it("feeds course pacing gap alerts into the rules-based Attention Engine", async () => {
    const { session } = await service.openTableSession({
      restaurantId: "rest_1",
      locationId: "loc_1",
      tableId: "tbl_7",
      tableLabel: "Table 7",
      diningAreaId: "main",
      openedByEmployeeId: "emp_1",
      assignedServerId: "emp_1"
    });

    // Add starter and main
    await service.addItem(session.id, {
      menuItemId: "app_1",
      name: "Bruschetta",
      course: "starters",
      basePriceCents: 1100,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: []
    });

    await service.addItem(session.id, {
      menuItemId: "main_1",
      name: "Truffle Pizza",
      course: "mains",
      basePriceCents: 2400,
      selectedModifiers: [],
      splitMode: "whole_table",
      assignedDinerIds: []
    });

    // Fire and deliver starters
    const { tickets } = await service.fireCourse(session.id, "starters");
    await service.deliverTicketItems(session.id, tickets[0].id, [tickets[0].items[0].orderItemId]);

    const current = (await repo.findById(session.id))!;
    const evalTime = new Date(Date.now() + 12 * 60 * 1000); // 12 min after delivery (> 8m threshold)

    const attentionItems = evaluateAttentionRules([current], { coursePacingGapMinutes: 8 }, { now: evalTime });
    const pacingAlert = attentionItems.find((i) => i.ruleKey === "COURSE_PACING_GAP");

    expect(pacingAlert).toBeDefined();
    expect(pacingAlert?.recommendedAction).toBe("Fire Entrées Course");
    expect(pacingAlert?.tableLabel).toBe("Table 7");
  });
});
