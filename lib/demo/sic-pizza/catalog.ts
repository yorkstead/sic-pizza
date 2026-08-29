import { z } from "zod";
import type {
  MenuItemWithModifiers,
  ModifierGroupDefinition,
  SelectedSemanticModifier,
  ModifierValidationResult
} from "@/lib/domain/models/modifiers";
import { validateModifierConfiguration } from "@/lib/domain/services/modifier-engine";

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

// ---------------------------------------------------------------------------------
// Generalized Semantic Modifier Groups for SIC Pizza
// ---------------------------------------------------------------------------------

export const SIC_CRUST_GROUP: ModifierGroupDefinition = {
  id: "grp_crust",
  name: "Crust Style",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  defaultOptionId: "crust_ny_thin",
  options: [
    {
      id: "crust_ny_thin",
      name: "New York Thin Crust",
      priceCents: 0,
      isAvailable: true,
      allowPlacement: false,
      allowLevels: false,
      allergens: ["gluten"]
    },
    {
      id: "crust_detroit_deep",
      name: "Detroit Deep Dish",
      priceCents: 300,
      isAvailable: true,
      allowPlacement: false,
      allowLevels: false,
      allergens: ["gluten"]
    },
    {
      id: "crust_gluten_free",
      name: "Gluten-Free Cauliflower Crust",
      priceCents: 350,
      isAvailable: true,
      allowPlacement: false,
      allowLevels: false,
      allowedSizes: ["small"],
      requiresAllergenAck: true,
      allergens: []
    },
    {
      id: "crust_stuffed",
      name: "Stuffed Garlic Butter Crust",
      priceCents: 400,
      isAvailable: true,
      allowPlacement: false,
      allowLevels: false,
      allowedSizes: ["large"],
      allergens: ["dairy", "gluten"]
    }
  ]
};

export const SIC_SAUCE_GROUP: ModifierGroupDefinition = {
  id: "grp_sauce",
  name: "Base Sauce",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  defaultOptionId: "sauce_san_marzano",
  options: [
    {
      id: "sauce_san_marzano",
      name: "San Marzano Tomato Sauce",
      priceCents: 0,
      isAvailable: true,
      allowLevels: true
    },
    {
      id: "sauce_spicy_vodka",
      name: "Spicy Calabrian Vodka Sauce",
      priceCents: 150,
      isAvailable: true,
      allowLevels: true,
      allergens: ["dairy"]
    },
    {
      id: "sauce_garlic_white",
      name: "Roasted Garlic Cream",
      priceCents: 150,
      isAvailable: true,
      allowLevels: true,
      allergens: ["dairy"]
    },
    {
      id: "sauce_none",
      name: "No Sauce (White Pizza)",
      priceCents: 0,
      isAvailable: true,
      allowLevels: false
    }
  ]
};

export const SIC_CHEESE_GROUP: ModifierGroupDefinition = {
  id: "grp_cheese",
  name: "Cheese Blend",
  required: true,
  minSelections: 1,
  maxSelections: 1,
  defaultOptionId: "cheese_mozzarella",
  options: [
    {
      id: "cheese_mozzarella",
      name: "Fresh Whole-Milk Mozzarella",
      priceCents: 0,
      isAvailable: true,
      allowLevels: true,
      extraPriceCents: 225,
      allergens: ["dairy"]
    },
    {
      id: "cheese_vegan",
      name: "Vegan Oat-Milk Mozzarella",
      priceCents: 200,
      isAvailable: true,
      allowLevels: true,
      allergens: []
    },
    {
      id: "cheese_none",
      name: "No Cheese",
      priceCents: 0,
      isAvailable: true,
      allowLevels: false
    }
  ]
};

export const SIC_TOPPINGS_GROUP: ModifierGroupDefinition = {
  id: "grp_toppings",
  name: "Meats & Vegetables",
  required: false,
  minSelections: 0,
  maxSelections: 10,
  allowPlacement: true,
  options: [
    {
      id: "top_pepperoni",
      name: "Ezzo Pepperoni",
      priceCents: 175,
      isAvailable: true,
      allowPlacement: true,
      allowLevels: true,
      extraPriceCents: 150
    },
    {
      id: "top_sausage",
      name: "Hot Italian Sausage",
      priceCents: 175,
      isAvailable: true,
      allowPlacement: true,
      allowLevels: true,
      extraPriceCents: 150
    },
    {
      id: "top_mushrooms",
      name: "Roasted Cremini Mushrooms",
      priceCents: 175,
      isAvailable: true,
      allowPlacement: true,
      allowLevels: true,
      extraPriceCents: 125
    },
    {
      id: "top_onions",
      name: "Caramelized Sweet Onions",
      priceCents: 175,
      isAvailable: true,
      allowPlacement: true,
      allowLevels: true,
      extraPriceCents: 125
    },
    {
      id: "top_pineapple",
      name: "Charred Pineapple",
      priceCents: 175,
      isAvailable: true,
      allowPlacement: true,
      allowLevels: true,
      extraPriceCents: 125
    },
    {
      id: "top_basil",
      name: "Fresh Sweet Basil",
      priceCents: 150,
      isAvailable: false, // 86'd demonstration
      allowPlacement: true,
      allowLevels: true
    },
    {
      id: "top_pesto_pine_nuts",
      name: "Genovese Pesto & Toasted Pine Nuts",
      priceCents: 275,
      isAvailable: true,
      allowPlacement: true,
      allowLevels: true,
      allergens: ["tree_nuts", "dairy"],
      requiresAllergenAck: true
    }
  ]
};

export const SIC_SIDES_GROUP: ModifierGroupDefinition = {
  id: "grp_sides",
  name: "Dipping Sauces & Finishes",
  required: false,
  minSelections: 0,
  maxSelections: 4,
  options: [
    {
      id: "side_hot_honey",
      name: "Mike's Hot Honey Dip",
      priceCents: 125,
      isAvailable: true,
      allowPlacement: false,
      allowLevels: false
    },
    {
      id: "side_garlic_ranch",
      name: "House Buttermilk Garlic Ranch",
      priceCents: 100,
      isAvailable: true,
      allowPlacement: false,
      allowLevels: false,
      allergens: ["dairy"]
    }
  ]
};

/**
 * Creates a standard MenuItemWithModifiers schema for a given pizza size.
 */
export function createSicPizzaMenuItem(size: PizzaSize): MenuItemWithModifiers {
  return {
    id: `sic_pizza_${size}`,
    name: size === "small" ? '12" Small Sicilian Pizza' : '16" Large Sicilian Pizza',
    basePriceCents: PRICES[size],
    course: "mains",
    stationId: "pizza",
    size,
    modifierGroups: [
      SIC_CRUST_GROUP,
      SIC_SAUCE_GROUP,
      SIC_CHEESE_GROUP,
      SIC_TOPPINGS_GROUP,
      SIC_SIDES_GROUP
    ]
  };
}

export function validateSicPizzaConfiguration(
  size: PizzaSize,
  selections: SelectedSemanticModifier[]
): ModifierValidationResult {
  const item = createSicPizzaMenuItem(size);
  return validateModifierConfiguration(item, selections);
}

// Backward-compatible pricePizza function for existing tests
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
