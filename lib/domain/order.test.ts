import { describe, expect, test } from "bun:test";
import {
  pricePizza,
  PRICES,
  transitionOrderStatus,
  calculateItemUnitPrice,
  calculateItemTotalCents,
  calculateOrderTotals,
  calculateEqualSplit,
  type OrderItem
} from "./order";

describe("SIC Pizza Demo Catalog", () => {
  test("uses integer cents for base and modifiers", () => {
    expect(
      pricePizza({
        size: "large",
        toppings: ["pepperoni", "onions"],
        extraCheese: true
      })
    ).toBe(PRICES.large + 2 * PRICES.topping + PRICES.extraCheese);
  });

  test("rejects duplicate modifier billing", () => {
    expect(() =>
      pricePizza({
        size: "small",
        toppings: ["onions", "onions"],
        extraCheese: false
      })
    ).toThrow("Duplicate");
  });
});

describe("Restaurant Operating System: Platform Core", () => {
  describe("Generic Item & Modifier Calculations", () => {
    test("calculates unit price with zero or multiple modifiers", () => {
      const unit = calculateItemUnitPrice(1200, [
        { id: "m1", name: "Gluten Free Crust", priceCents: 300 },
        { id: "m2", name: "Extra Sauce", priceCents: 50 }
      ]);
      expect(unit).toBe(1550);
    });

    test("multiplies unit price by quantity", () => {
      const total = calculateItemTotalCents({
        basePriceCents: 1000,
        modifiers: [{ id: "m1", name: "Cheese", priceCents: 200 }],
        quantity: 3
      });
      expect(total).toBe(3600);
    });
  });

  describe("Order Totals & Tax", () => {
    test("computes subtotal, tax, and total excluding unconfirmed proposals and voided items", () => {
      const items: OrderItem[] = [
        {
          id: "item-1",
          orderId: "ord-1",
          menuItemId: "menu-pizza",
          name: "Large Pizza",
          course: "mains",
          stationId: "pizza-oven",
          status: "confirmed",
          quantity: 1,
          basePriceCents: 1900,
          modifiers: [{ id: "top-1", name: "Pepperoni", priceCents: 175 }],
          createdAt: new Date().toISOString()
        },
        {
          id: "item-2",
          orderId: "ord-1",
          menuItemId: "menu-drink",
          name: "Draft Beer",
          course: "drinks",
          stationId: "bar",
          status: "proposed", // unconfirmed guest item -> ignored in totals
          quantity: 2,
          basePriceCents: 700,
          modifiers: [],
          createdAt: new Date().toISOString()
        },
        {
          id: "item-3",
          orderId: "ord-1",
          menuItemId: "menu-app",
          name: "Garlic Knots",
          course: "starters",
          stationId: "pizza-oven",
          status: "voided", // voided -> ignored in totals
          quantity: 1,
          basePriceCents: 800,
          modifiers: [],
          createdAt: new Date().toISOString()
        }
      ];

      const { subtotalCents, taxCents, totalCents } = calculateOrderTotals(items, 8.25);
      expect(subtotalCents).toBe(2075);
      expect(taxCents).toBe(Math.round((2075 * 8.25) / 100)); // 171
      expect(totalCents).toBe(2246);
    });
  });

  describe("Equal Split Calculations", () => {
    test("divides bill deterministically with remainder tracking", () => {
      const { splitCents, remainderCents } = calculateEqualSplit(2246, 3);
      expect(splitCents).toBe(748);
      expect(remainderCents).toBe(2);
      expect(splitCents * 3 + remainderCents).toBe(2246);
    });
  });

  describe("Order Status State Machine", () => {
    test("allows standard kitchen lifecycle transitions", () => {
      expect(transitionOrderStatus("draft", "submitted")).toBe("submitted");
      expect(transitionOrderStatus("submitted", "making")).toBe("making");
      expect(transitionOrderStatus("making", "ready")).toBe("ready");
      expect(transitionOrderStatus("ready", "served")).toBe("served");
      expect(transitionOrderStatus("served", "paid")).toBe("paid");
    });

    test("rejects skipping required states", () => {
      expect(() => transitionOrderStatus("draft", "ready")).toThrow("Invalid");
      expect(() => transitionOrderStatus("draft", "paid")).toThrow("Invalid");
    });
  });
});
