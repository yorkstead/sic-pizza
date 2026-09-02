import React, { useState, useMemo } from "react";
import {
  Plus,
  X,
  Users,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  PieChart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { money } from "@/lib/utils";
import {
  PRICES,
  SIC_CRUST_GROUP,
  SIC_SAUCE_GROUP,
  SIC_CHEESE_GROUP,
  SIC_TOPPINGS_GROUP,
  SIC_SIDES_GROUP,
  createSicPizzaMenuItem,
  type PizzaSize,
  type PizzaSelection
} from "@/lib/demo/sic-pizza/catalog";
import {
  validateModifierConfiguration,
  calculateSemanticModifierPrice,
  formatSemanticModifier
} from "@/lib/domain/services/modifier-engine";
import type {
  SelectedSemanticModifier,
  ModifierLevel,
  ModifierPlacement
} from "@/lib/domain/models/modifiers";
import type { Diner } from "@/lib/domain/models/session";
import type { Course } from "@/lib/domain/models/menu";
import type { SplitMode, SelectedModifier } from "@/lib/domain/models/order";

interface OwnershipSelection {
  splitMode: SplitMode;
  assignedDinerIds: string[];
}

interface AddItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  diners: readonly Diner[];
  onAddPizza: (
    pizza: PizzaSelection,
    ownership: OwnershipSelection,
    course?: Course,
    semanticModifiers?: SelectedModifier[]
  ) => void;
  onAddDrink: (name: string, priceCents: number, ownership: OwnershipSelection) => void;
  onAddStarter: (name: string, priceCents: number, ownership: OwnershipSelection) => void;
}

