"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ChefHat,
  History,
  LogOut,
  QrCode,
  Store,
  Lock
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  projectTableSession,
  type TableSession,
  type DomainEvent
} from "@/lib/domain";
import { FloorView } from "./server/floor-view";
import { TableSessionView } from "./server/table-session-view";

const RESTAURANT_ID = "sic_pizza_org";
const LOCATION_ID = "loc_downtown";
const SERVER_ID = "emp_jordan";
const SERVER_NAME = "Jordan · Server";

interface TableMeta {
  tableId: string;
  tableLabel: string;
  diningAreaName: string;
  seats: number;
}

const STATIC_TABLES: TableMeta[] = [
  { tableId: "tbl_11", tableLabel: "Table 11", diningAreaName: "Main Dining", seats: 4 },
  { tableId: "tbl_12", tableLabel: "Table 12", diningAreaName: "Main Dining", seats: 2 },
  { tableId: "tbl_14", tableLabel: "Table 14", diningAreaName: "Patio", seats: 6 },
  { tableId: "tbl_20", tableLabel: "Table 20", diningAreaName: "Main Dining", seats: 4 },
  { tableId: "tbl_21", tableLabel: "Table 21", diningAreaName: "Patio", seats: 2 },
  { tableId: "tbl_22", tableLabel: "Table 22", diningAreaName: "Main Dining", seats: 8 },
  { tableId: "tbl_bar1", tableLabel: "Bar 01", diningAreaName: "Bar Area", seats: 2 },
  { tableId: "tbl_bar2", tableLabel: "Bar 02", diningAreaName: "Bar Area", seats: 2 }
];

