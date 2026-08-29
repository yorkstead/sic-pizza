import React, { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  Droplets,
  Filter,
  Flame,
  HelpCircle,
  PackageSearch,
  Plus,
  Search,
  UserCheck,
  Users,
  Utensils,
  Wine,
  X
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type {
  GuestRequest,
  RequestCategory,
  RequestPriority
} from "@/lib/domain/models/request";
import {
  deriveRequestAgeMinutes,
  deriveRequestEscalation
} from "@/lib/domain/models/request";

interface AttentionQueueProps {
  requests: GuestRequest[];
  currentEmployeeId: string;
  currentEmployeeRole: "server" | "runner" | "bartender" | "expo" | "manager";
  onAcknowledgeRequest: (sessionId: string, requestId: string) => void;
  onClaimRequest: (sessionId: string, requestId: string, employeeId: string) => void;
  onStartRequest: (sessionId: string, requestId: string, employeeId: string) => void;
  onCompleteRequest: (sessionId: string, requestId: string) => void;
  onCancelRequest: (sessionId: string, requestId: string, reason: string) => void;
  onOpenCreateDialog: () => void;
  onSelectTable?: (tableId: string) => void;
}

const CATEGORY_ICONS: Record<RequestCategory, React.ComponentType<{ className?: string }>> = {
  SERVER_NEEDED: Bell,
  DRINK_REORDER: Wine,
  REFILL: Droplets,
  CONDIMENT: Utensils,
  TO_GO_BOX: Utensils,
  UTENSILS: Utensils,
  CHECK: CreditCard,
  MISSING_ITEM: PackageSearch,
  FOOD_ISSUE: AlertTriangle,
  OTHER: HelpCircle
};

export function AttentionQueue({
  requests,
  currentEmployeeId,
  currentEmployeeRole,
  onAcknowledgeRequest,
  onClaimRequest,
  onStartRequest,
  onCompleteRequest,
  onCancelRequest,
  onOpenCreateDialog,
  onSelectTable
}: AttentionQueueProps) {
  const [viewScope, setViewScope] = useState<"inbox" | "manager" | "all">("inbox");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [cancellingRequestId, setCancellingRequestId] = useState<{
    sessionId: string;
    requestId: string;
    category: string;
  } | null>(null);
  const [cancelReason, setCancelReason] = useState("");

  const activeRequests = requests.filter(
    (r) => r.status !== "COMPLETED" && r.status !== "CANCELLED"
  );

  const overdueRequests = activeRequests.filter((r) => {
    const esc = deriveRequestEscalation(r);
    return esc === "OVERDUE" || esc === "ESCALATED";
  });

  const filteredRequests = requests.filter((req) => {
    // Text search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTable = req.tableLabel.toLowerCase().includes(q);
      const matchCategory = req.category.toLowerCase().includes(q);
      const matchDiner = req.dinerName?.toLowerCase().includes(q);
      const matchDesc = req.description?.toLowerCase().includes(q);
      if (!matchTable && !matchCategory && !matchDiner && !matchDesc) return false;
    }

    // Role filter
    if (roleFilter !== "all" && req.assignedRole !== roleFilter) return false;

    // Priority filter
    if (priorityFilter !== "all" && req.priority !== priorityFilter) return false;

    // View scope filter
    if (viewScope === "inbox") {
      // Show requests assigned to current user, or unassigned requests matching current user's role
      const isAssignedToMe = req.assignedEmployeeId === currentEmployeeId;
      const isBroadcastForMyRole = !req.assignedEmployeeId && (req.assignedRole === currentEmployeeRole || currentEmployeeRole === "manager");
      return (
        (isAssignedToMe || isBroadcastForMyRole) &&
        req.status !== "COMPLETED" &&
        req.status !== "CANCELLED"
      );
    }

    if (viewScope === "manager") {
      // Show all active requests
      return req.status !== "COMPLETED" && req.status !== "CANCELLED";
    }

    return true;
  });

  // Sort: Priority (URGENT > HIGH > NORMAL > LOW) -> Escalation -> Age (Oldest first)
  const priorityRank: Record<RequestPriority, number> = {
    URGENT: 4,
    HIGH: 3,
    NORMAL: 2,
    LOW: 1
  };

  const sortedRequests = [...filteredRequests].sort((a, b) => {
    // Closed requests at the bottom
    const aClosed = a.status === "COMPLETED" || a.status === "CANCELLED" ? 1 : 0;
    const bClosed = b.status === "COMPLETED" || b.status === "CANCELLED" ? 1 : 0;
    if (aClosed !== bClosed) return aClosed - bClosed;

    const aRank = priorityRank[a.priority] || 1;
    const bRank = priorityRank[b.priority] || 1;
    if (bRank !== aRank) return bRank - aRank;

    const aAge = deriveRequestAgeMinutes(a.createdAt);
    const bAge = deriveRequestAgeMinutes(b.createdAt);
    return bAge - aAge;
  });

  function handleCancelSubmit() {
    if (!cancellingRequestId) return;
    onCancelRequest(cancellingRequestId.sessionId, cancellingRequestId.requestId, cancelReason || "Cancelled by staff");
    setCancellingRequestId(null);
    setCancelReason("");
  }

  return (
    <div className="space-y-5 pb-16">
      {/* Header & Title */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="font-mono text-xs font-bold uppercase tracking-widest text-primary">
            Universal Operations Queue
          </span>
          <h1 className="mt-0.5 text-2xl font-black tracking-tight sm:text-3xl">
            Staff Attention Queue
          </h1>
          <p className="mt-1 text-xs text-muted-foreground">
            What needs attention, who owns it, and how long has it been waiting.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button size="default" onClick={onOpenCreateDialog}>
            <Plus className="size-4 mr-1" />
            New Table Request
          </Button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-3.5 border-l-4 border-l-primary">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">
            Active Requests
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">{activeRequests.length}</span>
            <Bell className="size-4 text-primary" />
          </div>
        </Card>

        <Card className={`p-3.5 border-l-4 ${overdueRequests.length > 0 ? "border-l-destructive bg-destructive/10" : "border-l-border"}`}>
          <span className="text-[11px] font-bold uppercase text-muted-foreground">
            Overdue / Escalated
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className={`text-2xl font-black ${overdueRequests.length > 0 ? "text-destructive" : "text-foreground"}`}>
              {overdueRequests.length}
            </span>
            <AlertCircle className={`size-4 ${overdueRequests.length > 0 ? "text-destructive" : "text-muted-foreground"}`} />
          </div>
        </Card>

        <Card className="p-3.5 border-l-4 border-l-amber-500">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">
            My Queue
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-foreground">
              {
                activeRequests.filter(
                  (r) =>
                    r.assignedEmployeeId === currentEmployeeId ||
                    (!r.assignedEmployeeId && r.assignedRole === currentEmployeeRole)
                ).length
              }
            </span>
            <UserCheck className="size-4 text-amber-400" />
          </div>
        </Card>

        <Card className="p-3.5 border-l-4 border-l-emerald-500">
          <span className="text-[11px] font-bold uppercase text-muted-foreground">
            Completed Today
          </span>
          <div className="mt-1 flex items-baseline justify-between">
            <span className="text-2xl font-black text-emerald-400">
              {requests.filter((r) => r.status === "COMPLETED").length}
            </span>
            <CheckCircle2 className="size-4 text-emerald-400" />
          </div>
        </Card>
      </div>

      {/* Scope and Filter Tabs */}
      <div className="space-y-3 border-b pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Main Scope Tabs */}
          <div className="flex gap-1.5 font-mono text-xs font-bold uppercase">
            <Button
              size="default"
              variant={viewScope === "inbox" ? "default" : "secondary"}
              onClick={() => setViewScope("inbox")}
            >
              My Attention Inbox ({
                activeRequests.filter(
                  (r) =>
                    r.assignedEmployeeId === currentEmployeeId ||
                    (!r.assignedEmployeeId && r.assignedRole === currentEmployeeRole)
                ).length
              })
            </Button>
            <Button
              size="default"
              variant={viewScope === "manager" ? "default" : "secondary"}
              onClick={() => setViewScope("manager")}
            >
              Floor-Wide Live ({activeRequests.length})
            </Button>
            <Button
              size="default"
              variant={viewScope === "all" ? "default" : "secondary"}
              onClick={() => setViewScope("all")}
            >
              All History ({requests.length})
            </Button>
          </div>

          {/* Search Box */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Filter tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-9 w-full rounded-xl border bg-card pl-8 pr-3 text-xs focus:outline-hidden focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Secondary Filters: Role & Priority */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-bold flex items-center gap-1">
              <Filter className="size-3" />
              Role:
            </span>
            {["all", "server", "runner", "expo", "manager", "bartender"].map((role) => (
              <button
                key={role}
                onClick={() => setRoleFilter(role)}
                className={`rounded px-2 py-0.5 capitalize transition ${
                  roleFilter === role
                    ? "bg-primary text-primary-foreground font-bold"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {role}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5">
            <span className="font-bold">Priority:</span>
            {["all", "URGENT", "HIGH", "NORMAL", "LOW"].map((p) => (
              <button
                key={p}
                onClick={() => setPriorityFilter(p)}
                className={`rounded px-1.5 py-0.5 text-[11px] font-mono font-bold transition ${
                  priorityFilter === p
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:text-foreground"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Requests Stream */}
      {sortedRequests.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <CheckCircle2 className="mx-auto size-10 text-emerald-400 opacity-60" />
            <h3 className="mt-3 text-base font-bold text-foreground">
              Queue is completely clear!
            </h3>
            <p className="mt-1 text-xs">
              No outstanding operational tasks matching your current view filter.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {sortedRequests.map((req) => {
            const ageMinutes = deriveRequestAgeMinutes(req.createdAt, req.completedAt);
            const escalation = deriveRequestEscalation(req);
            const Icon = CATEGORY_ICONS[req.category] || HelpCircle;
            const isAssignedToMe = req.assignedEmployeeId === currentEmployeeId;
            const isOpen = req.status === "OPEN";
            const isAck = req.status === "ACKNOWLEDGED";
            const isInPrep = req.status === "IN_PROGRESS";
            const isComplete = req.status === "COMPLETED";
            const isCancelled = req.status === "CANCELLED";

            return (
              <Card
                key={req.id}
                className={`overflow-hidden border-2 transition ${
                  escalation === "ESCALATED"
                    ? "border-destructive/80 bg-destructive/10 shadow-[0_0_15px_rgba(239,68,68,0.2)]"
                    : escalation === "OVERDUE"
                    ? "border-amber-500/70 bg-amber-950/15"
                    : req.priority === "URGENT"
                    ? "border-destructive/50 bg-card"
                    : req.priority === "HIGH"
                    ? "border-amber-500/40 bg-card"
                    : isComplete || isCancelled
                    ? "opacity-60 border-border/60 bg-card/50"
                    : "border-border bg-card"
                }`}
              >
                {/* Urgent top accent bar if escalated or urgent */}
                {(escalation === "ESCALATED" || req.priority === "URGENT") && !isComplete && (
                  <div className="h-1 w-full bg-gradient-to-r from-red-500 to-amber-500 animate-pulse" />
                )}

                <CardContent className="p-4 sm:p-5">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    {/* Left: Table info, Category & Details */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Table badge with jump link */}
                        <button
                          onClick={() => onSelectTable?.(req.tableId)}
                          className="font-black text-sm text-foreground hover:text-primary transition underline decoration-dotted"
                          title="Open table session"
                        >
                          {req.tableLabel}
                        </button>

                        {req.diningAreaName && (
                          <span className="text-xs text-muted-foreground">
                            · {req.diningAreaName}
                          </span>
                        )}

                        {req.dinerName && (
                          <Badge className="text-[10px]">
                            {req.dinerName}
                          </Badge>
                        )}

                        {/* Priority Badge */}
                        <Badge
                          className={
                            req.priority === "URGENT"
                              ? "border-destructive bg-destructive/20 text-destructive-foreground font-black animate-pulse"
                              : req.priority === "HIGH"
                              ? "border-amber-500 bg-amber-500/20 text-amber-300 font-bold"
                              : "text-muted-foreground"
                          }
                        >
                          {req.priority}
                        </Badge>

                        {/* Escalation Pill */}
                        {escalation === "ESCALATED" && (
                          <Badge className="border-red-500 bg-red-600 text-white font-black animate-bounce">
                            🚨 ESCALATED (MANAGER)
                          </Badge>
                        )}
                        {escalation === "OVERDUE" && (
                          <Badge className="border-amber-500 bg-amber-500/30 text-amber-200 font-bold">
                            ⚠️ OVERDUE
                          </Badge>
                        )}
                      </div>

                      {/* Category and Description */}
                      <div className="flex items-start gap-2.5 pt-1">
                        <div className="mt-0.5 rounded-lg bg-secondary p-1.5 text-primary">
                          <Icon className="size-4" />
                        </div>
                        <div>
                          <strong className="block text-sm font-bold text-foreground capitalize">
                            {req.category.replace(/_/g, " ")}
                          </strong>
                          {req.description && (
                            <p className="text-xs text-foreground/90 mt-0.5">
                              {req.description}
                            </p>
                          )}
                          {req.notes && req.notes !== req.description && (
                            <p className="text-xs italic text-muted-foreground mt-0.5">
                              &ldquo;{req.notes}&rdquo;
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Ownership & Age metadata */}
                      <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-muted-foreground">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="size-3" />
                          {isComplete ? `Completed in ${ageMinutes}m` : `${ageMinutes}m waiting`}
                        </span>

                        <span className="flex items-center gap-1">
                          <Users className="size-3" />
                          Role: <strong className="text-foreground capitalize">{req.assignedRole}</strong>
                        </span>

                        <span>
                          Owner:{" "}
                          <strong className={isAssignedToMe ? "text-primary font-bold" : "text-foreground"}>
                            {isAssignedToMe ? "You" : req.assignedEmployeeId || "Unclaimed"}
                          </strong>
                        </span>

                        <Badge className="text-[10px] uppercase font-mono">
                          {req.status}
                        </Badge>
                      </div>
                    </div>

                    {/* Right: Operational Interactive Action Buttons */}
                    {!isComplete && !isCancelled && (
                      <div className="flex flex-wrap sm:flex-col items-end gap-1.5 pt-2 sm:pt-0 shrink-0">
                        {isOpen && (
                          <>
                            <Button
                              size="default"
                              variant="secondary"
                              className="h-8 text-xs"
                              onClick={() => onAcknowledgeRequest(req.sessionId, req.id)}
                            >
                              <Check className="size-3.5 mr-1" />
                              Acknowledge
                            </Button>
                            <Button
                              size="default"
                              className="h-8 text-xs"
                              onClick={() => onClaimRequest(req.sessionId, req.id, currentEmployeeId)}
                            >
                              <UserCheck className="size-3.5 mr-1" />
                              Claim & Handle
                            </Button>
                          </>
                        )}

                        {isAck && (
                          <Button
                            size="default"
                            className="h-8 text-xs"
                            onClick={() => onStartRequest(req.sessionId, req.id, currentEmployeeId)}
                          >
                            <Flame className="size-3.5 mr-1" />
                            Start Work
                          </Button>
                        )}

                        {(isOpen || isAck || isInPrep) && (
                          <Button
                            size="default"
                            variant="default"
                            className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white"
                            onClick={() => onCompleteRequest(req.sessionId, req.id)}
                          >
                            <CheckCircle2 className="size-3.5 mr-1" />
                            Complete
                          </Button>
                        )}

                        <Button
                          variant="ghost"
                          size="default"
                          className="h-8 text-xs text-muted-foreground hover:text-destructive"
                          onClick={() =>
                            setCancellingRequestId({
                              sessionId: req.sessionId,
                              requestId: req.id,
                              category: req.category
                            })
                          }
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Cancellation Reason Modal */}
      {cancellingRequestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-2">
              <h3 className="font-bold text-foreground text-base">Cancel Request</h3>
              <button
                onClick={() => setCancellingRequestId(null)}
                className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>

            <p className="text-xs text-muted-foreground">
              Cancelling <strong className="text-foreground">{cancellingRequestId.category}</strong>. Provide an operational reason:
            </p>

            <textarea
              rows={2}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Guest changed mind, duplicate request..."
              className="w-full rounded-xl border bg-background p-3 text-xs focus:outline-hidden focus:ring-2 focus:ring-primary"
              autoFocus
            />

            <div className="flex gap-2">
              <Button
                variant="secondary"
                className="flex-1 text-xs"
                onClick={() => setCancellingRequestId(null)}
              >
                Close
              </Button>
              <Button
                variant="danger"
                className="flex-1 text-xs"
                onClick={handleCancelSubmit}
              >
                Confirm Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
