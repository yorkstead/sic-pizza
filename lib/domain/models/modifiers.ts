import { z } from "zod";

export const modifierLevelSchema = z.enum([
  "NONE",
  "LIGHT",
  "NORMAL",
  "EXTRA",
  "ON_SIDE"
]);
export type ModifierLevel = z.infer<typeof modifierLevelSchema>;

export const modifierPlacementSchema = z.enum([
  "WHOLE",
  "LEFT",
  "RIGHT"
]);
export type ModifierPlacement = z.infer<typeof modifierPlacementSchema>;

export interface ModifierOptionDefinition {
  id: string;
  name: string;
  priceCents: number; // Base price for standard whole portion
  isAvailable: boolean;
  allowPlacement?: boolean; // Can be placed Left, Right, Whole (e.g. toppings)
  allowLevels?: boolean; // Can be None, Light, Normal, Extra, On Side
  extraPriceCents?: number; // Surcharge for EXTRA level (e.g. +$1.50)
  halfPriceRatio?: number; // Multiplier for half placement (default: 0.5 or integer rounding)
  allergens?: string[]; // e.g. ["dairy", "gluten", "nuts"]
  requiresAllergenAck?: boolean;
  incompatibleOptionIds?: string[]; // Mutually exclusive with other option IDs
  allowedSizes?: string[]; // Optional size constraints e.g. ["large"]
}

export interface ModifierGroupDefinition {
  id: string;
  name: string;
  minSelections: number; // 0 for optional, 1+ for required
  maxSelections: number; // 1 for single choice / mutually exclusive, >1 for multi
  required: boolean;
  options: ModifierOptionDefinition[];
  defaultOptionId?: string;
  allowPlacement?: boolean; // Can items in this group be split half/whole?
}

export interface MenuItemWithModifiers {
  id: string;
  name: string;
  basePriceCents: number;
  course: string;
  stationId: string;
  size?: string; // e.g. "small" | "medium" | "large"
  modifierGroups: ModifierGroupDefinition[];
}

export interface SelectedSemanticModifier {
  optionId: string;
  groupId: string;
  name: string;
  level: ModifierLevel;
  placement: ModifierPlacement;
  priceCents: number;
  allergenAck?: boolean;
}

export interface ModifierValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  totalModifierPriceCents: number;
}
