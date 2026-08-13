import { describe, expect, test } from "bun:test";
import { pricePizza, PRICES, transitionOrder } from "./order";
describe("pizza pricing", () => {
  test("uses integer cents for base and modifiers", () => expect(pricePizza({ size: "large", toppings: ["pepperoni", "onions"], extraCheese: true })).toBe(PRICES.large + 2 * PRICES.topping + PRICES.extraCheese));
  test("rejects duplicate modifier billing", () => expect(() => pricePizza({ size: "small", toppings: ["onions", "onions"], extraCheese: false })).toThrow("Duplicate"));
});
describe("order transitions", () => {
  test("allows the kitchen lifecycle", () => expect(transitionOrder("submitted", "making")).toBe("making"));
  test("rejects skipping required states", () => expect(() => transitionOrder("draft", "ready")).toThrow("Invalid"));
});