export function PosDemo() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<"floor" | "kds" | "join" | "history">("floor");
  const [selectedTableId, setSelectedTableId] = useState<string | null>("tbl_11");

  // Repository & Domain Service instances
  const repo = useMemo(() => new InMemoryTableSessionRepository(), []);
  const service = useMemo(() => new TableSessionService(repo), [repo]);

  // Reactive state trigger
  const [revision, setRevision] = useState(0);
  const triggerUpdate = () => setRevision((r) => r + 1);

  // Seed default floor state
  useEffect(() => {
    async function seedInitialFloor() {
      // 1. Table 11: Active session in ENTREES stage with 1 pending water request and 1 proposed guest pizza
      const { session: s11 } = await service.openTableSession(
        {
          id: "sess_11",
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: "tbl_11",
          tableLabel: "Table 11",
          diningAreaId: "area_main",
          openedByEmployeeId: SERVER_ID,
          assignedServerId: SERVER_ID,
          initialDiners: ["Alex", "Sam"]
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Add confirmed starter
      await service.addItem(
        s11.id,
        {
          menuItemId: "app_knots",
          name: "Garlic Knots (6pcs)",
          course: "starters",
          stationId: "cold-prep",
          basePriceCents: 800,
          dinerId: s11.diners[0]?.id
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Add confirmed pizza
      await service.addItem(
        s11.id,
        {
          menuItemId: "pizza_pep",
          name: "Large Pepperoni Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1900,
          selectedModifiers: [{ modifierOptionId: "opt_pep", name: "Pepperoni", priceCents: 175 }],
          dinerId: s11.diners[0]?.id
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Fire starters & mains
      await service.fireCourse(s11.id, "starters");
      await service.fireCourse(s11.id, "mains");

      // Guest proposed item (needs server approval)
      await service.proposeItem(
        s11.id,
        {
          menuItemId: "pizza_special",
          name: "Small Pineapple Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1400,
          selectedModifiers: [{ modifierOptionId: "opt_pa", name: "Pineapple", priceCents: 175 }],
          dinerId: s11.diners[1]?.id
        },
        { actorType: "guest", actorId: "guest_sam" }
      );

      // Guest requested water
      await service.createGuestRequest(
        s11.id,
        "water_refill",
        "Sparkling water for seat 2",
        s11.diners[1]?.id,
        { actorType: "guest", actorId: "guest_sam" }
      );

      // 2. Table 12: In DRINKS stage
      const { session: s12 } = await service.openTableSession(
        {
          id: "sess_12",
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: "tbl_12",
          tableLabel: "Table 12",
          diningAreaId: "area_main",
          openedByEmployeeId: SERVER_ID,
          assignedServerId: SERVER_ID,
          initialDiners: ["Taylor"]
        },
        { actorType: "employee", actorId: SERVER_ID }
      );
      await service.addItem(
        s12.id,
        {
          menuItemId: "drink_negroni",
          name: "Negroni",
          course: "drinks",
          stationId: "bar",
          basePriceCents: 1400,
          dinerId: s12.diners[0]?.id
        },
        { actorType: "employee", actorId: SERVER_ID }
      );
      await service.fireCourse(s12.id, "drinks");

      // 3. Table 20: In CHECK_REQUESTED stage
      const { session: s20 } = await service.openTableSession(
        {
          id: "sess_20",
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: "tbl_20",
          tableLabel: "Table 20",
          diningAreaId: "area_main",
          openedByEmployeeId: SERVER_ID,
          assignedServerId: SERVER_ID,
          initialDiners: ["Chris", "Pat"]
        },
        { actorType: "employee", actorId: SERVER_ID }
      );
      await service.addItem(
        s20.id,
        {
          menuItemId: "pizza_margherita",
          name: "Large Margherita Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1900
        },
        { actorType: "employee", actorId: SERVER_ID }
      );
      await service.createCheck(s20.id, "Check #1 · Table 20");
      await service.createGuestRequest(
        s20.id,
        "drop_check",
        "Ready for check",
        s20.diners[0]?.id,
        { actorType: "guest" }
      );

      // 4. Table 21: Fully paid, ready for clear & reset
      const { session: s21 } = await service.openTableSession(
        {
          id: "sess_21",
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: "tbl_21",
          tableLabel: "Table 21",
          diningAreaId: "area_patio",
          openedByEmployeeId: SERVER_ID,
          assignedServerId: SERVER_ID,
          initialDiners: ["Morgan"]
        },
        { actorType: "employee", actorId: SERVER_ID }
      );
      await service.addItem(
        s21.id,
        {
          menuItemId: "pizza_cheese",
          name: "Small Cheese Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1400
        },
        { actorType: "employee", actorId: SERVER_ID }
      );
      const { check: chk21 } = await service.createCheck(s21.id, "Check #1");
      await service.processPayment(s21.id, chk21.id, chk21.totalCents, 300, "mock_auth_21");

      triggerUpdate();
    }

    seedInitialFloor();
  }, [service]);

  // Load active sessions and build floor state
  const [sessions, setSessions] = useState<TableSession[]>([]);
  const [allEvents, setAllEvents] = useState<DomainEvent[]>([]);

  useEffect(() => {
    async function loadData() {
      const active = await repo.listActive(LOCATION_ID);
      setSessions(active);

      const events: DomainEvent[] = [];
      for (const s of active) {
        const evts = await repo.getEvents(s.id);
        events.push(...evts);
      }
      events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      setAllEvents(events);
    }
    loadData();
  }, [repo, revision]);

  const activeSessionsByTable = useMemo(() => {
    const map = new Map<string, TableSession>();
    for (const s of sessions) {
      if (!s.closedAt) {
        map.set(s.tableId, s);
      }
    }
    return map;
  }, [sessions]);

  const floorTableItems = useMemo(() => {
    return STATIC_TABLES.map((t) => {
      const session = activeSessionsByTable.get(t.tableId);
      const projection = session ? projectTableSession(session) : undefined;
      return {
        tableId: t.tableId,
        tableLabel: t.tableLabel,
        diningAreaName: t.diningAreaName,
        seats: t.seats,
        projection,
        status: session ? ("occupied" as const) : ("available" as const)
      };
    });
  }, [activeSessionsByTable]);

  const currentSession = selectedTableId ? activeSessionsByTable.get(selectedTableId) : undefined;
  const currentProjection = currentSession ? projectTableSession(currentSession) : undefined;

  function login() {
    if (pin !== "0420") {
      setError("PIN not recognized. Seeded dev PIN is 0420.");
      return;
    }
    setAuthenticated(true);
  }

  if (!authenticated) {
    return (
      <main className="grid min-h-screen place-items-center p-4 bg-background">
        <Card className="w-full max-w-sm overflow-hidden border border-border shadow-2xl">
          <div className="h-1.5 bg-primary" />
          <CardHeader className="text-center pt-8 pb-4">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground font-black text-xl rotate-[-4deg] shadow-md">
              SIC
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">
              Server Terminal
            </h1>
            <p className="text-xs text-muted-foreground">
              Enter 4-digit dev PIN: <strong className="font-mono text-foreground">0420</strong>
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pb-8">
            <div>
              <label htmlFor="server-pin" className="sr-only">
                Employee PIN
              </label>
              <input
                id="server-pin"
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && login()}
                placeholder="••••"
                className="h-14 w-full rounded-xl border bg-background text-center font-mono text-3xl tracking-[0.5em] focus:outline-hidden focus:ring-2 focus:ring-primary"
                autoFocus
              />
              {error && <p className="mt-2 text-center text-xs font-bold text-destructive">{error}</p>}
            </div>

            <Button size="lg" className="w-full" onClick={login}>
              <Lock className="size-4 mr-1" />
              Sign In to Floor
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-7xl pb-24 lg:grid lg:grid-cols-[220px_1fr] lg:pb-0">
      {/* Desktop Sidebar */}
      <aside className="hidden border-r p-5 lg:flex lg:flex-col bg-card/40">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 rotate-[-4deg] place-items-center rounded-lg bg-primary font-black text-primary-foreground">
            SIC
          </div>
          <div>
            <strong className="block text-sm font-black leading-4">OPERATING SYSTEM</strong>
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Demo: SIC Pizza
            </span>
          </div>
        </div>

        <nav className="mt-8 space-y-1.5">
          <Button
            variant={view === "floor" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => {
              setView("floor");
              setSelectedTableId(null);
            }}
          >
            <Store className="size-4" />
            Floor View
          </Button>

          <Button
            variant={view === "kds" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setView("kds")}
          >
            <ChefHat className="size-4" />
            Kitchen Display
          </Button>

          <Button
            variant={view === "join" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setView("join")}
          >
            <QrCode className="size-4" />
            Guest Join QR
          </Button>

          <Button
            variant={view === "history" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setView("history")}
          >
            <History className="size-4" />
            Audit Events
          </Button>
        </nav>

        <div className="mt-auto rounded-xl border bg-card p-3 text-xs text-muted-foreground">
          <strong className="block text-foreground font-bold">{SERVER_NAME}</strong>
          Downtown Location · Handheld 01
        </div>
      </aside>

      {/* Main Container */}
      <main className="min-w-0">
        {/* Sticky Mobile/Desktop Top Header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/95 px-4 py-3 backdrop-blur md:px-7">
          <div className="flex items-center gap-2 lg:hidden">
            <div className="grid size-8 rotate-[-4deg] place-items-center rounded-lg bg-primary font-black text-xs text-primary-foreground">
              SIC
            </div>
            <span className="font-black text-sm">RESTAURANT OS</span>
          </div>

          <div className="hidden lg:flex items-center gap-2">
            <Badge className="font-mono font-bold">Downtown Location</Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              onClick={() => setAuthenticated(false)}
            >
              <LogOut className="size-4 text-muted-foreground hover:text-foreground" />
            </Button>
          </div>
        </header>

        {/* Dynamic Main Body Content */}
        <div className="p-4 md:p-7">
          {view === "floor" && (
            <>
              {selectedTableId && currentSession && currentProjection ? (
                <TableSessionView
                  session={currentSession}
                  projection={currentProjection}
                  currentServerId={SERVER_ID}
                  onBackToFloor={() => setSelectedTableId(null)}
                  onAddPizza={async (pizza, dinerId, course) => {
                    const priceCents =
                      (pizza.size === "small" ? 1400 : 1900) +
                      pizza.toppings.length * 175 +
                      (pizza.extraCheese ? 225 : 0);
                    await service.addItem(
                      currentSession.id,
                      {
                        menuItemId: "pizza_custom",
                        name: `${pizza.size} Custom Pizza`,
                        course: course || "mains",
                        stationId: "pizza-oven",
                        basePriceCents: priceCents,
                        selectedModifiers: [
                          ...pizza.toppings.map((t) => ({
                            modifierOptionId: `opt_${t}`,
                            name: t,
                            priceCents: 175
                          })),
                          ...(pizza.extraCheese
                            ? [{ modifierOptionId: "opt_xc", name: "Extra Cheese", priceCents: 225 }]
                            : [])
                        ],
                        dinerId
                      },
                      { actorType: "employee", actorId: SERVER_ID }
                    );
                    triggerUpdate();
                  }}
                  onAddStandardItem={async (name, priceCents, course, stationId, dinerId) => {
                    await service.addItem(
                      currentSession.id,
                      {
                        menuItemId: `menu_${name.toLowerCase().replace(/\s+/g, "_")}`,
                        name,
                        course,
                        stationId,
                        basePriceCents: priceCents,
                        dinerId
                      },
                      { actorType: "employee", actorId: SERVER_ID }
                    );
                    triggerUpdate();
                  }}
                  onApproveItem={async (itemId) => {
                    await service.approveItem(currentSession.id, itemId, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onVoidItem={async (itemId, reason) => {
                    await service.voidItem(currentSession.id, itemId, reason, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onFireCourse={async (course) => {
                    await service.fireCourse(currentSession.id, course, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onAcceptTicket={async (ticketId) => {
                    await service.acceptKitchenTicket(currentSession.id, ticketId, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onStartTicketItem={async (ticketId, orderItemId) => {
                    await service.startTicketItem(currentSession.id, ticketId, orderItemId, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onMarkItemReady={async (ticketId, orderItemId) => {
                    await service.markTicketItemReady(currentSession.id, ticketId, orderItemId, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onDeliverItems={async (ticketId, orderItemIds) => {
                    await service.deliverTicketItems(currentSession.id, ticketId, orderItemIds, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onAcknowledgeRequest={async (requestId) => {
                    await service.acknowledgeGuestRequest(currentSession.id, requestId, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onCompleteRequest={async (requestId) => {
                    await service.completeGuestRequest(currentSession.id, requestId, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onCreateGuestRequest={async (type, notes) => {
                    await service.createGuestRequest(
                      currentSession.id,
                      type,
                      notes,
                      currentSession.diners[0]?.id,
                      { actorType: "employee", actorId: SERVER_ID }
                    );
                    triggerUpdate();
                  }}
                  onSetStage={async (stage) => {
                    await service.setStage(currentSession.id, stage, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onCreateCheck={async (title, dinerIds) => {
                    await service.createCheck(currentSession.id, title, dinerIds);
                    triggerUpdate();
                  }}
                  onProcessPayment={async (checkId, amountCents, tipCents) => {
                    await service.processPayment(
                      currentSession.id,
                      checkId,
                      amountCents,
                      tipCents,
                      undefined,
                      { actorType: "employee", actorId: SERVER_ID }
                    );
                    triggerUpdate();
                  }}
                  onTransferTable={async (toEmployeeId, reason) => {
                    await service.transferTable(currentSession.id, toEmployeeId, reason, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onAddDiner={async (name) => {
                    await service.addDiner(currentSession.id, name, undefined, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onCloseSession={async () => {
                    await service.closeTableSession(currentSession.id, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    setSelectedTableId(null);
                    triggerUpdate();
                  }}
                />
              ) : (
                <FloorView
                  tables={floorTableItems}
                  currentServerId={SERVER_ID}
                  onSelectTable={(tableId) => setSelectedTableId(tableId)}
                  onOpenNewTable={async (tableId) => {
                    const tableMeta = STATIC_TABLES.find((t) => t.tableId === tableId);
                    if (!tableMeta) return;
                    await service.openTableSession(
                      {
                        restaurantId: RESTAURANT_ID,
                        locationId: LOCATION_ID,
                        tableId,
                        tableLabel: tableMeta.tableLabel,
                        diningAreaId: "area_main",
                        openedByEmployeeId: SERVER_ID,
                        assignedServerId: SERVER_ID,
                        initialDiners: ["Guest 1"]
                      },
                      { actorType: "employee", actorId: SERVER_ID }
                    );
                    setSelectedTableId(tableId);
                    triggerUpdate();
                  }}
                />
              )}
            </>
          )}

          {view === "kds" && (
            <div className="space-y-6">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
                  Kitchen Operations
                </span>
                <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">
                  Multi-Station Kitchen Display (KDS)
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Station-routed tickets with bump timers and line coordination.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {sessions
                  .flatMap((s) => s.tickets.map((t) => ({ ...t, session: s })))
                  .map((ticket) => (
                    <Card key={ticket.id} className="border-t-4 border-t-primary">
                      <CardHeader className="pb-2">
                        <div className="flex items-start justify-between">
                          <div>
                            <Badge className="font-mono text-xs">
                              {ticket.session.tableLabel}
                            </Badge>
                            <h2 className="mt-1 font-black text-lg text-foreground">
                              Station: {ticket.stationId}
                            </h2>
                          </div>
                          <Badge>{ticket.status}</Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="divide-y text-xs">
                          {ticket.items.map((i) => (
                            <div
                              key={i.orderItemId}
                              className="py-2 flex justify-between items-center"
                            >
                              <div>
                                <strong className="text-foreground">
                                  {i.quantity} × {i.name}
                                </strong>
                                {i.modifiers.length > 0 && (
                                  <p className="text-[11px] text-muted-foreground">
                                    {i.modifiers.join(", ")}
                                  </p>
                                )}
                              </div>
                              <Badge className="text-[10px] px-1.5 py-0.5">{i.status}</Badge>
                            </div>
                          ))}
                        </div>

                        <div className="pt-2">
                          {ticket.status === "queued" && (
                            <Button
                              size="default"
                              className="w-full"
                              onClick={async () => {
                                await service.acceptKitchenTicket(
                                  ticket.sessionId,
                                  ticket.id
                                );
                                triggerUpdate();
                              }}
                            >
                              Accept Ticket
                            </Button>
                          )}
                          {ticket.status === "accepted" && (
                            <Button
                              size="default"
                              className="w-full"
                              onClick={async () => {
                                for (const item of ticket.items) {
                                  await service.startTicketItem(
                                    ticket.sessionId,
                                    ticket.id,
                                    item.orderItemId
                                  );
                                }
                                triggerUpdate();
                              }}
                            >
                              Start Preparation
                            </Button>
                          )}
                          {ticket.status === "in_prep" && (
                            <Button
                              size="default"
                              className="w-full"
                              onClick={async () => {
                                for (const item of ticket.items) {
                                  await service.markTicketItemReady(
                                    ticket.sessionId,
                                    ticket.id,
                                    item.orderItemId
                                  );
                                }
                                triggerUpdate();
                              }}
                            >
                              Mark Ready (Expo)
                            </Button>
                          )}
                          {ticket.status === "ready" && (
                            <Button
                              size="default"
                              variant="default"
                              className="w-full"
                              onClick={async () => {
                                await service.deliverTicketItems(
                                  ticket.sessionId,
                                  ticket.id,
                                  ticket.items.map((i) => i.orderItemId)
                                );
                                triggerUpdate();
                              }}
                            >
                              Deliver to Table
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            </div>
          )}

          {view === "join" && (
            <div className="space-y-6 max-w-xl">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
                  Contactless Ordering
                </span>
                <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">
                  Guest QR Onboarding
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Zero-install guest mobile session for proposals, calls, and settlement.
                </p>
              </div>

              <Card>
                <CardContent className="pt-6 flex flex-col items-center text-center">
                  <div className="grid size-48 grid-cols-5 gap-1 rounded-xl bg-white p-4 shadow-md">
                    {Array.from({ length: 25 }, (_, i) => (
                      <span
                        key={i}
                        className={`${
                          [0, 1, 2, 4, 5, 7, 8, 10, 12, 14, 16, 18, 20, 21, 22, 23, 24].includes(i)
                            ? "bg-black"
                            : "bg-white"
                        }`}
                      />
                    ))}
                  </div>

                  <span className="mt-4 font-mono text-sm font-bold text-foreground">
                    /join/SIC-11
                  </span>

                  <Link
                    href="/join/SIC-11"
                    target="_blank"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-md hover:brightness-110"
                  >
                    <QrCode className="size-4" />
                    Open Guest View in New Tab
                  </Link>

                  <p className="mt-4 text-xs text-muted-foreground leading-5">
                    Proposals submitted by guests in the mobile view immediately appear on the server&apos;s Table Session Orders tab with a 1-tap approval gate.
                  </p>
                </CardContent>
              </Card>
            </div>
          )}

          {view === "history" && (
            <div className="space-y-6 max-w-3xl">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
                  Auditability & Telemetry
                </span>
                <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">
                  Append-Only Domain Event Stream
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Complete immutable ledger of operational activity across all table sessions.
                </p>
              </div>

              <Card>
                <CardContent className="p-5">
                  <ol className="relative ml-2 border-l border-border/80">
                    {allEvents.map((evt) => (
                      <li key={evt.id} className="relative mb-6 ml-5 last:mb-0">
                        <span className="absolute -left-[27px] top-1 size-3.5 rounded-full border-2 border-background bg-primary" />
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge className="text-[10px] font-mono">{evt.type}</Badge>
                          <time className="font-mono text-xs text-muted-foreground">
                            {new Date(evt.timestamp).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                              second: "2-digit"
                            })}
                          </time>
                          <span className="text-xs text-muted-foreground">
                            · {evt.actorType} {evt.actorId ? `(${evt.actorId})` : ""}
                          </span>
                        </div>

                        <div className="mt-1.5 rounded-lg bg-secondary/30 p-2.5 text-xs text-foreground font-mono">
                          {JSON.stringify(evt.payload, null, 2)}
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </main>

      {/* Fixed Mobile Bottom Navigation Bar */}
      <nav
        aria-label="Server primary mobile navigation"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 px-1 py-2 backdrop-blur lg:hidden"
      >
        <button
          onClick={() => {
            setView("floor");
            setSelectedTableId(null);
          }}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
            view === "floor" ? "bg-secondary text-primary" : "text-muted-foreground"
          }`}
        >
          <Store className="size-4" />
          Floor
        </button>

        <button
          onClick={() => setView("kds")}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
            view === "kds" ? "bg-secondary text-primary" : "text-muted-foreground"
          }`}
        >
          <ChefHat className="size-4" />
          Kitchen
        </button>

        <button
          onClick={() => setView("join")}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
            view === "join" ? "bg-secondary text-primary" : "text-muted-foreground"
          }`}
        >
          <QrCode className="size-4" />
          Guest QR
        </button>

        <button
          onClick={() => setView("history")}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
            view === "history" ? "bg-secondary text-primary" : "text-muted-foreground"
          }`}
        >
          <History className="size-4" />
          Audit
        </button>
      </nav>
    </div>
  );
}