export function AddItemDialog({
  isOpen,
  onClose,
  diners,
  onAddPizza,
  onAddDrink,
  onAddStarter
}: AddItemDialogProps) {
  const [tab, setTab] = useState<"pizza" | "drinks" | "starters">("pizza");
  const [splitMode, setSplitMode] = useState<SplitMode>("single");
  const [selectedDinerIds, setSelectedDinerIds] = useState<string[]>([diners[0]?.id || ""]);

  // Pizza Customization State
  const [size, setSize] = useState<PizzaSize>("large");
  const [selectedCrustId, setSelectedCrustId] = useState<string>("crust_ny_thin");
  const [selectedSauceId, setSelectedSauceId] = useState<string>("sauce_san_marzano");
  const [selectedCheeseId, setSelectedCheeseId] = useState<string>("cheese_mozzarella");
  const [cheeseLevel, setCheeseLevel] = useState<ModifierLevel>("NORMAL");
  const [acknowledgedAllergens, setAcknowledgedAllergens] = useState<Set<string>>(new Set());

  // Toppings mapped by optionId -> { level, placement }
  const [selectedToppings, setSelectedToppings] = useState<
    Map<string, { level: ModifierLevel; placement: ModifierPlacement }>
  >(
    new Map([
      ["top_pepperoni", { level: "NORMAL", placement: "WHOLE" }]
    ])
  );

  // Sides / Finishes
  const [selectedSideIds, setSelectedSideIds] = useState<Set<string>>(new Set());

  // Derive semantic modifiers list
  const currentMenuItem = useMemo(() => createSicPizzaMenuItem(size), [size]);

  const semanticModifiersList: SelectedSemanticModifier[] = useMemo(() => {
    const list: SelectedSemanticModifier[] = [];

    // 1. Crust
    const crustOpt = SIC_CRUST_GROUP.options.find((o) => o.id === selectedCrustId);
    if (crustOpt) {
      list.push({
        optionId: crustOpt.id,
        groupId: SIC_CRUST_GROUP.id,
        name: crustOpt.name,
        level: "NORMAL",
        placement: "WHOLE",
        priceCents: crustOpt.priceCents,
        allergenAck: crustOpt.requiresAllergenAck ? acknowledgedAllergens.has(crustOpt.id) : undefined
      });
    }

    // 2. Sauce
    const sauceOpt = SIC_SAUCE_GROUP.options.find((o) => o.id === selectedSauceId);
    if (sauceOpt) {
      list.push({
        optionId: sauceOpt.id,
        groupId: SIC_SAUCE_GROUP.id,
        name: sauceOpt.name,
        level: "NORMAL",
        placement: "WHOLE",
        priceCents: sauceOpt.priceCents
      });
    }

    // 3. Cheese
    const cheeseOpt = SIC_CHEESE_GROUP.options.find((o) => o.id === selectedCheeseId);
    if (cheeseOpt) {
      list.push({
        optionId: cheeseOpt.id,
        groupId: SIC_CHEESE_GROUP.id,
        name: cheeseOpt.name,
        level: cheeseLevel,
        placement: "WHOLE",
        priceCents: calculateSemanticModifierPrice(cheeseOpt, cheeseLevel, "WHOLE")
      });
    }

    // 4. Toppings
    selectedToppings.forEach((spec, optId) => {
      const topOpt = SIC_TOPPINGS_GROUP.options.find((o) => o.id === optId);
      if (topOpt) {
        list.push({
          optionId: topOpt.id,
          groupId: SIC_TOPPINGS_GROUP.id,
          name: topOpt.name,
          level: spec.level,
          placement: spec.placement,
          priceCents: calculateSemanticModifierPrice(topOpt, spec.level, spec.placement),
          allergenAck: topOpt.requiresAllergenAck ? acknowledgedAllergens.has(topOpt.id) : undefined
        });
      }
    });

    // 5. Sides
    selectedSideIds.forEach((sideId) => {
      const sideOpt = SIC_SIDES_GROUP.options.find((o) => o.id === sideId);
      if (sideOpt) {
        list.push({
          optionId: sideOpt.id,
          groupId: SIC_SIDES_GROUP.id,
          name: sideOpt.name,
          level: "NORMAL",
          placement: "WHOLE",
          priceCents: sideOpt.priceCents
        });
      }
    });

    return list;
  }, [
    selectedCrustId,
    selectedSauceId,
    selectedCheeseId,
    cheeseLevel,
    selectedToppings,
    selectedSideIds,
    acknowledgedAllergens
  ]);

  // Run validation engine
  const validationResult = useMemo(
    () => validateModifierConfiguration(currentMenuItem, semanticModifiersList),
    [currentMenuItem, semanticModifiersList]
  );

  const totalCalculatedPizzaPriceCents =
    currentMenuItem.basePriceCents + validationResult.totalModifierPriceCents;

  if (!isOpen) return null;

  function getOwnership(): OwnershipSelection {
    if (splitMode === "whole_table") {
      return { splitMode: "whole_table", assignedDinerIds: diners.map((d) => d.id) };
    }
    if (splitMode === "shared_diners") {
      return { splitMode: "shared_diners", assignedDinerIds: selectedDinerIds };
    }
    return { splitMode: "single", assignedDinerIds: [selectedDinerIds[0] || diners[0]?.id || ""] };
  }

  function toggleDiner(dinerId: string) {
    if (splitMode === "single") {
      setSelectedDinerIds([dinerId]);
    } else {
      setSelectedDinerIds((prev) =>
        prev.includes(dinerId)
          ? prev.length > 1
            ? prev.filter((id) => id !== dinerId)
            : prev
          : [...prev, dinerId]
      );
    }
  }

  function toggleTopping(optId: string) {
    setSelectedToppings((prev) => {
      const next = new Map(prev);
      if (next.has(optId)) {
        next.delete(optId);
      } else {
        next.set(optId, { level: "NORMAL", placement: "WHOLE" });
      }
      return next;
    });
  }

  function setToppingPlacement(optId: string, placement: ModifierPlacement) {
    setSelectedToppings((prev) => {
      const next = new Map(prev);
      const cur = next.get(optId) || { level: "NORMAL", placement: "WHOLE" };
      next.set(optId, { ...cur, placement });
      return next;
    });
  }

  function setToppingLevel(optId: string, level: ModifierLevel) {
    setSelectedToppings((prev) => {
      const next = new Map(prev);
      const cur = next.get(optId) || { level: "NORMAL", placement: "WHOLE" };
      next.set(optId, { ...cur, level });
      return next;
    });
  }

  const standardDrinks = [
    { name: "Craft IPA Draft", priceCents: 800 },
    { name: "Italian Pilsner", priceCents: 750 },
    { name: "Negroni", priceCents: 1400 },
    { name: "House Red Wine (Glass)", priceCents: 1100 },
    { name: "San Pellegrino Sparkling", priceCents: 500 },
    { name: "Mexican Coke", priceCents: 450 }
  ];

  const standardStarters = [
    { name: "Garlic Knots (6pcs)", priceCents: 800 },
    { name: "Truffle Arancini", priceCents: 1200 },
    { name: "Caesar Salad", priceCents: 1100 },
    { name: "Burrata & Hot Honey", priceCents: 1500 }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-2xl border border-border bg-card sm:rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-3.5 bg-background">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" />
              Add to Live Order
            </h2>
            <p className="text-xs text-muted-foreground">
              Semantic customization & pre-split check assignment
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Ownership Allocation Bar */}
        {diners.length > 0 && (
          <div className="border-b bg-secondary/20 px-5 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                <Users className="size-3.5" />
                Item Ownership / Split
              </span>

              {/* Split Mode Selector */}
              <div className="flex gap-1 font-mono text-[10px] font-bold uppercase">
                <button
                  type="button"
                  onClick={() => {
                    setSplitMode("single");
                    if (selectedDinerIds.length > 1) setSelectedDinerIds([selectedDinerIds[0]]);
                  }}
                  className={`rounded-md px-2.5 py-1 transition ${
                    splitMode === "single"
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  Single Diner
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("shared_diners")}
                  className={`rounded-md px-2.5 py-1 transition ${
                    splitMode === "shared_diners"
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  Split Diners
                </button>
                <button
                  type="button"
                  onClick={() => setSplitMode("whole_table")}
                  className={`rounded-md px-2.5 py-1 transition ${
                    splitMode === "whole_table"
                      ? "bg-primary text-primary-foreground font-bold"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  Whole Table
                </button>
              </div>
            </div>

            {/* Diners list */}
            {splitMode !== "whole_table" ? (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {diners.map((d) => {
                  const isSelected = selectedDinerIds.includes(d.id);
                  return (
                    <button
                      key={d.id}
                      type="button"
                      onClick={() => toggleDiner(d.id)}
                      className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground hover:bg-muted"
                      }`}
                    >
                      {d.displayName} {d.seatNumber ? `(Seat ${d.seatNumber})` : ""}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-primary font-medium">
                Allocated equally across all {diners.length} guests.
              </p>
            )}
          </div>
        )}

        {/* Category Tabs */}
        <div className="grid grid-cols-3 border-b bg-secondary/30 p-1 text-center font-mono text-xs font-bold uppercase">
          {(["pizza", "drinks", "starters"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md py-1.5 transition ${
                tab === t ? "bg-background text-foreground font-bold" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {tab === "pizza" && (
            <div className="space-y-5">
              {/* Validation Errors & Warnings Alert Box */}
              {!validationResult.isValid && (
                <div className="rounded-xl border border-rose-500/50 bg-rose-500/10 p-3.5 space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-500 uppercase tracking-wide">
                    <AlertTriangle className="size-4" />
                    Invalid Configuration
                  </div>
                  <ul className="space-y-1 text-xs text-rose-300 list-disc list-inside">
                    {validationResult.errors.map((err, i) => (
                      <li key={i}>{err}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 1. Size */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  1. Size & Base Crust
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["small", "large"] as const).map((s: PizzaSize) => (
                    <Button
                      key={s}
                      type="button"
                      variant={size === s ? "default" : "secondary"}
                      onClick={() => setSize(s)}
                      className="justify-between"
                    >
                      <span className="capitalize">{s === "small" ? '12" Small' : '16" Large'}</span>
                      <span className="font-mono text-xs">{money(PRICES[s])}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* 2. Crust Style */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  2. Crust Style
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SIC_CRUST_GROUP.options.map((crust) => {
                    const isSelected = selectedCrustId === crust.id;
                    const isRestricted = crust.allowedSizes && !crust.allowedSizes.includes(size);

                    return (
                      <Button
                        key={crust.id}
                        type="button"
                        variant={isSelected ? "default" : "secondary"}
                        onClick={() => {
                          setSelectedCrustId(crust.id);
                          if (crust.requiresAllergenAck) {
                            setAcknowledgedAllergens((prev) => new Set([...prev, crust.id]));
                          }
                        }}
                        className={`justify-between text-left h-auto py-2 ${
                          isRestricted ? "opacity-40" : ""
                        }`}
                      >
                        <div>
                          <div className="text-xs font-semibold">{crust.name}</div>
                          {isRestricted && (
                            <span className="text-[10px] text-amber-500 block">
                              Only for {crust.allowedSizes?.join(", ")}
                            </span>
                          )}
                        </div>
                        <span className="font-mono text-xs">
                          {crust.priceCents > 0 ? `+${money(crust.priceCents)}` : "Free"}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* 3. Base Sauce & Cheese */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Sauce */}
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    3. Sauce
                  </label>
                  <div className="space-y-1.5">
                    {SIC_SAUCE_GROUP.options.map((sauce) => (
                      <button
                        key={sauce.id}
                        type="button"
                        onClick={() => setSelectedSauceId(sauce.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                          selectedSauceId === sauce.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary/40 border-border text-foreground hover:bg-secondary"
                        }`}
                      >
                        <span>{sauce.name}</span>
                        {sauce.priceCents > 0 && <span>+{money(sauce.priceCents)}</span>}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Cheese */}
                <div>
                  <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    4. Cheese Blend & Level
                  </label>
                  <div className="space-y-1.5">
                    {SIC_CHEESE_GROUP.options.map((cheese) => (
                      <button
                        key={cheese.id}
                        type="button"
                        onClick={() => setSelectedCheeseId(cheese.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-semibold transition ${
                          selectedCheeseId === cheese.id
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary/40 border-border text-foreground hover:bg-secondary"
                        }`}
                      >
                        <span>{cheese.name}</span>
                        {cheese.priceCents > 0 && <span>+{money(cheese.priceCents)}</span>}
                      </button>
                    ))}

                    {/* Cheese Level Selector */}
                    {selectedCheeseId === "cheese_mozzarella" && (
                      <div className="pt-2 flex items-center justify-between gap-1">
                        {(["LIGHT", "NORMAL", "EXTRA"] as ModifierLevel[]).map((lvl) => (
                          <button
                            key={lvl}
                            type="button"
                            onClick={() => setCheeseLevel(lvl)}
                            className={`flex-1 py-1 rounded text-[10px] font-bold uppercase transition ${
                              cheeseLevel === lvl
                                ? "bg-amber-500 text-black"
                                : "bg-secondary text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {lvl === "EXTRA" ? "+Extra ($2.25)" : lvl}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 5. Toppings with Placement & Intensity */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    5. Toppings & Half-Portions
                  </label>
                  <span className="text-[11px] text-muted-foreground">
                    Whole (+{money(PRICES.topping)}) / Half (+{money(Math.round(PRICES.topping * 0.5))})
                  </span>
                </div>

                <div className="space-y-2">
                  {SIC_TOPPINGS_GROUP.options.map((topping) => {
                    const isSelected = selectedToppings.has(topping.id);
                    const spec = selectedToppings.get(topping.id);
                    const isUnavailable = !topping.isAvailable;

                    return (
                      <div
                        key={topping.id}
                        className={`rounded-xl border p-2.5 transition ${
                          isUnavailable
                            ? "bg-muted/40 border-dashed border-border opacity-50"
                            : isSelected
                            ? "border-primary/50 bg-primary/5"
                            : "border-border bg-card"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <button
                            type="button"
                            disabled={isUnavailable}
                            onClick={() => toggleTopping(topping.id)}
                            className="flex items-center gap-2 text-xs font-semibold text-foreground text-left"
                          >
                            <span
                              className={`size-4 rounded border flex items-center justify-center ${
                                isSelected ? "bg-primary border-primary text-primary-foreground" : "border-border"
                              }`}
                            >
                              {isSelected && <CheckCircle2 className="size-3" />}
                            </span>
                            <span>{topping.name}</span>
                            {topping.requiresAllergenAck && (
                              <Badge className="text-[9px] px-1 py-0 border-amber-500/50 bg-amber-500/10 text-amber-400">
                                Allergen Ack
                              </Badge>
                            )}
                            {isUnavailable && (
                              <Badge className="text-[9px] px-1 py-0 bg-rose-500/20 text-rose-400">
                                86&apos;d (Out of Stock)
                              </Badge>
                            )}
                          </button>

                          <span className="font-mono text-xs text-muted-foreground">
                            {isSelected && spec
                              ? money(calculateSemanticModifierPrice(topping, spec.level, spec.placement))
                              : money(topping.priceCents)}
                          </span>
                        </div>

                        {/* Portion Placement & Level Controls */}
                        {isSelected && spec && (
                          <div className="mt-2.5 pt-2 border-t flex flex-wrap items-center justify-between gap-2 text-[11px]">
                            {/* Placement Controls */}
                            <div className="flex items-center gap-1">
                              <PieChart className="size-3 text-muted-foreground" />
                              <button
                                type="button"
                                onClick={() => setToppingPlacement(topping.id, "WHOLE")}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  spec.placement === "WHOLE"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                Whole
                              </button>
                              <button
                                type="button"
                                onClick={() => setToppingPlacement(topping.id, "LEFT")}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  spec.placement === "LEFT"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                Left 1/2
                              </button>
                              <button
                                type="button"
                                onClick={() => setToppingPlacement(topping.id, "RIGHT")}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  spec.placement === "RIGHT"
                                    ? "bg-primary text-primary-foreground"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                Right 1/2
                              </button>
                            </div>

                            {/* Level Controls */}
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => setToppingLevel(topping.id, "LIGHT")}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  spec.level === "LIGHT"
                                    ? "bg-amber-500 text-black"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                Light
                              </button>
                              <button
                                type="button"
                                onClick={() => setToppingLevel(topping.id, "NORMAL")}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  spec.level === "NORMAL"
                                    ? "bg-foreground text-background"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                Normal
                              </button>
                              <button
                                type="button"
                                onClick={() => setToppingLevel(topping.id, "EXTRA")}
                                className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  spec.level === "EXTRA"
                                    ? "bg-amber-500 text-black"
                                    : "bg-secondary text-muted-foreground"
                                }`}
                              >
                                Extra (+${((topping.extraPriceCents || 125) / 100).toFixed(2)})
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 6. Dipping Sauces & Finishes */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  6. Dipping Sauces & Finishes
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SIC_SIDES_GROUP.options.map((side) => {
                    const isSelected = selectedSideIds.has(side.id);
                    return (
                      <Button
                        key={side.id}
                        type="button"
                        variant={isSelected ? "default" : "secondary"}
                        onClick={() => {
                          setSelectedSideIds((prev) => {
                            const next = new Set(prev);
                            if (next.has(side.id)) next.delete(side.id);
                            else next.add(side.id);
                            return next;
                          });
                        }}
                        className="justify-between text-xs"
                      >
                        <span>{side.name}</span>
                        <span className="font-mono text-xs">+{money(side.priceCents)}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Order Item Summary Pill */}
              <div className="rounded-xl bg-secondary/40 border p-3 space-y-1 text-xs">
                <div className="font-bold text-foreground flex items-center justify-between">
                  <span>Structured Kitchen Intent:</span>
                  <span className="font-mono text-primary font-bold">
                    {money(totalCalculatedPizzaPriceCents)}
                  </span>
                </div>
                <div className="text-muted-foreground text-[11px] leading-relaxed">
                  {semanticModifiersList
                    .map((m) =>
                      formatSemanticModifier({
                        name: m.name,
                        level: m.level,
                        placement: m.placement
                      })
                    )
                    .join(" · ")}
                </div>
              </div>

              {/* Submit Button */}
              <Button
                type="button"
                size="lg"
                disabled={!validationResult.isValid}
                className="w-full"
                onClick={() => {
                  if (!validationResult.isValid) return;

                  // Backward compatibility pizza object
                  const legacyPizza: PizzaSelection = {
                    size,
                    toppings: Array.from(selectedToppings.keys()).map((id) => {
                      const opt = SIC_TOPPINGS_GROUP.options.find((o) => o.id === id);
                      return opt?.name.toLowerCase() || id;
                    }),
                    extraCheese: cheeseLevel === "EXTRA"
                  };

                  const mappedOrderModifiers: SelectedModifier[] = semanticModifiersList.map((m) => ({
                    modifierOptionId: m.optionId,
                    groupId: m.groupId,
                    name: m.name,
                    level: m.level,
                    placement: m.placement,
                    priceCents: m.priceCents,
                    allergenAck: m.allergenAck
                  }));

                  onAddPizza(legacyPizza, getOwnership(), "mains", mappedOrderModifiers);
                  onClose();
                }}
              >
                <Plus className="size-4 mr-1" />
                Add Pizza · {money(totalCalculatedPizzaPriceCents)}
              </Button>
            </div>
          )}

          {tab === "drinks" && (
            <div className="space-y-2">
              {standardDrinks.map((drink) => (
                <div
                  key={drink.name}
                  className="flex items-center justify-between rounded-xl border bg-card p-3"
                >
                  <div>
                    <strong className="block text-sm text-foreground">{drink.name}</strong>
                    <span className="font-mono text-xs text-muted-foreground">
                      {money(drink.priceCents)}
                    </span>
                  </div>
                  <Button
                    size="default"
                    variant="secondary"
                    onClick={() => {
                      onAddDrink(drink.name, drink.priceCents, getOwnership());
                      onClose();
                    }}
                  >
                    <Plus className="size-4" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}

          {tab === "starters" && (
            <div className="space-y-2">
              {standardStarters.map((starter) => (
                <div
                  key={starter.name}
                  className="flex items-center justify-between rounded-xl border bg-card p-3"
                >
                  <div>
                    <strong className="block text-sm text-foreground">{starter.name}</strong>
                    <span className="font-mono text-xs text-muted-foreground">
                      {money(starter.priceCents)}
                    </span>
                  </div>
                  <Button
                    size="default"
                    variant="secondary"
                    onClick={() => {
                      onAddStarter(starter.name, starter.priceCents, getOwnership());
                      onClose();
                    }}
                  >
                    <Plus className="size-4" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
