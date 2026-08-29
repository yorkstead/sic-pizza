import type {
  MenuItemWithModifiers,
  ModifierGroupDefinition,
  ModifierOptionDefinition,
  SelectedSemanticModifier,
  ModifierValidationResult,
  ModifierLevel,
  ModifierPlacement
} from "../models/modifiers";

/**
 * Calculates exact integer-cent price for a modifier based on quantity level and portion placement.
 */
export function calculateSemanticModifierPrice(
  option: ModifierOptionDefinition,
  level: ModifierLevel = "NORMAL",
  placement: ModifierPlacement = "WHOLE"
): number {
  if (level === "NONE") {
    return 0;
  }

  // Base portion pricing (Half is 50% rounded)
  let portionCents = option.priceCents;
  if (placement === "LEFT" || placement === "RIGHT") {
    const ratio = option.halfPriceRatio ?? 0.5;
    portionCents = Math.round(option.priceCents * ratio);
  }

  // Level adjustments (EXTRA adds surcharge or 50% of standard portion)
  if (level === "EXTRA") {
    const extraSurcharge = option.extraPriceCents ?? Math.max(100, Math.round(portionCents * 0.5));
    return portionCents + extraSurcharge;
  }

  return portionCents;
}

/**
 * Formats a semantic modifier selection into a clear, unambiguous kitchen/server text representation.
 */
export function formatSemanticModifier(mod: {
  name: string;
  level: ModifierLevel;
  placement: ModifierPlacement;
}): string {
  const parts: string[] = [];

  if (mod.placement === "LEFT") {
    parts.push("[Left 1/2]");
  } else if (mod.placement === "RIGHT") {
    parts.push("[Right 1/2]");
  }

  if (mod.level === "NONE") {
    parts.push("NO");
  } else if (mod.level === "LIGHT") {
    parts.push("LIGHT");
  } else if (mod.level === "EXTRA") {
    parts.push("EXTRA");
  } else if (mod.level === "ON_SIDE") {
    parts.push("SIDE");
  }

  parts.push(mod.name);
  return parts.join(" ");
}

/**
 * Pure, deterministic modifier validation and pricing engine.
 * Validates constraints before ticket submission to the kitchen.
 */
export function validateModifierConfiguration(
  item: MenuItemWithModifiers,
  selections: SelectedSemanticModifier[],
  options: { allowUnavailableForManagers?: boolean } = {}
): ModifierValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  let totalModifierPriceCents = 0;

  // Build lookup maps
  const groupsById = new Map<string, ModifierGroupDefinition>();
  const optionsById = new Map<string, { option: ModifierOptionDefinition; group: ModifierGroupDefinition }>();

  for (const group of item.modifierGroups) {
    groupsById.set(group.id, group);
    for (const opt of group.options) {
      optionsById.set(opt.id, { option: opt, group });
    }
  }

  // Track selections by group and by option
  const selectionsByGroup = new Map<string, SelectedSemanticModifier[]>();
  const selectionsByOptionId = new Map<string, SelectedSemanticModifier[]>();

  for (const sel of selections) {
    // 1. Check if option exists in this menu item's definitions
    const lookup = optionsById.get(sel.optionId);
    if (!lookup) {
      errors.push(`Modifier "${sel.name}" (${sel.optionId}) does not belong to ${item.name}.`);
      continue;
    }

    const { option, group } = lookup;

    // 2. Check item availability
    if (!option.isAvailable && !options.allowUnavailableForManagers) {
      errors.push(`"${option.name}" is currently 86'd (unavailable).`);
    }

    // 3. Check item size constraints
    if (option.allowedSizes && item.size && !option.allowedSizes.includes(item.size)) {
      errors.push(`"${option.name}" is only available for ${option.allowedSizes.join(", ")} size (current: ${item.size}).`);
    }

    // 4. Check placement constraints (e.g. cannot split non-splittable group)
    if ((sel.placement === "LEFT" || sel.placement === "RIGHT") && !option.allowPlacement && !group.allowPlacement) {
      errors.push(`"${option.name}" cannot be placed on half-portion; whole portion required.`);
    }

    // 5. Check level constraints
    if (sel.level !== "NORMAL" && sel.level !== "NONE" && option.allowLevels === false) {
      errors.push(`"${option.name}" does not support custom level "${sel.level}".`);
    }

    // 6. Check allergen acknowledgment requirement
    if (option.requiresAllergenAck && !sel.allergenAck) {
      errors.push(`"${option.name}" contains allergens (${(option.allergens || []).join(", ")}) and requires explicit guest/staff acknowledgment.`);
    }

    // Group tracking
    const gList = selectionsByGroup.get(group.id) || [];
    gList.push(sel);
    selectionsByGroup.set(group.id, gList);

    // Option tracking
    const oList = selectionsByOptionId.get(sel.optionId) || [];
    oList.push(sel);
    selectionsByOptionId.set(sel.optionId, oList);

    // Calculate price
    const calculatedPrice = calculateSemanticModifierPrice(option, sel.level, sel.placement);
    totalModifierPriceCents += calculatedPrice;
  }

  // 7. Check minSelections and maxSelections per group
  for (const group of item.modifierGroups) {
    const groupSelections = selectionsByGroup.get(group.id) || [];
    // Active selections (ignoring NONE level when checking minimums for required positive choices)
    const positiveSelections = groupSelections.filter((s) => s.level !== "NONE");

    if (group.required && positiveSelections.length < group.minSelections) {
      errors.push(
        `Selection required for "${group.name}": please select at least ${group.minSelections} option (selected ${positiveSelections.length}).`
      );
    } else if (groupSelections.length < group.minSelections) {
      errors.push(
        `"${group.name}" requires at least ${group.minSelections} selection(s) (selected ${groupSelections.length}).`
      );
    }

    if (group.maxSelections > 0 && groupSelections.length > group.maxSelections) {
      errors.push(
        `"${group.name}" allows at most ${group.maxSelections} selection(s) (selected ${groupSelections.length}).`
      );
    }
  }

  // 8. Check for conflicting or mutually exclusive option pairs
  for (const sel of selections) {
    const lookup = optionsById.get(sel.optionId);
    if (!lookup) continue;
    const { option } = lookup;

    // Check same-option contradictory levels (e.g. NONE + EXTRA on same option)
    const sameOptionSelections = selectionsByOptionId.get(sel.optionId) || [];
    if (sameOptionSelections.length > 1) {
      const hasNone = sameOptionSelections.some((s) => s.level === "NONE");
      const hasExtra = sameOptionSelections.some((s) => s.level === "EXTRA");
      const hasNormal = sameOptionSelections.some((s) => s.level === "NORMAL" || s.level === "LIGHT");
      if (hasNone && (hasExtra || hasNormal)) {
        errors.push(`Contradictory selections for "${option.name}": cannot select "NO" and active portion simultaneously.`);
      }
    }

    // Check explicit incompatible options
    if (option.incompatibleOptionIds) {
      for (const incompOptId of option.incompatibleOptionIds) {
        if (selectionsByOptionId.has(incompOptId)) {
          const incompName = optionsById.get(incompOptId)?.option.name || incompOptId;
          errors.push(`"${option.name}" cannot be combined with mutually exclusive option "${incompName}".`);
        }
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalModifierPriceCents
  };
}
