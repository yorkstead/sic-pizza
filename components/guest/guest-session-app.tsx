"use client";

import React, { useState } from "react";
import {
  Pizza,
  Utensils,
  CreditCard,
  Bell,
  CheckCircle2,
  Clock,
  Plus,
  Flame,
  Receipt,
  Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { money } from "@/lib/utils";
import { AddItemDialog } from "@/components/server/add-item-dialog";
import { StageBadge } from "@/components/server/stage-badge";
import type { TableSession, TableSessionProjection, Diner } from "@/lib/domain/models/session";
import type { RequestCategory } from "@/lib/domain/models/request";
import type { SplitMode, SelectedModifier } from "@/lib/domain/models/order";
import type { Course } from "@/lib/domain/models/menu";

interface GuestMenuItem {
  id: string;
  name: string;
  priceCents: number;
  description: string;
  course: "drinks" | "starters" | "mains" | "desserts";
  stationId: string;
}

const GUEST_MENU_ITEMS: GuestMenuItem[] = [
  {
    id: "pizza_margherita",
    name: "Classic Margherita Pizza",
    priceCents: 1900,
    description: "San Marzano tomatoes, fresh mozzarella, sweet basil, EVOO",
    course: "mains",
    stationId: "pizza"
  },
  {
    id: "pizza_pep",
    name: "Hot Honey Pepperoni Pizza",
    priceCents: 2400,
    description: "Crispy cup & char pepperoni, mozzarella, Mike's hot honey drizzle",
    course: "mains",
    stationId: "pizza"
  },
  {
    id: "pizza_bianca",
    name: "Truffle Mushroom Bianca Pizza",
    priceCents: 2600,
    description: "Roasted cremini mushrooms, truffle cream, fresh thyme, fontina",
    course: "mains",
    stationId: "pizza"
  },
  {
    id: "starter_knots",
    name: "Garlic Parmesan Knots (6pc)",
    priceCents: 800,
    description: "Warm twisted dough, garlic butter, fresh parsley, warm marinara",
    course: "starters",
    stationId: "pizza"
  },
  {
    id: "starter_caesar",
    name: "Caesar Salad",
    priceCents: 1100,
    description: "Crisp romaine, shaved parmigiano reggiano, garlic croutons",
    course: "starters",
    stationId: "salad"
  },
  {
    id: "drink_negroni",
    name: "Classic Negroni",
    priceCents: 1400,
    description: "Campari, gin, sweet vermouth, orange peel",
    course: "drinks",
    stationId: "bar"
  },
  {
    id: "dessert_tiramisu",
    name: "House Tiramisu",
    priceCents: 900,
    description: "Espresso-soaked ladyfingers, whipped mascarpone, cocoa dusting",
    course: "desserts",
    stationId: "dessert"
  }
];

interface GuestSessionAppProps {
  initialSession: TableSession;
  initialProjection: TableSessionProjection;
  onProposeItem: (itemData: {
    menuItemId: string;
    name: string;
    course: Course;
    stationId?: string;
    basePriceCents: number;
    quantity: number;
    selectedModifiers: SelectedModifier[];
    specialInstructions?: string;
    dinerId: string;
    splitMode: SplitMode;
    assignedDinerIds: string[];
  }) => Promise<void>;
  onCreateRequest: (category: RequestCategory, description?: string, dinerId?: string) => Promise<void>;
  onProcessDinerPayment: (dinerId: string, tipPercent: number) => Promise<void>;
}

export function GuestSessionApp({
  initialSession,
  initialProjection,
  onProposeItem,
  onCreateRequest,
  onProcessDinerPayment
}: GuestSessionAppProps) {
  const session = initialSession;
  const projection = initialProjection;
  const [activeTab, setActiveTab] = useState<"order" | "menu" | "bill" | "assist">("order");
  const [selectedDinerId, setSelectedDinerId] = useState<string>(
    initialSession.diners[0]?.id || ""
  );
  const [selectedTipPercent, setSelectedTipPercent] = useState<number>(20);
  const [isCustomizeOpen, setIsCustomizeOpen] = useState<boolean>(false);
  const [recentNotification, setRecentNotification] = useState<string | null>(null);
  const [isPaid, setIsPaid] = useState<boolean>(false);

  const currentDiner: Diner | undefined = session.diners.find((d) => d.id === selectedDinerId);
  const activeItems = session.items.filter((i) => i.status !== "voided");
  const proposedItems = activeItems.filter((i) => i.status === "proposed");
  const confirmedItems = activeItems.filter((i) => i.status !== "proposed");

  // Calculate personal running share
  const personalBill = projection.dinerBills.find((b) => b.dinerId === selectedDinerId);
  const personalSubtotal = personalBill?.subtotalCents || 0;
  const personalTax = personalBill?.taxCents || 0;
  const personalTip = Math.round((personalSubtotal * selectedTipPercent) / 100);
  const personalTotal = personalSubtotal + personalTax + personalTip;
  const isPersonalPaid = (personalBill?.paidCents || 0) >= (personalSubtotal + personalTax) && personalSubtotal > 0;

  function showToast(msg: string) {
    setRecentNotification(msg);
    setTimeout(() => setRecentNotification(null), 4500);
  }

  const handleProposeStandardItem = async (item: GuestMenuItem) => {
    if (!selectedDinerId) return;
    await onProposeItem({
      menuItemId: item.id,
      name: item.name,
      course: item.course,
      stationId: item.stationId,
      basePriceCents: item.priceCents,
      quantity: 1,
      selectedModifiers: [],
      dinerId: selectedDinerId,
      splitMode: "single",
      assignedDinerIds: [selectedDinerId]
    });
    showToast(`Proposed ${item.name} to server Jordan`);
    setActiveTab("order");
  };

  const handleQuickRequest = async (category: RequestCategory, label: string) => {
    await onCreateRequest(category, `${label} requested by ${currentDiner?.displayName || "Guest"}`, selectedDinerId);
    showToast(`${label} request sent to staff queue`);
  };

  return (
    <main className="mx-auto min-h-screen max-w-lg p-3 sm:p-4 pb-24 space-y-4">
      {/* Header Bar */}
      <header className="flex items-center justify-between rounded-2xl border bg-card p-3.5 shadow-sm">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 rotate-[-4deg] place-items-center rounded-xl bg-primary font-black text-xs text-primary-foreground shadow-xs">
            <Pizza className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <strong className="text-base font-black text-foreground">{session.tableLabel}</strong>
              <StageBadge stage={projection.stage} />
            </div>
            <p className="font-mono text-[10px] text-muted-foreground">
              Server: {session.assignedServerId ? "Jordan" : "Staff"} · {projection.elapsedMinutes}m
            </p>
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1.5">
          <ThemeToggle variant="compact" size="sm" />
          <select
            value={selectedDinerId}
            onChange={(e) => setSelectedDinerId(e.target.value)}
            aria-label="Select active diner"
            className="h-8 rounded-lg border bg-secondary/60 px-2 text-xs font-bold text-foreground focus:outline-hidden"
          >
            {session.diners.map((d) => (
              <option key={d.id} value={d.id}>
                {d.displayName} (Seat {d.seatNumber || 1})
              </option>
            ))}
          </select>
        </div>
      </header>

      {/* Floating Notification Banner */}
      {recentNotification && (
        <div className="rounded-xl border border-primary/40 bg-primary/10 p-3 text-xs font-bold text-primary flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="size-4 shrink-0" />
          <span>{recentNotification}</span>
        </div>
      )}

      {/* ---------------------------------------------------------------------------------
          TAB 1: LIVE TABLE ORDER
         --------------------------------------------------------------------------------- */}
      {activeTab === "order" && (
        <div className="space-y-4">
          {/* Incoming Proposals Section */}
          {proposedItems.length > 0 && (
            <Card className="border-amber-500/50 bg-amber-500/5">
              <CardHeader className="p-3.5 pb-2">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-amber-500 flex items-center gap-1">
                    <Clock className="size-3" />
                    Pending Server Review ({proposedItems.length})
                  </span>
                  <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[9px] font-mono">
                    Awaiting Jordan
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-3.5 pt-0 divide-y divide-border/60">
                {proposedItems.map((item) => (
                  <div key={item.id} className="py-2 first:pt-0 last:pb-0 flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-foreground">{item.quantity}x {item.name}</strong>
                      <p className="text-[11px] text-muted-foreground">
                        Proposed by {session.diners.find((d) => d.id === item.proposedByDinerId)?.displayName || "Guest"} · {money(item.basePriceCents)}
                      </p>
                    </div>
                    <Badge className="text-[9px] bg-secondary">Reviewing</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Active Ordered Items */}
          <div className="rounded-2xl border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground flex items-center gap-1.5">
                <Utensils className="size-4 text-primary" />
                Live Table Items ({confirmedItems.length})
              </h2>
              <span className="text-xs font-mono font-bold text-muted-foreground">
                Table Total: {money(projection.totalCents)}
              </span>
            </div>

            {confirmedItems.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground space-y-1">
                <p>No confirmed items on the table order yet.</p>
                <p className="text-[11px]">Browse the menu to propose your favorites to the server.</p>
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {confirmedItems.map((item) => {
                  const isMine = item.dinerId === selectedDinerId || (item.assignedDinerIds && item.assignedDinerIds.includes(selectedDinerId));
                  return (
                    <div key={item.id} className="py-2.5 first:pt-0 last:pb-0 flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <strong className="text-xs text-foreground">{item.quantity}x {item.name}</strong>
                          {isMine && (
                            <Badge className="text-[9px] px-1 py-0 bg-primary/20 text-primary border-primary/30">
                              My Share
                            </Badge>
                          )}
                        </div>
                        {item.selectedModifiers.length > 0 && (
                          <p className="text-[11px] text-amber-400">
                            {item.selectedModifiers.map((m) => m.name).join(", ")}
                          </p>
                        )}
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {item.splitMode === "whole_table" ? "Split Whole Table" : `Seat ${item.seatNumber || 1}`} · {money(item.basePriceCents)}
                        </p>
                      </div>

                      <Badge
                        className={`text-[10px] uppercase font-mono shrink-0 ${
                          item.status === "delivered"
                            ? "bg-secondary text-muted-foreground"
                            : item.status === "ready"
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                            : item.status === "preparing" || item.status === "fired"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                            : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {item.status}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action to add more items */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              size="lg"
              className="w-full font-bold text-xs"
              onClick={() => setActiveTab("menu")}
            >
              <Plus className="size-4 mr-1.5" />
              Browse Menu
            </Button>
            <Button
              size="lg"
              variant="secondary"
              className="w-full font-bold text-xs"
              onClick={() => setIsCustomizeOpen(true)}
            >
              <Pizza className="size-4 mr-1.5" />
              Build Custom Pizza
            </Button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------------------
          TAB 2: MENU & CUSTOMIZATION
         --------------------------------------------------------------------------------- */}
      {activeTab === "menu" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-3 flex items-center justify-between">
            <div>
              <h2 className="text-xs font-bold text-foreground">SIC Pizza Menu & Drink List</h2>
              <p className="text-[10px] text-muted-foreground">
                Items proposed will appear on server Jordan&apos;s screen for tableside verification.
              </p>
            </div>
          </div>

          <div className="space-y-3">
            {GUEST_MENU_ITEMS.map((item) => (
              <Card key={item.id} className="overflow-hidden">
                <CardHeader className="p-3.5 pb-2">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-2.5">
                      <Pizza className="size-5 text-primary shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-bold text-foreground text-sm">{item.name}</h3>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-4">
                          {item.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-3.5 pt-1 flex items-center justify-between">
                  <span className="font-mono text-xs font-bold text-foreground">
                    {money(item.priceCents)}
                  </span>

                  <Button
                    size="default"
                    variant="secondary"
                    className="text-xs font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => handleProposeStandardItem(item)}
                  >
                    <Plus className="size-3.5 mr-1" />
                    Propose to Table
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------------------
          TAB 3: MY SHARE & PAY
         --------------------------------------------------------------------------------- */}
      {activeTab === "bill" && (
        <div className="space-y-4">
          <div className="rounded-2xl border bg-card p-4 space-y-4">
            <div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-primary">
                Individual Pre-Split Check
              </span>
              <h2 className="text-xl font-black text-foreground">
                {currentDiner?.displayName}&apos;s Share
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Automatically split by item ownership without dividing manually at the end.
              </p>
            </div>

            <div className="space-y-2 border-y border-border/60 py-3 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Individual Subtotal</span>
                <span className="font-mono font-bold">{money(personalSubtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Allocated Tax (8.875%)</span>
                <span className="font-mono font-bold">{money(personalTax)}</span>
              </div>

              {/* Tip Selection */}
              <div className="pt-2 space-y-1.5">
                <span className="text-xs font-bold text-muted-foreground block">Select Gratuity:</span>
                <div className="grid grid-cols-4 gap-1.5 text-xs font-mono font-bold">
                  {[18, 20, 22, 25].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => setSelectedTipPercent(pct)}
                      className={`py-1.5 rounded-lg border transition ${
                        selectedTipPercent === pct
                          ? "bg-primary text-primary-foreground border-primary shadow-xs"
                          : "bg-secondary/60 text-secondary-foreground"
                      }`}
                    >
                      {pct}%
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between pt-1">
                <span className="text-muted-foreground">Tip Amount ({selectedTipPercent}%)</span>
                <span className="font-mono font-bold">{money(personalTip)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between text-base font-black text-foreground">
              <span>Total to Settle:</span>
              <span className="font-mono text-xl text-primary">{money(personalTotal)}</span>
            </div>

            {isPersonalPaid || isPaid ? (
              <div className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs font-bold text-emerald-400">
                <CheckCircle2 className="size-4" />
                Your portion has been paid! Thank you.
              </div>
            ) : personalTotal === 0 ? (
              <p className="text-center text-xs text-muted-foreground py-2">
                No unpaid items currently allocated to your seat.
              </p>
            ) : (
              <Button
                size="lg"
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm h-12"
                onClick={async () => {
                  if (selectedDinerId) {
                    await onProcessDinerPayment(selectedDinerId, selectedTipPercent);
                    setIsPaid(true);
                    showToast("Payment processed successfully! Receipt sent.");
                  }
                }}
              >
                <CreditCard className="size-4 mr-2" />
                Pay My Share ({money(personalTotal)})
              </Button>
            )}
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------------------
          TAB 4: CALL STAFF & REQUESTS
         --------------------------------------------------------------------------------- */}
      {activeTab === "assist" && (
        <div className="space-y-4">
          <div className="rounded-xl border bg-card p-3">
            <h2 className="text-xs font-bold text-foreground">Universal Service Queue</h2>
            <p className="text-[10px] text-muted-foreground">
              Tap any button to dispatch an instant request directly to your assigned server or runner.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Button
              size="lg"
              variant="secondary"
              className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-bold hover:bg-primary hover:text-primary-foreground"
              onClick={() => handleQuickRequest("SERVER_NEEDED", "Server Assistance")}
            >
              <Bell className="size-5 text-primary" />
              <span>Call Server</span>
            </Button>

            <Button
              size="lg"
              variant="secondary"
              className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-bold hover:bg-primary hover:text-primary-foreground"
              onClick={() => handleQuickRequest("REFILL", "Water & Drink Refill")}
            >
              <Sparkles className="size-5 text-cyan-400" />
              <span>Water Refill</span>
            </Button>

            <Button
              size="lg"
              variant="secondary"
              className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-bold hover:bg-primary hover:text-primary-foreground"
              onClick={() => handleQuickRequest("CONDIMENT", "Extra Sauce / Condiments")}
            >
              <Flame className="size-5 text-amber-400" />
              <span>Hot Honey / Sauce</span>
            </Button>

            <Button
              size="lg"
              variant="secondary"
              className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-bold hover:bg-primary hover:text-primary-foreground"
              onClick={() => handleQuickRequest("TO_GO_BOX", "To-Go Pizza Boxes")}
            >
              <Pizza className="size-5 text-purple-400" />
              <span>To-Go Boxes</span>
            </Button>

            <Button
              size="lg"
              variant="secondary"
              className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-bold hover:bg-primary hover:text-primary-foreground"
              onClick={() => handleQuickRequest("UTENSILS", "Extra Napkins / Utensils")}
            >
              <Utensils className="size-5 text-emerald-400" />
              <span>Napkins & Utensils</span>
            </Button>

            <Button
              size="lg"
              variant="secondary"
              className="h-20 flex flex-col items-center justify-center gap-1.5 rounded-xl border text-xs font-bold hover:bg-primary hover:text-primary-foreground"
              onClick={() => handleQuickRequest("CHECK", "Check / Bill Request")}
            >
              <Receipt className="size-5 text-rose-400" />
              <span>Request Check</span>
            </Button>
          </div>
        </div>
      )}

      {/* Semantic Modifier Customization Dialog */}
      <AddItemDialog
        isOpen={isCustomizeOpen}
        onClose={() => setIsCustomizeOpen(false)}
        diners={session.diners}
        onAddPizza={(pizza, ownership, course, semanticModifiers) => {
          onProposeItem({
            menuItemId: `pizza_${pizza.size}`,
            name: `${pizza.size === "large" ? "Large" : "Small"} Custom Pizza`,
            course: course || "mains",
            stationId: "pizza",
            basePriceCents: pizza.size === "large" ? 1900 : 1400,
            quantity: 1,
            selectedModifiers: semanticModifiers || [],
            dinerId: selectedDinerId,
            splitMode: ownership.splitMode,
            assignedDinerIds: ownership.assignedDinerIds
          });
          setIsCustomizeOpen(false);
          showToast("Custom pizza proposed to server Jordan");
          setActiveTab("order");
        }}
        onAddDrink={(name, priceCents, ownership) => {
          onProposeItem({
            menuItemId: "drink_custom",
            name,
            course: "drinks",
            stationId: "bar",
            basePriceCents: priceCents,
            quantity: 1,
            selectedModifiers: [],
            dinerId: selectedDinerId,
            splitMode: ownership.splitMode,
            assignedDinerIds: ownership.assignedDinerIds
          });
          setIsCustomizeOpen(false);
          showToast(`${name} proposed to server Jordan`);
          setActiveTab("order");
        }}
        onAddStarter={(name, priceCents, ownership) => {
          onProposeItem({
            menuItemId: "starter_custom",
            name,
            course: "starters",
            stationId: "salad",
            basePriceCents: priceCents,
            quantity: 1,
            selectedModifiers: [],
            dinerId: selectedDinerId,
            splitMode: ownership.splitMode,
            assignedDinerIds: ownership.assignedDinerIds
          });
          setIsCustomizeOpen(false);
          showToast(`${name} proposed to server Jordan`);
          setActiveTab("order");
        }}
      />

      {/* Sticky Bottom Guest Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur-md">
        <div className="mx-auto grid max-w-lg grid-cols-4 p-1.5 text-[10px] font-mono font-bold uppercase">
          <button
            type="button"
            onClick={() => setActiveTab("order")}
            className={`flex flex-col items-center justify-center py-2 rounded-xl transition ${
              activeTab === "order" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Utensils className="size-4 mb-0.5" />
            <span>Table</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("menu")}
            className={`flex flex-col items-center justify-center py-2 rounded-xl transition ${
              activeTab === "menu" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Pizza className="size-4 mb-0.5" />
            <span>Menu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("bill")}
            className={`flex flex-col items-center justify-center py-2 rounded-xl transition ${
              activeTab === "bill" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <CreditCard className="size-4 mb-0.5" />
            <span>My Share</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("assist")}
            className={`flex flex-col items-center justify-center py-2 rounded-xl transition ${
              activeTab === "assist" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            <Bell className="size-4 mb-0.5" />
            <span>Staff</span>
          </button>
        </div>
      </nav>
    </main>
  );
}
