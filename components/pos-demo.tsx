"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  ChefHat,
  History,
  LogOut,
  QrCode,
  Store,
  Lock,
  Bell,
  Sparkles,
  ArrowRightLeft,
  ShieldAlert,
  TrendingUp,
  Pizza
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  projectTableSession,
  type TableSession,
  type DomainEvent,
  evaluateAttentionRules,
  DEFAULT_ATTENTION_CONFIG,
  type AttentionConfig,
  type SelectedModifier,
  ClientMutationQueue,
  AVAILABLE_TENANTS,
  SIC_PIZZA_TENANT,
  type RestaurantTenant
} from "@/lib/domain";
import { FloorView } from "./server/floor-view";
import { TableSessionView } from "./server/table-session-view";
import { AttentionQueue } from "./server/attention-queue";
import { DoThisNext } from "./server/do-this-next";
import { MultiStationKDS } from "./kitchen/multi-station-kds";
import { ShiftHandoffDialog } from "./server/shift-handoff-dialog";
import { ManagerCommandCenter } from "./manager/manager-command-center";
import { ServiceAnalyticsView } from "./analytics/service-analytics-view";
import { ConnectivityStatusBar } from "./offline/connectivity-status-bar";

const RESTAURANT_ID = "sic_pizza_org";
const LOCATION_ID = "loc_downtown";
import {
  authenticateStaffPin,
  createManagerOverride,
  DEMO_STAFF_DIRECTORY,
  type StaffSessionPayload
} from "@/lib/server/auth/staff-auth";
import { useTableRealtime } from "@/lib/client/use-table-realtime";


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
  const [selectedTenantId, setSelectedTenantId] = useState<string>("sic_pizza_tenant");
  const currentTenant: RestaurantTenant = useMemo(
    () => AVAILABLE_TENANTS.find((t) => t.tenantId === selectedTenantId) || SIC_PIZZA_TENANT,
    [selectedTenantId]
  );
  const [authenticated, setAuthenticated] = useState(false);
  const [staffSession, setStaffSession] = useState<StaffSessionPayload | null>(null);
  const [staffToken, setStaffToken] = useState<string | null>(null);
  const [pin, setPin] = useState("");

  const [error, setError] = useState("");
  const [view, setView] = useState<"floor" | "dothisnext" | "queue" | "kds" | "manager" | "analytics" | "join" | "history">("floor");
  const [selectedTableId, setSelectedTableId] = useState<string | null>("tbl_11");
  const [attentionConfig, setAttentionConfig] = useState<AttentionConfig>(DEFAULT_ATTENTION_CONFIG);
  const [dismissedItemIds, setDismissedItemIds] = useState<Set<string>>(new Set());
  const [isShiftHandoffOpen, setIsShiftHandoffOpen] = useState(false);

  // Manager Override state
  const [overrideModal, setOverrideModal] = useState<{
    open: boolean;
    action: string;
    itemId?: string;
    reason: string;
    sessionId?: string;
  } | null>(null);
  const [overridePin, setOverridePin] = useState("");
  const [overrideError, setOverrideError] = useState("");

  // Repository & Domain Service instances
  const repo = useMemo(() => new InMemoryTableSessionRepository(), []);
  const service = useMemo(() => new TableSessionService(repo), [repo]);
  const mutationQueue = useMemo(() => new ClientMutationQueue(), []);


  // Reactive state trigger
  const [revision, setRevision] = useState(0);
  const triggerUpdate = () => setRevision((r) => r + 1);

  const handleFlushQueue = async () => {
    await mutationQueue.flush(async () => {
      // Synchronize queued mutation idempotently
      triggerUpdate();
      return { success: true };
    });
  };

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

      // Add confirmed shared starter (split 50/50 between Alex and Sam)
      await service.addItem(
        s11.id,
        {
          menuItemId: "app_knots",
          name: "Garlic Knots (6pcs)",
          course: "starters",
          stationId: "cold-prep",
          basePriceCents: 800,
          splitMode: "shared_diners",
          assignedDinerIds: [s11.diners[0]?.id || "", s11.diners[1]?.id || ""]
        },
        { actorType: "employee", actorId: SERVER_ID }
      );

      // Add confirmed individual pizza for Alex
      await service.addItem(
        s11.id,
        {
          menuItemId: "pizza_pep",
          name: "Large Pepperoni Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 1900,
          selectedModifiers: [{ modifierOptionId: "opt_pep", name: "Pepperoni", priceCents: 175 }],
          splitMode: "single",
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

      // Guest requested water (routes to runner queue)
      await service.createGuestRequest(
        s11.id,
        "REFILL",
        "Sparkling water refill for seat 2",
        s11.diners[1]?.id,
        { actorType: "guest", actorId: "guest_sam" }
      );

      // Guest requested hot honey condiment (routes to runner queue)
      await service.createGuestRequest(
        s11.id,
        "CONDIMENT",
        "Side of hot honey and extra ranch",
        s11.diners[0]?.id,
        { actorType: "guest", actorId: "guest_alex" }
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

      // Table 12 requests drink reorder (routes to server)
      await service.createGuestRequest(
        s12.id,
        "DRINK_REORDER",
        "Another Negroni please",
        s12.diners[0]?.id,
        { actorType: "guest", actorId: "guest_taylor" }
      );

      // 3. Table 14: Food issue on Patio (routes to Manager & escalates)
      const { session: s14 } = await service.openTableSession(
        {
          id: "sess_14",
          restaurantId: RESTAURANT_ID,
          locationId: LOCATION_ID,
          tableId: "tbl_14",
          tableLabel: "Table 14",
          diningAreaId: "area_patio",
          openedByEmployeeId: SERVER_ID,
          assignedServerId: SERVER_ID,
          initialDiners: ["Jordan Guest", "Casey"]
        },
        { actorType: "employee", actorId: SERVER_ID }
      );
      await service.addItem(
        s14.id,
        {
          menuItemId: "pizza_special",
          name: "Spicy Diavola Pizza",
          course: "mains",
          stationId: "pizza-oven",
          basePriceCents: 2100
        },
        { actorType: "employee", actorId: SERVER_ID }
      );
      await service.createGuestRequest(
        s14.id,
        "FOOD_ISSUE",
        "Crust undercooked in center; dough raw",
        s14.diners[0]?.id,
        { actorType: "guest" }
      );

      // 4. Table 20: In CHECK_REQUESTED stage
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
        "CHECK",
        "Ready for bill drop",
        s20.diners[0]?.id,
        { actorType: "guest" }
      );

      // 5. Table 21: Fully paid, ready for clear & reset
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

  const allFloorRequests = useMemo(() => {
    return sessions.flatMap((s) => s.requests);
  }, [sessions]);

  const activeRequestCount = useMemo(() => {
    return allFloorRequests.filter(
      (r) => r.status !== "COMPLETED" && r.status !== "CANCELLED"
    ).length;
  }, [allFloorRequests]);

  const attentionItems = useMemo(() => {
    return evaluateAttentionRules(sessions, attentionConfig, {
      assignedEmployeeId: SERVER_ID,
      dismissedIds: dismissedItemIds
    });
  }, [sessions, attentionConfig, dismissedItemIds]);

  const urgentAttentionCount = useMemo(() => {
    return attentionItems.filter((i) => i.severity === "URGENT" || i.severity === "HIGH").length;
  }, [attentionItems]);

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

  // Realtime Floor Synchronization
  useTableRealtime({
    locationId: "loc_downtown",
    token: staffToken,
    enabled: Boolean(authenticated && staffToken),
    onEvent: () => {
      triggerUpdate();
    },
    onSyncRequired: () => {
      triggerUpdate();
    }
  });

  async function login(pinToAuth?: string) {
    const inputPin = pinToAuth || pin;
    setError("");
    const res = await authenticateStaffPin(inputPin, "loc_downtown");
    if (!res.success || !res.payload) {
      setError(res.error || "PIN not recognized. Use demo PINs: Jordan (0420), Alex (8888), Sam (2468).");
      return;
    }
    setStaffSession(res.payload);
    setStaffToken(res.token || null);
    setAuthenticated(true);
  }


  if (!authenticated) {
    return (
      <main className="relative grid min-h-screen place-items-center p-4 bg-background">
        <div className="absolute top-4 right-4">
          <ThemeToggle size="sm" />
        </div>
        <Card className="w-full max-w-sm overflow-hidden border border-border shadow-2xl">
          <div className="h-1.5 bg-primary" />
          <CardHeader className="text-center pt-8 pb-4">
            <div className={`mx-auto flex size-12 items-center justify-center rounded-2xl ${currentTenant.theme.badgeClass} font-black text-xl rotate-[-4deg] shadow-md`}>
              {currentTenant.tenantId === "sic_pizza_tenant" ? (
                <Pizza className="size-6 text-primary-foreground" />
              ) : (
                currentTenant.theme.logoShort
              )}
            </div>
            <h1 className="mt-4 text-2xl font-black tracking-tight text-foreground">
              {currentTenant.name}
            </h1>
            <p className="text-xs text-muted-foreground">
              {currentTenant.theme.tagline}
            </p>
            <p className="text-xs text-muted-foreground mt-1 font-mono">
              Server-Verified Staff PIN Authentication
            </p>
          </CardHeader>
          <CardContent className="space-y-4 pb-8">
            {/* Tenant Demonstration Selector */}
            <div className="space-y-1">
              <label htmlFor="tenant-select" className="text-[11px] font-bold text-muted-foreground block">
                Platform Demo Tenant:
              </label>
              <select
                id="tenant-select"
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="h-9 w-full rounded-lg border bg-card px-2.5 text-xs font-bold text-foreground focus:outline-hidden"
              >
                {AVAILABLE_TENANTS.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.name} ({t.cuisine.split(",")[0]})
                  </option>
                ))}
              </select>
            </div>

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

            <Button size="lg" className="w-full" onClick={() => login()}>
              <Lock className="size-4 mr-1" />
              Sign In to Floor
            </Button>

            {/* Quick Demo Role Selector */}
            <div className="pt-2 border-t space-y-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block text-center">
                Quick-Select Demo Staff Roles:
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {DEMO_STAFF_DIRECTORY.map((s) => (
                  <Button
                    key={s.id}
                    type="button"
                    variant="secondary"
                    className="h-8 text-[11px] justify-between px-2 font-normal"
                    onClick={() => {
                      setPin(s.pin);
                      login(s.pin);
                    }}
                  >
                    <span className="font-bold truncate">{s.displayName.split(" ")[0]}</span>
                    <Badge className="text-[9px] px-1 py-0 font-mono">
                      {s.role}
                    </Badge>
                  </Button>
                ))}
              </div>

            </div>
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
          <div className={`grid size-9 rotate-[-4deg] place-items-center rounded-lg ${currentTenant.theme.badgeClass} font-black text-xs shadow-xs`}>
            {currentTenant.tenantId === "sic_pizza_tenant" ? (
              <Pizza className="size-5 text-primary-foreground" />
            ) : (
              currentTenant.theme.logoShort
            )}
          </div>
          <div>
            <strong className="block text-sm font-black leading-4">{currentTenant.theme.brandName}</strong>
            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Restaurant OS
            </span>
          </div>
        </div>

        <nav className="mt-8 space-y-1.5">
          <Button
            variant={view === "dothisnext" ? "secondary" : "ghost"}
            className="w-full justify-between"
            onClick={() => setView("dothisnext")}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <span className="font-bold">Do This Next</span>
            </div>
            {attentionItems.length > 0 && (
              <Badge
                className={`px-1.5 py-0 text-[10px] font-bold ${
                  urgentAttentionCount > 0
                    ? "bg-red-500 text-white animate-pulse"
                    : "bg-primary text-primary-foreground"
                }`}
              >
                {attentionItems.length}
              </Badge>
            )}
          </Button>

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
            variant={view === "queue" ? "secondary" : "ghost"}
            className="w-full justify-between"
            onClick={() => setView("queue")}
          >
            <div className="flex items-center gap-2">
              <Bell className="size-4" />
              <span>Attention Queue</span>
            </div>
            {activeRequestCount > 0 && (
              <Badge className="px-1.5 py-0 text-[10px] font-bold bg-primary text-primary-foreground">
                {activeRequestCount}
              </Badge>
            )}
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
            variant={view === "manager" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setView("manager")}
          >
            <ShieldAlert className="size-4 text-amber-400" />
            Manager Hub
          </Button>

          <Button
            variant={view === "analytics" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setView("analytics")}
          >
            <TrendingUp className="size-4 text-cyan-400" />
            Service Analytics
          </Button>

          <Button
            variant={view === "history" ? "secondary" : "ghost"}
            className="w-full justify-start"
            onClick={() => setView("history")}
          >
            <History className="size-4" />
            Audit Events
          </Button>

          <Button
            variant="secondary"
            className="w-full justify-start border border-primary/40 bg-primary/10 text-primary font-bold hover:bg-primary/20"
            onClick={() => setIsShiftHandoffOpen(true)}
          >
            <ArrowRightLeft className="size-4" />
            Shift / Section Handoff
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
            <div className={`grid size-8 rotate-[-4deg] place-items-center rounded-lg ${currentTenant.theme.badgeClass} font-black text-xs`}>
              {currentTenant.tenantId === "sic_pizza_tenant" ? (
                <Pizza className="size-4 text-primary-foreground" />
              ) : (
                currentTenant.theme.logoShort
              )}
            </div>
            <span className="font-black text-sm">{currentTenant.name}</span>
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <span className="text-muted-foreground font-mono text-[11px]">Tenant:</span>
              <select
                value={selectedTenantId}
                onChange={(e) => setSelectedTenantId(e.target.value)}
                className="h-8 rounded-lg border bg-card px-2.5 text-xs font-bold text-foreground focus:outline-hidden"
              >
                {AVAILABLE_TENANTS.map((t) => (
                  <option key={t.tenantId} value={t.tenantId}>
                    {t.name} ({t.cuisine.split(",")[0]})
                  </option>
                ))}
              </select>
            </div>
            <Badge className="font-mono font-bold">{currentTenant.locationId}</Badge>
          </div>

          <div className="flex items-center gap-2">
            <ThemeToggle size="sm" />
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
        <div className="p-4 md:p-7 space-y-4">
          <ConnectivityStatusBar queue={mutationQueue} onFlush={handleFlushQueue} />

          {view === "dothisnext" && (
            <DoThisNext
              items={attentionItems}
              currentServerId={SERVER_ID}
              config={attentionConfig}
              onUpdateConfig={(newCfg) => setAttentionConfig((prev) => ({ ...prev, ...newCfg }))}
              onDismissItem={(id) => setDismissedItemIds((prev) => new Set([...prev, id]))}
              onSelectTable={(tableId) => {
                setSelectedTableId(tableId);
                setView("floor");
              }}
              onExecuteAction={async (item) => {
                if (item.ruleKey === "GUEST_PROPOSAL_PENDING") {
                  setSelectedTableId(item.tableId);
                  setView("floor");
                } else if (
                  item.ruleKey === "REQUEST_UNACKNOWLEDGED" ||
                  item.ruleKey === "REQUEST_OVERDUE_OR_ESCALATED"
                ) {
                  await service.acknowledgeGuestRequest(item.sessionId, item.source.id, {
                    actorType: "employee",
                    actorId: SERVER_ID
                  });
                  triggerUpdate();
                } else if (item.ruleKey === "FOOD_ISSUE_ALERT") {
                  setSelectedTableId(item.tableId);
                  setView("floor");
                } else if (item.ruleKey === "ITEMS_READY_FOR_DELIVERY") {
                  const targetSession = sessions.find((s) => s.id === item.sessionId);
                  const ticket = targetSession?.tickets.find((t) => t.id === item.source.id);
                  if (ticket) {
                    await service.deliverTicketItems(
                      item.sessionId,
                      ticket.id,
                      ticket.items.map((i) => i.orderItemId)
                    );
                    triggerUpdate();
                  }
                } else if (item.ruleKey === "COURSE_PACING_GAP") {
                  await service.fireCourse(item.sessionId, "mains", {
                    actorType: "employee",
                    actorId: SERVER_ID
                  });
                  triggerUpdate();
                } else {
                  setSelectedTableId(item.tableId);
                  setView("floor");
                }
              }}
            />
          )}

          {view === "floor" && (
            <>
              {selectedTableId && currentSession && currentProjection ? (
                <TableSessionView
                  session={currentSession}
                  projection={currentProjection}
                  currentServerId={SERVER_ID}
                  onBackToFloor={() => setSelectedTableId(null)}
                  onAddPizza={async (pizza, ownership, course, semanticModifiers) => {
                    const basePrice = pizza.size === "small" ? 1400 : 1900;
                    const modifiersToUse: SelectedModifier[] = semanticModifiers || [
                      ...pizza.toppings.map((t) => ({
                        modifierOptionId: `opt_${t}`,
                        name: t,
                        level: "NORMAL" as const,
                        placement: "WHOLE" as const,
                        priceCents: 175
                      })),
                      ...(pizza.extraCheese
                        ? [
                            {
                              modifierOptionId: "opt_xc",
                              name: "Extra Cheese",
                              level: "EXTRA" as const,
                              placement: "WHOLE" as const,
                              priceCents: 225
                            }
                          ]
                        : [])
                    ];

                    await service.addItem(
                      currentSession.id,
                      {
                        menuItemId: "pizza_custom",
                        name: `${pizza.size === "small" ? '12"' : '16"'} Sicilian Pizza`,
                        course: course || "mains",
                        stationId: "pizza-oven",
                        basePriceCents: basePrice,
                        selectedModifiers: modifiersToUse,
                        splitMode: ownership.splitMode,
                        assignedDinerIds: ownership.assignedDinerIds,
                        dinerId: ownership.assignedDinerIds[0]
                      },
                      { actorType: "employee", actorId: SERVER_ID }
                    );
                    triggerUpdate();
                  }}
                  onAddStandardItem={async (name, priceCents, course, stationId, ownership) => {
                    await service.addItem(
                      currentSession.id,
                      {
                        menuItemId: `menu_${name.toLowerCase().replace(/\s+/g, "_")}`,
                        name,
                        course,
                        stationId,
                        basePriceCents: priceCents,
                        splitMode: ownership.splitMode,
                        assignedDinerIds: ownership.assignedDinerIds,
                        dinerId: ownership.assignedDinerIds[0]
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
                    const isManager = staffSession?.role === "manager" || staffSession?.role === "admin";
                    if (!isManager) {
                      setOverrideModal({
                        open: true,
                        action: "VOID_ITEM",
                        itemId,
                        reason: reason || "Customer request",
                        sessionId: currentSession.id
                      });
                      return;
                    }
                    await service.voidItem(currentSession.id, itemId, reason, {
                      actorType: "employee",
                      actorId: staffSession?.employeeId || SERVER_ID
                    });
                    triggerUpdate();
                  }}

                  onUpdateItemOwnership={async (itemId, ownership) => {
                    await service.updateItemOwnership(
                      currentSession.id,
                      itemId,
                      ownership,
                      { actorType: "employee", actorId: SERVER_ID }
                    );
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
                  onClaimRequest={async (requestId, empId) => {
                    await service.claimGuestRequest(currentSession.id, requestId, empId, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onStartRequest={async (requestId, empId) => {
                    await service.startGuestRequest(currentSession.id, requestId, empId, {
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
                  onCancelRequest={async (requestId, reason) => {
                    await service.cancelGuestRequest(currentSession.id, requestId, reason, {
                      actorType: "employee",
                      actorId: SERVER_ID
                    });
                    triggerUpdate();
                  }}
                  onCreateGuestRequest={async (category, notes, dinerId) => {
                    await service.createGuestRequest(
                      currentSession.id,
                      category,
                      notes,
                      dinerId || currentSession.diners[0]?.id,
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
                  onProcessDinerPayment={async (dinerId, amountCents, tipCents) => {
                    await service.processDinerPayment(
                      currentSession.id,
                      dinerId,
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

          {view === "queue" && (
            <AttentionQueue
              requests={allFloorRequests}
              currentEmployeeId={SERVER_ID}
              currentEmployeeRole="server"
              onAcknowledgeRequest={async (sessionId, requestId) => {
                await service.acknowledgeGuestRequest(sessionId, requestId, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onClaimRequest={async (sessionId, requestId, employeeId) => {
                await service.claimGuestRequest(sessionId, requestId, employeeId, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onStartRequest={async (sessionId, requestId, employeeId) => {
                await service.startGuestRequest(sessionId, requestId, employeeId, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onCompleteRequest={async (sessionId, requestId) => {
                await service.completeGuestRequest(sessionId, requestId, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onCancelRequest={async (sessionId, requestId, reason) => {
                await service.cancelGuestRequest(sessionId, requestId, reason, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onOpenCreateDialog={() => {
                const targetSession = sessions.find((s) => !s.closedAt) || sessions[0];
                if (targetSession) {
                  setSelectedTableId(targetSession.tableId);
                  setView("floor");
                }
              }}
              onSelectTable={(tableId) => {
                setSelectedTableId(tableId);
                setView("floor");
              }}
            />
          )}

          {view === "kds" && (
            <MultiStationKDS
              sessions={sessions}
              onAcceptTicket={async (sessionId, ticketId) => {
                await service.acceptKitchenTicket(sessionId, ticketId, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onStartItem={async (sessionId, ticketId, orderItemId) => {
                await service.startTicketItem(sessionId, ticketId, orderItemId, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onMarkItemReady={async (sessionId, ticketId, orderItemId) => {
                await service.markTicketItemReady(sessionId, ticketId, orderItemId, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onDeliverTicket={async (sessionId, ticketId, itemIds) => {
                await service.deliverTicketItems(sessionId, ticketId, itemIds, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onRecallTicket={async (sessionId, ticketId, reason) => {
                await service.recallKitchenTicket(sessionId, ticketId, reason, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
              onDeliverExpoCourse={async (sessionId, course) => {
                await service.deliverExpoCourse(sessionId, course, {
                  actorType: "employee",
                  actorId: SERVER_ID
                });
                triggerUpdate();
              }}
            />
          )}

          {view === "join" && (
            <div className="mx-auto max-w-md space-y-6 pt-6 text-center">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
                  Guest Mobile Web Experience
                </span>
                <h1 className="mt-0.5 text-2xl font-black tracking-tight">Table QR Code Join</h1>
                <p className="mt-1 text-xs text-muted-foreground">
                  Scan to view live table, order items, customize pizza, and request service.
                </p>
              </div>

              <Card className="p-6">
                <CardContent className="flex flex-col items-center p-0">
                  <div className="grid size-48 place-items-center rounded-2xl border-2 border-dashed border-primary/40 bg-secondary/30">
                    <QrCode className="size-28 text-primary" />
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

          {/* Manager Operations Command Center View */}
          {view === "manager" && (
            <ManagerCommandCenter
              sessions={sessions}
              onSelectTable={(tblId) => {
                setSelectedTableId(tblId);
                setView("floor");
              }}
              onTransferTable={(sId) => {
                const s = sessions.find((item) => item.id === sId);
                if (s) {
                  setSelectedTableId(s.tableId);
                  setView("floor");
                }
              }}
              onOpenSectionHandoff={() => setIsShiftHandoffOpen(true)}
              onOpenAuditHistory={() => setView("history")}
              onResolveRequest={async (sId, reqId, resolution) => {
                await service.resolveEscalation(sId, reqId, resolution, {
                  actorType: "employee",
                  actorId: "emp_sam_mgr"
                });
                triggerUpdate();
              }}
              onApproveProposal={async (sId, itemId) => {
                await service.approveItem(sId, itemId, {
                  actorType: "employee",
                  actorId: "emp_sam_mgr"
                });
                triggerUpdate();
              }}
            />
          )}

          {/* Service Analytics That Explain Why */}
          {view === "analytics" && (
            <ServiceAnalyticsView sessions={sessions} />
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
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-7 border-t bg-background/95 px-1 py-2 backdrop-blur lg:hidden"
      >
        <button
          onClick={() => setView("dothisnext")}
          className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
            view === "dothisnext" ? "bg-secondary text-primary" : "text-muted-foreground"
          }`}
        >
          <Sparkles className="size-4" />
          Next
          {attentionItems.length > 0 && (
            <span
              className={`absolute top-1.5 right-2 flex size-2 rounded-full ${
                urgentAttentionCount > 0 ? "bg-red-500 animate-ping" : "bg-primary"
              }`}
            />
          )}
        </button>

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
          onClick={() => setView("queue")}
          className={`relative flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
            view === "queue" ? "bg-secondary text-primary" : "text-muted-foreground"
          }`}
        >
          <Bell className="size-4" />
          Queue
          {activeRequestCount > 0 && (
            <span className="absolute top-1.5 right-2 flex size-2 rounded-full bg-primary" />
          )}
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
          onClick={() => setView("manager")}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
            view === "manager" ? "bg-secondary text-primary" : "text-muted-foreground"
          }`}
        >
          <ShieldAlert className="size-4 text-amber-400" />
          Mgr
        </button>

        <button
          onClick={() => setView("join")}
          className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${
            view === "join" ? "bg-secondary text-primary" : "text-muted-foreground"
          }`}
        >
          <QrCode className="size-4" />
          Guest
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

      {/* Instant Shift & Section Handoff Modal */}
      <ShiftHandoffDialog
        isOpen={isShiftHandoffOpen}
        onClose={() => setIsShiftHandoffOpen(false)}
        activeServerId={staffSession?.employeeId || SERVER_ID}
        activeServerName={staffSession?.displayName || SERVER_NAME}
        allSessions={sessions}
        availableEmployees={[
          { id: "emp_jordan", name: "Jordan", role: "Server" },
          { id: "emp_manager", name: "Alex", role: "Manager" },
          { id: "emp_bartender", name: "Sam", role: "Bartender" },
          { id: "emp_runner", name: "Casey", role: "Runner" },
          { id: "emp_expo", name: "Taylor", role: "Expo" }
        ]}
        onTransferTables={async (sessionIds, toEmployeeId, reason) => {
          await service.transferMultipleTables(sessionIds, toEmployeeId, reason, {
            actorType: "employee",
            actorId: staffSession?.employeeId || SERVER_ID
          });
          triggerUpdate();
        }}
      />

      {/* Manager Override Authorization Dialog */}
      {overrideModal?.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <Card className="w-full max-w-sm border border-amber-500/40 shadow-2xl bg-card">
            <CardHeader className="text-center pt-6 pb-2">
              <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-500 font-bold mb-2">
                <ShieldAlert className="size-6" />
              </div>
              <h2 className="text-lg font-black tracking-tight text-foreground">Manager Override Required</h2>
              <p className="text-xs text-muted-foreground">
                Action: <strong className="text-foreground">{overrideModal.action}</strong>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Reason: {overrideModal.reason}
              </p>
              <p className="text-[11px] font-mono text-muted-foreground mt-2">
                Enter Manager PIN (Dev: <strong className="text-foreground">8888</strong>)
              </p>
            </CardHeader>
            <CardContent className="space-y-4 pb-6">
              <input
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={overridePin}
                onChange={(e) => setOverridePin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
                className="h-12 w-full rounded-xl border bg-background text-center font-mono text-2xl tracking-[0.4em] focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                autoFocus
              />
              {overrideError && (
                <p className="text-center text-xs font-bold text-destructive">{overrideError}</p>
              )}
              <div className="flex gap-2 pt-2">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setOverrideModal(null);
                    setOverridePin("");
                    setOverrideError("");
                  }}
                >
                  Cancel
                </Button>

                <Button
                  className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold"
                  onClick={async () => {
                    setOverrideError("");
                    const res = await createManagerOverride(
                      overridePin,
                      overrideModal.action,
                      overrideModal.reason,
                      "loc_downtown"
                    );
                    if (!res.success) {
                      setOverrideError(res.error || "Invalid Manager PIN.");
                      return;
                    }

                    if (
                      overrideModal.action === "VOID_ITEM" &&
                      overrideModal.sessionId &&
                      overrideModal.itemId
                    ) {
                      await service.voidItem(
                        overrideModal.sessionId,
                        overrideModal.itemId,
                        `${overrideModal.reason} (Approved by Manager: ${res.managerName})`,
                        {
                          actorType: "employee",
                          actorId: staffSession?.employeeId || SERVER_ID
                        }
                      );
                      triggerUpdate();
                    }

                    setOverrideModal(null);
                    setOverridePin("");
                    setOverrideError("");
                  }}
                >
                  Authorize
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

