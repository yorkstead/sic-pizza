import { describe, it, expect } from "bun:test";
import {
  calculateSemanticModifierPrice,
  formatSemanticModifier,
  validateModifierConfiguration,
  type SelectedSemanticModifier
} from "@/lib/domain";
import {
  createSicPizzaMenuItem,
  validateSicPizzaConfiguration,
  SIC_CRUST_GROUP,
  SIC_SAUCE_GROUP,
  SIC_CHEESE_GROUP,
  SIC_TOPPINGS_GROUP
} from "@/lib/demo/sic-pizza/catalog";

describe("Restaurant Operating System: Semantic Modifier & Validation Engine", () => {
  // Sample test menu item (12" Small Sicilian Pizza)
  const smallPizzaItem = createSicPizzaMenuItem("small");
  const largePizzaItem = createSicPizzaMenuItem("large");

  describe("1. Pricing & Quantity Level Engine", () => {
    const pepperoniOpt = SIC_TOPPINGS_GROUP.options.find((o) => o.id === "top_pepperoni")!;
    const cheeseOpt = SIC_CHEESE_GROUP.options.find((o) => o.id === "cheese_mozzarella")!;

    it("calculates exact base pricing for NORMAL WHOLE portion", () => {
      const price = calculateSemanticModifierPrice(pepperoniOpt, "NORMAL", "WHOLE");
      expect(price).toBe(175); // $1.75
    });

    it("calculates zero pricing for NONE level", () => {
      const price = calculateSemanticModifierPrice(cheeseOpt, "NONE", "WHOLE");
      expect(price).toBe(0);
    });

    it("calculates exact half-topping integer cent pricing (50% rounded)", () => {
      const leftPrice = calculateSemanticModifierPrice(pepperoniOpt, "NORMAL", "LEFT");
      const rightPrice = calculateSemanticModifierPrice(pepperoniOpt, "NORMAL", "RIGHT");

      // 175 * 0.5 = 87.5 -> 88 cents
      expect(leftPrice).toBe(88);
      expect(rightPrice).toBe(88);
    });

    it("applies EXTRA surcharge level correctly", () => {
      // extraPriceCents: 150 -> 175 + 150 = 325 cents ($3.25)
      const wholeExtra = calculateSemanticModifierPrice(pepperoniOpt, "EXTRA", "WHOLE");
      expect(wholeExtra).toBe(325);

      // Cheese extra: 0 base + 225 extra = 225 cents ($2.25)
      const cheeseExtra = calculateSemanticModifierPrice(cheeseOpt, "EXTRA", "WHOLE");
      expect(cheeseExtra).toBe(225);
    });

    it("formats semantic intent cleanly for kitchen and expo", () => {
      expect(
        formatSemanticModifier({ name: "Pepperoni", level: "NORMAL", placement: "LEFT" })
      ).toBe("[Left 1/2] Pepperoni");

      expect(
        formatSemanticModifier({ name: "Mozzarella", level: "EXTRA", placement: "WHOLE" })
      ).toBe("EXTRA Mozzarella");

      expect(
        formatSemanticModifier({ name: "Onions", level: "NONE", placement: "WHOLE" })
      ).toBe("NO Onions");

      expect(
        formatSemanticModifier({ name: "Ranch", level: "ON_SIDE", placement: "WHOLE" })
      ).toBe("SIDE Ranch");
    });
  });

  describe("2. Valid Configurations", () => {
    it("accepts a fully specified standard pizza configuration", () => {
      const selections: SelectedSemanticModifier[] = [
        {
          optionId: "crust_ny_thin",
          groupId: SIC_CRUST_GROUP.id,
          name: "New York Thin Crust",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "sauce_san_marzano",
          groupId: SIC_SAUCE_GROUP.id,
          name: "San Marzano Tomato Sauce",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "cheese_mozzarella",
          groupId: SIC_CHEESE_GROUP.id,
          name: "Fresh Whole-Milk Mozzarella",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "top_pepperoni",
          groupId: SIC_TOPPINGS_GROUP.id,
          name: "Ezzo Pepperoni",
          level: "NORMAL",
          placement: "LEFT",
          priceCents: 88
        },
        {
          optionId: "top_mushrooms",
          groupId: SIC_TOPPINGS_GROUP.id,
          name: "Roasted Cremini Mushrooms",
          level: "NORMAL",
          placement: "RIGHT",
          priceCents: 88
        }
      ];

      const result = validateModifierConfiguration(smallPizzaItem, selections);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.totalModifierPriceCents).toBe(88 + 88); // 176 cents
    });
  });

  describe("3. Required Groups & Min/Max Selections", () => {
    it("rejects pizza when required Crust group is omitted", () => {
      const selections: SelectedSemanticModifier[] = [
        {
          optionId: "sauce_san_marzano",
          groupId: SIC_SAUCE_GROUP.id,
          name: "San Marzano Tomato Sauce",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "cheese_mozzarella",
          groupId: SIC_CHEESE_GROUP.id,
          name: "Fresh Whole-Milk Mozzarella",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        }
      ];

      const result = validateModifierConfiguration(smallPizzaItem, selections);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("Crust Style"))).toBe(true);
    });

    it("rejects selecting more than maxSelections in single-choice group", () => {
      const selections: SelectedSemanticModifier[] = [
        {
          optionId: "crust_ny_thin",
          groupId: SIC_CRUST_GROUP.id,
          name: "New York Thin Crust",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "crust_detroit_deep",
          groupId: SIC_CRUST_GROUP.id,
          name: "Detroit Deep Dish",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 300
        },
        {
          optionId: "sauce_san_marzano",
          groupId: SIC_SAUCE_GROUP.id,
          name: "San Marzano Tomato Sauce",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "cheese_mozzarella",
          groupId: SIC_CHEESE_GROUP.id,
          name: "Fresh Whole-Milk Mozzarella",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        }
      ];

      const result = validateModifierConfiguration(smallPizzaItem, selections);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('allows at most 1 selection(s)'))).toBe(true);
    });
  });

  describe("4. Contradictory & Mutually Exclusive States", () => {
    it("rejects contradictory NO + EXTRA on the same modifier ingredient", () => {
      const selections: SelectedSemanticModifier[] = [
        {
          optionId: "crust_ny_thin",
          groupId: SIC_CRUST_GROUP.id,
          name: "New York Thin Crust",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "sauce_san_marzano",
          groupId: SIC_SAUCE_GROUP.id,
          name: "San Marzano Tomato Sauce",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "cheese_mozzarella",
          groupId: SIC_CHEESE_GROUP.id,
          name: "Fresh Whole-Milk Mozzarella",
          level: "NONE",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "cheese_mozzarella",
          groupId: SIC_CHEESE_GROUP.id,
          name: "Fresh Whole-Milk Mozzarella",
          level: "EXTRA",
          placement: "WHOLE",
          priceCents: 225
        }
      ];

      const result = validateModifierConfiguration(smallPizzaItem, selections);
      expect(result.isValid).toBe(false);
      expect(
        result.errors.some((e) => e.includes('Contradictory selections') || e.includes('allows at most 1 selection(s)'))
      ).toBe(true);
    });
  });

  describe("5. Item & Size Constraints", () => {
    it("rejects Stuffed Garlic Crust on Small size (restricted to large)", () => {
      const selections: SelectedSemanticModifier[] = [
        {
          optionId: "crust_stuffed",
          groupId: SIC_CRUST_GROUP.id,
          name: "Stuffed Garlic Butter Crust",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 400
        },
        {
          optionId: "sauce_san_marzano",
          groupId: SIC_SAUCE_GROUP.id,
          name: "San Marzano Tomato Sauce",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "cheese_mozzarella",
          groupId: SIC_CHEESE_GROUP.id,
          name: "Fresh Whole-Milk Mozzarella",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        }
      ];

      // Small pizza fails size constraint
      const smallResult = validateModifierConfiguration(smallPizzaItem, selections);
      expect(smallResult.isValid).toBe(false);
      expect(smallResult.errors.some((e) => e.includes("only available for large size"))).toBe(true);

      // Large pizza passes size constraint
      const largeResult = validateModifierConfiguration(largePizzaItem, selections);
      expect(largeResult.isValid).toBe(true);
    });
  });

  describe("6. 86'd Unavailable Modifiers", () => {
    it("rejects 86'd out-of-stock modifiers before kitchen submission", () => {
      const selections: SelectedSemanticModifier[] = [
        {
          optionId: "crust_ny_thin",
          groupId: SIC_CRUST_GROUP.id,
          name: "New York Thin Crust",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "sauce_san_marzano",
          groupId: SIC_SAUCE_GROUP.id,
          name: "San Marzano Tomato Sauce",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "cheese_mozzarella",
          groupId: SIC_CHEESE_GROUP.id,
          name: "Fresh Whole-Milk Mozzarella",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "top_basil", // isAvailable: false
          groupId: SIC_TOPPINGS_GROUP.id,
          name: "Fresh Sweet Basil",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 150
        }
      ];

      const result = validateModifierConfiguration(smallPizzaItem, selections);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("86'd (unavailable)"))).toBe(true);
    });
  });

  describe("7. Allergen Acknowledgment Validation", () => {
    it("rejects allergen-sensitive options when acknowledgment is missing", () => {
      const selectionsWithoutAck: SelectedSemanticModifier[] = [
        {
          optionId: "crust_ny_thin",
          groupId: SIC_CRUST_GROUP.id,
          name: "New York Thin Crust",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "sauce_san_marzano",
          groupId: SIC_SAUCE_GROUP.id,
          name: "San Marzano Tomato Sauce",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "cheese_mozzarella",
          groupId: SIC_CHEESE_GROUP.id,
          name: "Fresh Whole-Milk Mozzarella",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "top_pesto_pine_nuts", // requiresAllergenAck: true
          groupId: SIC_TOPPINGS_GROUP.id,
          name: "Genovese Pesto & Toasted Pine Nuts",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 275,
          allergenAck: false // Missing ack
        }
      ];

      const result = validateModifierConfiguration(smallPizzaItem, selectionsWithoutAck);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes("requires explicit guest/staff acknowledgment"))).toBe(true);

      // Passes once acknowledged
      const selectionsWithAck = selectionsWithoutAck.map((s) =>
        s.optionId === "top_pesto_pine_nuts" ? { ...s, allergenAck: true } : s
      );
      const ackResult = validateModifierConfiguration(smallPizzaItem, selectionsWithAck);
      expect(ackResult.isValid).toBe(true);
    });
  });

  describe("8. Helper Integration with Demo Catalog", () => {
    it("validates pizza through helper function", () => {
      const validSelections: SelectedSemanticModifier[] = [
        {
          optionId: "crust_ny_thin",
          groupId: SIC_CRUST_GROUP.id,
          name: "New York Thin Crust",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "sauce_san_marzano",
          groupId: SIC_SAUCE_GROUP.id,
          name: "San Marzano Tomato Sauce",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        },
        {
          optionId: "cheese_mozzarella",
          groupId: SIC_CHEESE_GROUP.id,
          name: "Fresh Whole-Milk Mozzarella",
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: 0
        }
      ];

      const result = validateSicPizzaConfiguration("small", validSelections);
      expect(result.isValid).toBe(true);
    });
  });
});
