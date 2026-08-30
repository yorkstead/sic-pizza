import { describe, it, expect, beforeEach } from "bun:test";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  SAKURA_IZAKAYA_TENANT,
  AVAILABLE_TENANTS,
  deriveTableBillSummary
} from "@/lib/domain";

describe("Restaurant Operating System: Productized Multi-Tenant Platform", () => {
  let repo: InMemoryTableSessionRepository;
  let service: TableSessionService;

  beforeEach(() => {
    repo = new InMemoryTableSessionRepository();
    service = new TableSessionService(repo);
  });

  describe("1. Platform Architecture & Tenant Separation", () => {
    it("provides clean multi-tenant seeds for different cuisine and service models", () => {
      expect(AVAILABLE_TENANTS.length).toBeGreaterThanOrEqual(2);

      const pizza = AVAILABLE_TENANTS.find((t) => t.tenantId === "sic_pizza_tenant")!;
      const izakaya = AVAILABLE_TENANTS.find((t) => t.tenantId === "sakura_izakaya_tenant")!;

      expect(pizza).toBeDefined();
      expect(izakaya).toBeDefined();

      // Verify distinct station topologies
      expect(pizza.stations.map((s) => s.id)).toContain("PIZZA");
      expect(izakaya.stations.map((s) => s.id)).toContain("SUSHI_BAR");
      expect(izakaya.stations.map((s) => s.id)).toContain("YAKITORI_GRILL");
      expect(izakaya.stations.map((s) => s.id)).toContain("SAKE_BAR");
    });
  });

  describe("2. Fictional Tenant Execution (Sakura Izakaya)", () => {
    it("runs complete service lifecycle on Sakura Izakaya without any pizza domain assumptions", async () => {
      const tenant = SAKURA_IZAKAYA_TENANT;

      // 1. Open Tatami table session
      const { session } = await service.openTableSession({
        restaurantId: tenant.organizationId,
        locationId: tenant.locationId,
        tableId: tenant.tables[0].tableId,
        tableLabel: tenant.tables[0].tableLabel,
        diningAreaId: "tatami",
        openedByEmployeeId: tenant.employees[0].id,
        assignedServerId: tenant.employees[0].id
      });

      expect(session.tableLabel).toBe("Tatami 01");

      // 2. Add diners
      const { diner: d1 } = await service.addDiner(session.id, "Kenji", 1);
      const { diner: d2 } = await service.addDiner(session.id, "Aya", 2);

      // 3. Add Robata Tsukune Skewer (Grill station, custom glaze modifier)
      await service.addItem(session.id, {
        menuItemId: "skewer_tsukune",
        name: "Chicken Tsukune Skewer",
        course: "mains",
        stationId: "YAKITORI_GRILL",
        basePriceCents: 900,
        selectedModifiers: [
          {
            groupId: "grp_skewer_glaze",
            modifierOptionId: "opt_tare",
            name: "Tare Sweet Soy Glaze",
            priceCents: 0,
            level: "NORMAL",
            placement: "WHOLE"
          }
        ],
        dinerId: d1.id
      });

      // 4. Add Salmon Truffle Crudo (Sushi Bar station)
      await service.addItem(session.id, {
        menuItemId: "raw_salmon_crudo",
        name: "King Salmon Truffle Crudo",
        course: "starters",
        stationId: "SUSHI_BAR",
        basePriceCents: 1800,
        selectedModifiers: [],
        dinerId: d2.id
      });

      // 5. Add Suntory Toki Highball (Sake Bar station)
      await service.addItem(session.id, {
        menuItemId: "drink_highball",
        name: "Suntory Toki Highball",
        course: "drinks",
        stationId: "SAKE_BAR",
        basePriceCents: 1400,
        selectedModifiers: [],
        dinerId: d1.id
      });

      // 6. Fire starters (Sushi Bar)
      const starterFire = await service.fireCourse(session.id, "starters");
      expect(starterFire.tickets.length).toBe(1);
      expect(starterFire.tickets[0].stationId).toBe("SUSHI_BAR");
      expect(starterFire.tickets[0].items[0].name).toBe("King Salmon Truffle Crudo");

      // 7. Fire mains (Yakitori Grill)
      const mainsFire = await service.fireCourse(session.id, "mains");
      expect(mainsFire.tickets.length).toBe(1);
      expect(mainsFire.tickets[0].stationId).toBe("YAKITORI_GRILL");
      expect(mainsFire.tickets[0].items[0].modifiers[0]).toContain("Tare Sweet Soy Glaze");

      // 8. Financial verification with tenant's specific tax rate (8.875%)
      const refreshed = (await repo.findById(session.id))!;
      const bill = deriveTableBillSummary(refreshed, tenant.taxRatePercent);

      // Subtotal = 900 + 1800 + 1400 = 4100 cents ($41.00)
      expect(bill.subtotalCents).toBe(4100);
      // Tax at 8.875% of 4100 cents = 363.875 -> 364 cents ($3.64)
      expect(bill.taxCents).toBe(364);
      // Total = 4464 cents ($44.64)
      expect(bill.totalCents).toBe(4464);
    });
  });
});
