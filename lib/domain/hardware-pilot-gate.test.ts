import { describe, it, expect, beforeEach } from "bun:test";
import { HardwarePrinterAdapter } from "../server/hardware/printer-adapter";
import { runControlledPilotAudit } from "../server/pilot/pilot-gate";


describe("Restaurant Operating System: Hardware Integration & Controlled-Pilot Release Gate", () => {
  let printer: HardwarePrinterAdapter;

  beforeEach(() => {
    printer = new HardwarePrinterAdapter();
    printer.reset();
  });

  describe("1. ESC/POS Byte Sequence Generation & Kitchen Chits", () => {
    it("generates valid ESC/POS byte sequence and text projection for kitchen line cook chits", () => {
      const chit = printer.formatKitchenChit({
        tableLabel: "Table 11",
        serverName: "Jordan",
        course: "mains",
        ticketNumber: 104,
        items: [
          {
            name: "Sicilian Pepperoni Pizza",
            modifiers: ["Extra Crispy Crust", "Hot Honey Drizzle"],
            dinerName: "Alex"
          },
          {
            name: "Caesar Salad",
            notes: ["Dressing on the side"]
          }
        ],
        timestamp: "2026-09-01T19:30:00Z"
      });

      expect(chit.rawBytesBase64).toBeDefined();
      expect(chit.rawBytesBase64.length).toBeGreaterThan(50);
      expect(chit.textProjection).toContain("MAINS");
      expect(chit.textProjection).toContain("Table: Table 11");
      expect(chit.textProjection).toContain("1x Sicilian Pepperoni Pizza");
      expect(chit.textProjection).toContain("+ Extra Crispy Crust");
      expect(chit.textProjection).toContain("+ Hot Honey Drizzle");
      expect(chit.textProjection).toContain("For: Alex");
      expect(chit.textProjection).toContain("NOTE: Dressing on the side");
    });

    it("generates formatted itemized guest check with mathematical total rows and cut commands", () => {
      const check = printer.formatGuestCheck({
        restaurantName: "SIC PIZZA CO.",
        tableLabel: "Table 11",
        serverName: "Jordan",
        checkNumber: "CHK-104",
        items: [
          { name: "Sicilian Pizza", priceCents: 2400 },
          { name: "Garlic Knots", priceCents: 800 },
          { name: "Peroni Beer", priceCents: 700 }
        ],
        subtotalCents: 3900,
        taxCents: 322,
        tipCents: 800,
        totalCents: 5022,
        joinUrl: "https://sicpizza.app/join/sess_11"
      });

      expect(check.rawBytesBase64.length).toBeGreaterThan(50);
      expect(check.textProjection).toContain("SIC PIZZA CO.");
      expect(check.textProjection).toContain("Table 11");
      expect(check.textProjection).toContain("Subtotal:");
      expect(check.textProjection).toContain("$39.00");
      expect(check.textProjection).toContain("TOTAL DUE:");
      expect(check.textProjection).toContain("$50.22");
    });
  });

  describe("2. Printer Spooler & Hardware Error Simulation", () => {
    it("spools print jobs to online printers and records PRINTED status", async () => {
      const chit = printer.formatKitchenChit({
        tableLabel: "Table 04",
        serverName: "Jordan",
        course: "starters",
        ticketNumber: 105,
        items: [{ name: "Meatballs" }],
        timestamp: "2026-09-01T19:35:00Z"
      });

      const job = await printer.spoolPrintJob({
        type: "kitchen_ticket",
        targetPrinter: "kitchen_main",
        rawBytesBase64: chit.rawBytesBase64,
        textProjection: chit.textProjection
      });

      expect(job.id).toMatch(/^print_/);
      expect(job.status).toBe("PRINTED");
      expect(printer.getSpool().length).toBe(1);
    });

    it("captures printer error state when printer is OUT_OF_PAPER or OFFLINE", async () => {
      printer.setPrinterStatus("bar_printer", "OUT_OF_PAPER");

      const job = await printer.spoolPrintJob({
        type: "kitchen_ticket",
        targetPrinter: "bar_printer",
        rawBytesBase64: "dummy_bytes",
        textProjection: "Drink chit"
      });

      expect(job.status).toBe("ERROR");
      expect(job.error).toContain("OUT_OF_PAPER");
    });
  });

  describe("3. Controlled-Pilot Release Gate Audit", () => {
    it("executes full 7-pillar audit and returns 100% readiness pass", async () => {
      const report = await runControlledPilotAudit();

      expect(report.totalChecks).toBe(7);
      expect(report.passedChecks).toBe(7);

      expect(report.failedChecks).toBe(0);
      expect(report.scorePercent).toBe(100);
      expect(report.readyForControlledPilot).toBe(true);
      expect(report.recommendation).toContain("SYSTEM READY");

      // Verify each individual pillar was evaluated
      const pillarTitles = report.checks.map((c) => c.pillar);
      expect(pillarTitles).toContain("1. Transactional Persistence");
      expect(pillarTitles).toContain("2. Staff Access & RBAC");
      expect(pillarTitles).toContain("3. Guest Joining & Scoped Sessions");
      expect(pillarTitles).toContain("4. Realtime Delivery & Recovery");
      expect(pillarTitles).toContain("5. Financial Ledger & Billing Integrity");
      expect(pillarTitles).toContain("6. Payments & Ledger Balancing");
      expect(pillarTitles).toContain("7. Hardware & Thermal Printers");
    });
  });
});
