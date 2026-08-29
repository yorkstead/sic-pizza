import React, { useState } from "react";
import { Check, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/lib/utils";
import { TOPPINGS, PRICES, pricePizza, type PizzaSelection, type PizzaSize } from "@/lib/demo/sic-pizza/catalog";
import type { Diner } from "@/lib/domain/models/session";
import type { Course } from "@/lib/domain/models/menu";

interface AddItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  diners: readonly Diner[];
  onAddPizza: (pizza: PizzaSelection, dinerId?: string, course?: Course) => void;
  onAddDrink: (name: string, priceCents: number, dinerId?: string) => void;
  onAddStarter: (name: string, priceCents: number, dinerId?: string) => void;
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
  const [selectedDinerId, setSelectedDinerId] = useState<string>(diners[0]?.id || "");
  const [pizza, setPizza] = useState<PizzaSelection>({
    size: "large",
    toppings: ["pepperoni"],
    extraCheese: false
  });

  if (!isOpen) return null;

  const currentPizzaPrice = pricePizza(pizza);

  function toggleTopping(topping: string) {
    setPizza((prev) => ({
      ...prev,
      toppings: prev.toppings.includes(topping)
        ? prev.toppings.filter((t) => t !== topping)
        : [...prev.toppings, topping]
    }));
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
      <div className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-card shadow-2xl sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-foreground">Add to Order</h2>
            <p className="text-xs text-muted-foreground">Select item and assign to diner</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Diner Selector */}
        {diners.length > 0 && (
          <div className="border-b bg-background/50 px-5 py-2.5">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Assign to Diner
            </span>
            <div className="flex flex-wrap gap-1.5">
              {diners.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setSelectedDinerId(d.id)}
                  className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                    selectedDinerId === d.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground hover:bg-muted"
                  }`}
                >
                  {d.displayName} {d.seatNumber ? `(Seat ${d.seatNumber})` : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-3 border-b bg-secondary/30 p-1 text-center font-mono text-xs font-bold uppercase">
          {(["pizza", "drinks", "starters"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-md py-2 transition ${
                tab === t ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {tab === "pizza" && (
            <div className="space-y-5">
              {/* Size */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Size
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(["small", "large"] as const).map((size: PizzaSize) => (
                    <Button
                      key={size}
                      type="button"
                      variant={pizza.size === size ? "default" : "secondary"}
                      onClick={() => setPizza({ ...pizza, size })}
                      className="justify-between"
                    >
                      <span className="capitalize">{size}</span>
                      <span className="font-mono text-xs">{money(PRICES[size])}</span>
                    </Button>
                  ))}
                </div>
              </div>

              {/* Toppings */}
              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Toppings (+{money(PRICES.topping)} each)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {TOPPINGS.map((topping) => {
                    const isSelected = pizza.toppings.includes(topping);
                    return (
                      <Button
                        key={topping}
                        type="button"
                        variant={isSelected ? "default" : "secondary"}
                        onClick={() => toggleTopping(topping)}
                        className="justify-between capitalize"
                      >
                        <span>{topping}</span>
                        {isSelected && <Check className="size-4" />}
                      </Button>
                    );
                  })}
                </div>
              </div>

              {/* Extra Cheese */}
              <Button
                type="button"
                variant={pizza.extraCheese ? "default" : "secondary"}
                onClick={() => setPizza({ ...pizza, extraCheese: !pizza.extraCheese })}
                className="w-full justify-between"
              >
                <span>Extra Cheese</span>
                <span className="font-mono text-xs">+{money(PRICES.extraCheese)}</span>
              </Button>

              <Button
                type="button"
                size="lg"
                className="w-full"
                onClick={() => {
                  onAddPizza(pizza, selectedDinerId, "mains");
                  onClose();
                }}
              >
                <Plus className="size-4 mr-1" />
                Add Pizza · {money(currentPizzaPrice)}
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
                      onAddDrink(drink.name, drink.priceCents, selectedDinerId);
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
                      onAddStarter(starter.name, starter.priceCents, selectedDinerId);
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
