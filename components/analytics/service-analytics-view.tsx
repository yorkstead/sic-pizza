"use client";

import React, { useState, useMemo } from "react";
import {
  Clock,
  ChefHat,
  Users,
  Sparkles,
  HelpCircle,
  TrendingUp,
  Ban,
  Calendar,
  Filter
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { TableSession } from "@/lib/domain/models/session";
import {
  deriveServiceAnalytics,
  type ServiceAnalyticsReport,
  type AnalyticsFilter
} from "@/lib/domain/models/service-analytics";

interface ServiceAnalyticsViewProps {
  sessions: TableSession[];
}

export function ServiceAnalyticsView({ sessions }: ServiceAnalyticsViewProps) {
  const [datePreset, setDatePreset] = useState<"all" | "today" | "yesterday" | "last7days">("all");
  const [selectedServerId, setSelectedServerId] = useState<string>("all");
  const [isGlossaryOpen, setIsGlossaryOpen] = useState(false);

  const filter: AnalyticsFilter = useMemo(() => ({
    datePreset,
    serverId: selectedServerId !== "all" ? selectedServerId : undefined
  }), [datePreset, selectedServerId]);

  const report: ServiceAnalyticsReport = useMemo(() => {
    return deriveServiceAnalytics(sessions, filter);
  }, [sessions, filter]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col gap-3 rounded-2xl border bg-card p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-cyan-500 animate-pulse" />
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
              Restaurant Service Intelligence
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            Service Analytics That Explain Why
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Strictly event-derived operational timing and friction metrics without vanity charts.
          </p>
        </div>

        {/* Action Controls & Glossary Toggle */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="default"
            className="text-xs font-bold border"
            onClick={() => setIsGlossaryOpen(!isGlossaryOpen)}
          >
            <HelpCircle className="size-3.5 mr-1.5 text-primary" />
            Metric Definitions ({Object.keys(report.metricDefinitions).length})
          </Button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-secondary/20 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] font-bold text-muted-foreground flex items-center gap-1">
            <Filter className="size-3 text-primary" />
            Filter:
          </span>

          <div className="flex items-center rounded-lg border bg-card p-0.5">
            {(["all", "today", "yesterday", "last7days"] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setDatePreset(preset)}
                className={`rounded-md px-2.5 py-1 text-xs font-bold transition ${
                  datePreset === preset ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {preset === "all" ? "All Shifts" : preset === "today" ? "Today" : preset === "yesterday" ? "Yesterday" : "7 Days"}
              </button>
            ))}
          </div>

          <select
            value={selectedServerId}
            onChange={(e) => setSelectedServerId(e.target.value)}
            className="h-8 rounded-lg border bg-card px-2.5 text-xs font-bold text-foreground focus:outline-hidden"
          >
            <option value="all">All Servers</option>
            <option value="emp_jordan">Jordan (Server)</option>
            <option value="emp_taylor">Taylor (Server)</option>
            <option value="emp_morgan">Morgan (Server)</option>
          </select>
        </div>

        <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
          <Calendar className="size-3.5" />
          <span>Analyzed {report.totalTablesAnalyzed} tables · {report.totalGuestsAnalyzed} guests</span>
        </div>
      </div>

      {/* Metric Definitions & Formulas Drawer */}
      {isGlossaryOpen && (
        <Card className="border-primary/40 bg-primary/5 animate-in fade-in">
          <CardHeader className="p-4 pb-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">Operational Metric Definitions & Event Triggers</h3>
              </div>
              <Badge className="bg-primary/20 text-primary border-primary/40 font-mono text-[10px]">
                Event-Derived
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              All calculations use immutable append-only event stream timestamps rather than manual counters.
            </p>
          </CardHeader>
          <CardContent className="p-4 pt-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Object.entries(report.metricDefinitions).map(([key, def]) => (
                <div key={key} className="rounded-xl border border-border/80 bg-card p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <strong className="text-foreground font-bold">{def.name}</strong>
                    <Badge className="font-mono text-[9px] uppercase bg-secondary">{def.category}</Badge>
                  </div>
                  <div className="font-mono text-[10px] text-muted-foreground bg-secondary/40 rounded p-1.5">
                    <strong>Formula:</strong> {def.startTrigger} &rarr; {def.endTrigger}
                  </div>
                  <p className="text-muted-foreground text-[11px] leading-4">{def.description}</p>
                  <p className="text-[11px] font-semibold text-primary">Why it matters: {def.whyItMatters}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* -------------------------------------------------------------------------
          SECTION 1: CORE SERVICE VELOCITY MATRIX
         ------------------------------------------------------------------------- */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-black text-foreground flex items-center gap-2">
            <Clock className="size-4 text-primary" />
            Service Timing & Guest Journey Velocity
          </h2>
          <span className="font-mono text-[10px] text-muted-foreground uppercase">Target Benchmarks Active</span>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {/* Greet Time */}
          <Card className="p-3.5">
            <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground block">
              Avg Greet Time
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <strong className="text-2xl font-black text-foreground">{report.avgGreetMinutes}</strong>
              <span className="text-xs text-muted-foreground">min</span>
            </div>
            <span className={`text-[10px] font-mono font-bold mt-1 block ${report.avgGreetMinutes <= 2 ? "text-emerald-400" : "text-amber-400"}`}>
              {report.avgGreetMinutes <= 2 ? "✓ On Benchmark (≤2m)" : "⚠ Above Benchmark (>2m)"}
            </span>
          </Card>

          {/* Seated to First Order */}
          <Card className="p-3.5">
            <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground block">
              Seated &rarr; Food Order
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <strong className="text-2xl font-black text-foreground">{report.avgSeatedToOrderMinutes}</strong>
              <span className="text-xs text-muted-foreground">min</span>
            </div>
            <span className={`text-[10px] font-mono font-bold mt-1 block ${report.avgSeatedToOrderMinutes <= 8 ? "text-emerald-400" : "text-amber-400"}`}>
              {report.avgSeatedToOrderMinutes <= 8 ? "✓ On Benchmark (≤8m)" : "⚠ Above Benchmark (>8m)"}
            </span>
          </Card>

          {/* Kitchen Prep */}
          <Card className="p-3.5">
            <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground block">
              Avg Ticket Prep
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <strong className="text-2xl font-black text-foreground">{report.avgTicketPrepMinutes}</strong>
              <span className="text-xs text-muted-foreground">min</span>
            </div>
            <span className={`text-[10px] font-mono font-bold mt-1 block ${report.avgTicketPrepMinutes <= 14 ? "text-emerald-400" : "text-amber-400"}`}>
              {report.avgTicketPrepMinutes <= 14 ? "✓ On Benchmark (≤14m)" : "⚠ Line Delays Active"}
            </span>
          </Card>

          {/* Runner Lag */}
          <Card className="p-3.5">
            <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground block">
              Food Ready &rarr; Delivered
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <strong className="text-2xl font-black text-foreground">{report.avgFoodReadyToDeliveredMinutes}</strong>
              <span className="text-xs text-muted-foreground">min</span>
            </div>
            <span className={`text-[10px] font-mono font-bold mt-1 block ${report.avgFoodReadyToDeliveredMinutes <= 2 ? "text-emerald-400" : "text-amber-400"}`}>
              {report.avgFoodReadyToDeliveredMinutes <= 2 ? "✓ Fast Runner (≤2m)" : "⚠ Expo Heatlamp Lag"}
            </span>
          </Card>

          {/* Check to Payment */}
          <Card className="p-3.5">
            <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground block">
              Check &rarr; Settled
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <strong className="text-2xl font-black text-foreground">{report.avgCheckRequestToPaymentMinutes}</strong>
              <span className="text-xs text-muted-foreground">min</span>
            </div>
            <span className={`text-[10px] font-mono font-bold mt-1 block ${report.avgCheckRequestToPaymentMinutes <= 4 ? "text-emerald-400" : "text-amber-400"}`}>
              {report.avgCheckRequestToPaymentMinutes <= 4 ? "✓ Fast Payment (≤4m)" : "⚠ Delayed Settlement"}
            </span>
          </Card>

          {/* Table Turn Duration */}
          <Card className="p-3.5">
            <span className="text-[10px] font-mono font-bold uppercase text-muted-foreground block">
              Avg Table Turn
            </span>
            <div className="mt-1 flex items-baseline gap-1">
              <strong className="text-2xl font-black text-foreground">{report.avgTableTurnMinutes}</strong>
              <span className="text-xs text-muted-foreground">min</span>
            </div>
            <span className="text-[10px] font-mono font-bold text-muted-foreground mt-1 block">
              Total Guest Lifecycle
            </span>
          </Card>
        </div>
      </div>

      {/* -------------------------------------------------------------------------
          SECTION 2: KITCHEN STATION PREP & BOTTLENECK ANALYSIS
         ------------------------------------------------------------------------- */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-black text-foreground flex items-center gap-2">
            <ChefHat className="size-4 text-amber-400" />
            Kitchen Station Production & Bottleneck Analysis
          </h2>
          <span className="font-mono text-[10px] text-muted-foreground uppercase">
            {report.totalDelayedTicketsCount} total delayed ticket(s) ({report.delayedTicketRatePercent}%)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {report.stations.map((st) => (
            <Card
              key={st.stationId}
              className={`p-4 ${
                st.bottleneckScore === "bottleneck"
                  ? "border-rose-500/50 bg-rose-500/10"
                  : st.bottleneckScore === "moderate"
                  ? "border-amber-500/40 bg-amber-500/5"
                  : ""
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <strong className="text-sm font-black text-foreground">{st.stationName}</strong>
                  <span className="text-[10px] font-mono text-muted-foreground block">
                    {st.totalTicketsCount} tickets completed / in prep
                  </span>
                </div>

                <Badge
                  className={`font-mono text-[9px] uppercase ${
                    st.bottleneckScore === "bottleneck"
                      ? "bg-rose-500 text-white"
                      : st.bottleneckScore === "moderate"
                      ? "bg-amber-500 text-black"
                      : "bg-secondary text-foreground"
                  }`}
                >
                  {st.bottleneckScore}
                </Badge>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-xs bg-secondary/30 rounded-lg p-2 font-mono">
                <div>
                  <span className="text-[9px] text-muted-foreground block">Avg Cook Time</span>
                  <strong className="text-foreground">{st.avgPrepMinutes}m</strong>
                </div>
                <div>
                  <span className="text-[9px] text-muted-foreground block">Delayed Rate</span>
                  <strong className={st.delayedPercent > 0 ? "text-rose-400" : "text-emerald-400"}>
                    {st.delayedPercent}%
                  </strong>
                </div>
              </div>

              <div className="mt-2 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Runner Delivery Lag</span>
                <span className="font-mono font-bold text-foreground">{st.avgReadyToDeliveredMinutes}m</span>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* -------------------------------------------------------------------------
          SECTION 3: REQUEST RESOLUTION VELOCITY & FRICTION
         ------------------------------------------------------------------------- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Request Frequency Breakdown */}
        <Card className="p-4 space-y-3">
          <CardHeader className="p-0 pb-1">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <TrendingUp className="size-4 text-cyan-400" />
              Guest & Staff Request Frequency & Resolution
            </h3>
            <p className="text-xs text-muted-foreground">
              Breakdown of guest needs and average minutes to full resolution.
            </p>
          </CardHeader>
          <CardContent className="p-0 space-y-2">
            {report.requestTypeBreakdown.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-xs">
                No guest requests recorded in this filter period.
              </div>
            ) : (
              report.requestTypeBreakdown.map((req) => (
                <div key={req.category} className="flex items-center justify-between border-b border-border/60 pb-2 last:border-0 last:pb-0 text-xs">
                  <div>
                    <strong className="text-foreground font-bold">{req.category}</strong>
                    <span className="text-muted-foreground ml-2 font-mono text-[11px]">
                      {req.count} reqs ({req.percentOfTotal}%)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-muted-foreground text-[10px]">Avg Response:</span>
                    <strong className={req.avgResolutionMinutes > 5 ? "text-amber-400" : "text-foreground"}>
                      {req.avgResolutionMinutes}m
                    </strong>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Quality & Execution Friction Rates */}
        <Card className="p-4 space-y-3">
          <CardHeader className="p-0 pb-1">
            <h3 className="text-sm font-bold text-foreground flex items-center gap-1.5">
              <Ban className="size-4 text-rose-400" />
              Quality, Voids & Food Remake Rates
            </h3>
            <p className="text-xs text-muted-foreground">
              Direct measures of kitchen execution consistency and order entry accuracy.
            </p>
          </CardHeader>
          <CardContent className="p-0 space-y-3">
            <div className="rounded-xl border p-3 bg-secondary/30 flex items-center justify-between">
              <div>
                <strong className="text-xs text-foreground block">Item Void Rate</strong>
                <span className="text-[10px] text-muted-foreground">
                  {report.totalVoidedItemsCount} items voided due to mistakes/waste
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-foreground font-mono">{report.voidRatePercent}%</span>
                <span className="text-[10px] block text-muted-foreground">Target: &lt;1.5%</span>
              </div>
            </div>

            <div className="rounded-xl border p-3 bg-secondary/30 flex items-center justify-between">
              <div>
                <strong className="text-xs text-foreground block">Food Quality / Remake Rate</strong>
                <span className="text-[10px] text-muted-foreground">
                  {report.totalFoodIssuesCount} reported issues requiring manager intervention
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-black text-rose-400 font-mono">{report.foodIssueRatePercent}%</span>
                <span className="text-[10px] block text-muted-foreground">Target: &lt;2.0%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* -------------------------------------------------------------------------
          SECTION 4: CONTEXTUAL SERVER LOAD & COMPARISON
         ------------------------------------------------------------------------- */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-base font-black text-foreground flex items-center gap-2">
              <Users className="size-4 text-primary" />
              Contextual Server Performance (Zero Punitive Misranking)
            </h2>
            <p className="text-xs text-muted-foreground">
              Metrics are evaluated alongside party size and meal complexity to prevent misleading comparisons.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {report.servers.map((srv) => (
            <Card key={srv.serverId} className="p-4 space-y-2.5">
              <div className="flex items-start justify-between">
                <div>
                  <strong className="text-sm font-black text-foreground">{srv.serverName}</strong>
                  <span className="text-[10px] font-mono text-muted-foreground block">
                    {srv.totalTablesServed} tables · {srv.totalGuestsServed} guests (Avg Party: {srv.avgPartySize})
                  </span>
                </div>

                <Badge className="font-mono text-[9px] bg-secondary">
                  {srv.totalRequestsHandled} requests
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-1 text-center font-mono py-1.5 bg-secondary/30 rounded-lg text-xs">
                <div>
                  <span className="text-[9px] text-muted-foreground block">Avg Greet</span>
                  <strong className="text-foreground">{srv.avgGreetMinutes}m</strong>
                </div>
                <div>
                  <span className="text-[9px] text-muted-foreground block">Avg Turn</span>
                  <strong className="text-foreground">{srv.avgTurnMinutes}m</strong>
                </div>
                <div>
                  <span className="text-[9px] text-muted-foreground block">Avg Req</span>
                  <strong className="text-foreground">{srv.avgRequestResponseMinutes}m</strong>
                </div>
              </div>

              <p className="text-[10px] font-semibold text-primary italic">
                Context: {srv.contextNote}
              </p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
