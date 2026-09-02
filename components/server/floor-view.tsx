import React, { useState } from "react";
import {
  Users,
  Clock,
  ChefHat,
  Plus,
  Search,
  Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { money } from "@/lib/utils";
import type { TableSessionProjection } from "@/lib/domain/models/session";
import { StageBadge } from "./stage-badge";
import { AttentionBadge } from "./attention-badge";

interface FloorTableItem {
  tableId: string;
  tableLabel: string;
  diningAreaName: string;
  seats: number;
  projection?: TableSessionProjection;
  status: "available" | "occupied" | "reserved" | "dirty";
}

interface FloorViewProps {
  tables: FloorTableItem[];
  currentServerId: string;
  onSelectTable: (tableId: string) => void;
  onOpenNewTable: (tableId: string) => void;
}

export function FloorView({
  tables,
  currentServerId,
  onSelectTable,
  onOpenNewTable
}: FloorViewProps) {
  const [filter, setFilter] = useState<"all" | "attention" | "mine">("all");
  const [areaFilter, setAreaFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");

  const areas = Array.from(new Set(tables.map((t) => t.diningAreaName)));

  const attentionCount = tables.filter(
    (t) => t.projection?.operationalAttention.isAttentionRequired
  ).length;

  const myTablesCount = tables.filter(
    (t) => t.projection?.assignedServerId === currentServerId
  ).length;

  const filteredTables = tables.filter((t) => {
    // Search match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchLabel = t.tableLabel.toLowerCase().includes(q);
      const matchDiner = t.projection?.diners.some((d) => d.displayName.toLowerCase().includes(q));
      if (!matchLabel && !matchDiner) return false;
    }

    // Area filter
    if (areaFilter !== "all" && t.diningAreaName !== areaFilter) return false;

    // View tab filter
    if (filter === "attention") {
      return t.projection?.operationalAttention.isAttentionRequired;
    }
    if (filter === "mine") {
      return t.projection?.assignedServerId === currentServerId;
    }
    return true;
  });

  // Sort tables: Attention-required first, then occupied, then available
  const sortedTables = [...filteredTables].sort((a, b) => {
    const aUrgent = a.projection?.operationalAttention.isAttentionRequired ? 1 : 0;
    const bUrgent = b.projection?.operationalAttention.isAttentionRequired ? 1 : 0;
    if (bUrgent !== aUrgent) return bUrgent - aUrgent;

    const aOcc = a.status === "occupied" ? 1 : 0;
    const bOcc = b.status === "occupied" ? 1 : 0;
    if (bOcc !== aOcc) return bOcc - aOcc;

    return a.tableLabel.localeCompare(b.tableLabel, undefined, { numeric: true });
  });

  return (
    <div className="space-y-5 pb-12">
      {/* Floor Overview Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
            Floor Operations
          </span>
          <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">
            Live Dining Room
          </h1>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search table or guest..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-10 w-full rounded-xl border bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-primary"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex flex-wrap gap-1.5">
          <Button
            variant={filter === "all" ? "default" : "secondary"}
            size="default"
            onClick={() => setFilter("all")}
          >
            All Tables ({tables.length})
          </Button>

          <Button
            variant={filter === "attention" ? "danger" : "secondary"}
            size="default"
            onClick={() => setFilter("attention")}
            className="relative"
          >
            {attentionCount > 0 && (
              <span className="mr-1 inline-block size-2 rounded-full bg-red-400 animate-ping" />
            )}
            Needs Attention ({attentionCount})
          </Button>

          <Button
            variant={filter === "mine" ? "default" : "secondary"}
            size="default"
            onClick={() => setFilter("mine")}
          >
            My Tables ({myTablesCount})
          </Button>
        </div>

        {/* Area dropdown / pills */}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Filter className="size-3.5" />
          <button
            onClick={() => setAreaFilter("all")}
            className={`rounded-md px-2 py-1 font-semibold transition ${
              areaFilter === "all" ? "bg-primary/20 text-primary font-bold" : "hover:text-foreground"
            }`}
          >
            All Areas
          </button>
          {areas.map((area) => (
            <button
              key={area}
              onClick={() => setAreaFilter(area)}
              className={`rounded-md px-2 py-1 font-semibold transition ${
                areaFilter === area ? "bg-primary/20 text-primary font-bold" : "hover:text-foreground"
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      </div>

      {/* Tables Grid */}
      {sortedTables.length === 0 ? (
        <div className="rounded-2xl border border-dashed py-12 text-center text-muted-foreground">
          <p className="text-sm">No tables match your selected filter.</p>
          <Button
            variant="secondary"
            size="default"
            className="mt-3"
            onClick={() => {
              setFilter("all");
              setAreaFilter("all");
              setSearchQuery("");
            }}
          >
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedTables.map((t) => {
            const proj = t.projection;
            const isOccupied = t.status === "occupied" && proj;
            const hasAttention = proj?.operationalAttention.isAttentionRequired;

            return (
              <Card
                key={t.tableId}
                onClick={() => {
                  if (isOccupied) {
                    onSelectTable(t.tableId);
                  } else {
                    onOpenNewTable(t.tableId);
                  }
                }}
                className={`group relative cursor-pointer overflow-hidden transition-colors duration-200 hover:bg-secondary/40 ${
                  hasAttention
                    ? "border-red-500/50 bg-red-500/10"
                    : isOccupied
                    ? "border-border bg-card hover:border-primary/50"
                    : "border-border/60 bg-card/40 opacity-75 hover:opacity-100"
                }`}
              >
                {/* Urgent top accent strip */}
                {hasAttention && (
                  <div className="h-1 w-full bg-gradient-to-r from-red-500 to-amber-500" />
                )}

                <CardContent className="p-4">
                  {/* Top Bar: Table Label + Stage Badge */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                        {t.diningAreaName}
                      </span>
                      <h3 className="text-xl font-black tracking-tight text-foreground group-hover:text-primary transition">
                        {t.tableLabel}
                      </h3>
                    </div>

                    {isOccupied ? (
                      <StageBadge stage={proj.stage} size="sm" />
                    ) : (
                      <span className="rounded-md border border-zinc-700 bg-zinc-800/80 px-2 py-0.5 font-mono text-[10px] font-bold uppercase text-zinc-400">
                        Available
                      </span>
                    )}
                  </div>

                  {/* Operational Attention Badge if urgent */}
                  {hasAttention && proj && (
                    <div className="mt-2.5">
                      <AttentionBadge
                        urgency={proj.operationalAttention.urgency}
                        reasons={proj.operationalAttention.reasons}
                      />
                    </div>
                  )}

                  {/* Occupied Table Body */}
                  {isOccupied ? (
                    <div className="mt-3 space-y-2 text-xs">
                      {/* Diners & Elapsed Time */}
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Users className="size-3.5 text-foreground" />
                          <strong className="text-foreground">
                            {proj.diners.length}
                          </strong>{" "}
                          / {t.seats} seats
                        </span>

                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="size-3.5 text-muted-foreground" />
                          {proj.elapsedMinutes}m seated
                        </span>
                      </div>

                      {/* Guest Names snippet */}
                      {proj.diners.length > 0 && (
                        <p className="truncate text-muted-foreground">
                          {proj.diners.map((d) => d.displayName).join(", ")}
                        </p>
                      )}

                      {/* Kitchen Progress snippet */}
                      <div className="flex items-center justify-between rounded-lg bg-background/60 px-2.5 py-1.5 border">
                        <span className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
                          <ChefHat className="size-3 text-primary" />
                          {proj.kitchenProgress === "not_ordered"
                            ? "No orders yet"
                            : proj.kitchenProgress === "queued"
                            ? "Queue in kitchen"
                            : proj.kitchenProgress === "preparing"
                            ? "Food in prep"
                            : proj.kitchenProgress === "ready_for_runner"
                            ? "Ready for pickup"
                            : "Delivered"}
                        </span>

                        <span className="font-mono font-bold text-foreground">
                          {money(proj.totalCents)}
                        </span>
                      </div>

                      {/* Open Guest Requests snippet */}
                      {proj.openRequests.length > 0 && (
                        <div className="flex items-center justify-between rounded-lg bg-red-500/10 px-2 py-1 text-[11px] font-bold text-red-300">
                          <span>
                            {proj.openRequests.length} pending request
                            {proj.openRequests.length > 1 ? "s" : ""}
                          </span>
                          <span className="font-mono text-[10px] uppercase">
                            {(proj.openRequests[0]?.category || proj.openRequests[0]?.type || "REQUEST").replace(/_/g, " ")}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Available Table Body */
                    <div className="mt-5 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
                      <span>Capacity: {t.seats} seats</span>
                      <span className="flex items-center gap-1 font-bold text-primary">
                        <Plus className="size-3.5" />
                        Seat Party
                      </span>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
