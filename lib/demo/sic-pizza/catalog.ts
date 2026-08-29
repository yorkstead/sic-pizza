import { z } from "zod";

export const pizzaSizeSchema = z.enum(["small", "large"]);
export type PizzaSize = z.infer<typeof pizzaSizeSchema>;

export type PizzaSelection = {
  size: PizzaSize;
  toppings: string[];
  extraCheese: boolean;
};

export const TOPPINGS = ["pepperoni", "mushrooms", "onions", "pineapple"] as const;

export const PRICES = {
  small: 1400,
  large: 1900,
  topping: 175,
  extraCheese: 225
} as const;

export function pricePizza(pizza: PizzaSelection): number {
  pizzaSizeSchema.parse(pizza.size);
  const uniqueToppings = new Set(pizza.toppings);
  if (uniqueToppings.size !== pizza.toppings.length) {
    throw new Error("Duplicate toppings are not billable");
  }
  return (
    PRICES[pizza.size] +
    uniqueToppings.size * PRICES.topping +
    (pizza.extraCheese ? PRICES.extraCheese : 0)
  );
}
