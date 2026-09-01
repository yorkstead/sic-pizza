"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { GuestSessionApp } from "./guest/guest-session-app";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  projectTableSession,
  type TableSession,
  type TableSessionProjection
} from "@/lib/domain";

export function GuestSession({ code }: { code: string }) {
  const [session, setSession] = useState<TableSession | null>(null);
  const [projection, setProjection] = useState<TableSessionProjection | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  // In-memory fallback service for offline/isolated demo testing
  const fallbackRepo = useMemo(() => new InMemoryTableSessionRepository(), []);
  const fallbackService = useMemo(() => new TableSessionService(fallbackRepo), [fallbackRepo]);

  const fetchLiveSession = useCallback(async (token: string) => {
    try {
      const res = await fetch("/api/guest/session", {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSession(data.session);
        setProjection(data.projection);
      }
    } catch {
      // Ignore background refresh errors
    }
  }, []);

  useEffect(() => {
    async function initGuestSession() {
      try {
        setLoading(true);
        setTokenError(null);

        // 1. Attempt genuine server join
        const response = await fetch("/api/guest/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tokenOrCode: code, dinerName: "Guest" })
        });

        if (response.ok) {
          const data = await response.json();
          setGuestToken(data.guestToken);
          setSession(data.session);
          setProjection(data.projection);
          setLoading(false);
          return;
        }

        const errData = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 404) {
          setTokenError(errData.error || "Invalid or expired table QR code.");
          setLoading(false);
          return;
        }

        // 2. Fallback to local in-memory initialization if API is unreachable
        const { session: s11 } = await fallbackService.openTableSession({
          id: "sess_11",
          restaurantId: "sic_pizza_org",
          locationId: "loc_downtown",
          tableId: "tbl_11",
          tableLabel: "Table 11",
          diningAreaId: "area_main",
          openedByEmployeeId: "emp_jordan",
          assignedServerId: "emp_jordan",
          initialDiners: ["Alex", "Sam"]
        });

        const currentSession = (await fallbackRepo.findById("sess_11")) || s11;
        setSession(currentSession);
        setProjection(projectTableSession(currentSession));
      } catch (err) {
        console.error("Failed to initialize guest session:", err);
        setTokenError("Unable to connect to table session. Please scan the QR code again.");
      } finally {
        setLoading(false);
      }
    }

    initGuestSession();
  }, [code, fallbackRepo, fallbackService]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-lg p-6 flex flex-col items-center justify-center text-center space-y-3">
        <div className="grid size-12 animate-spin place-items-center rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest">
          Connecting to Table...
        </p>
      </main>
    );
  }

  if (tokenError) {
    return (
      <main className="mx-auto min-h-screen max-w-lg p-6 flex flex-col items-center justify-center text-center space-y-4">
        <div className="size-12 rounded-2xl bg-rose-500/20 text-rose-400 grid place-items-center">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-xl font-black text-foreground">Table Session Notice</h1>
        <p className="text-xs text-muted-foreground max-w-xs">{tokenError}</p>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to Server Floor
        </Link>
      </main>
    );
  }

  if (!session || !projection) {
    return null;
  }

  return (
    <GuestSessionApp
      initialSession={session}
      initialProjection={projection}
      onProposeItem={async (itemData) => {
        if (guestToken) {
          const res = await fetch("/api/guest/actions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${guestToken}`
            },
            body: JSON.stringify({ action: "propose_item", payload: itemData })
          });
          if (res.ok) {
            await fetchLiveSession(guestToken);
            return;
          }
        }

        const res = await fallbackService.proposeItem(session.id, itemData, {
          actorType: "guest",
          actorId: itemData.dinerId
        });
        setSession({ ...res.session });
        setProjection({ ...res.projection });
      }}
      onCreateRequest={async (category, description, dinerId) => {
        if (guestToken) {
          const res = await fetch("/api/guest/actions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${guestToken}`
            },
            body: JSON.stringify({
              action: "create_request",
              payload: { category, description }
            })
          });
          if (res.ok) {
            await fetchLiveSession(guestToken);
            return;
          }
        }

        const res = await fallbackService.createGuestRequest(session.id, category, description, dinerId, {
          actorType: "guest",
          actorId: dinerId
        });
        setSession({ ...res.session });
        setProjection({ ...res.projection });
      }}
      onProcessDinerPayment={async (dinerId, tipPercent) => {
        const bill = projection.dinerBills.find((b) => b.dinerId === dinerId);
        const amountCents = (bill?.subtotalCents || 0) + (bill?.taxCents || 0);
        const tipCents = Math.round(((bill?.subtotalCents || 0) * tipPercent) / 100);

        if (guestToken) {
          const res = await fetch("/api/guest/actions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${guestToken}`
            },
            body: JSON.stringify({
              action: "process_payment",
              payload: { amountCents, tipCents, paymentMethodId: "mock_card_token" }
            })
          });
          if (res.ok) {
            await fetchLiveSession(guestToken);
            return;
          }
        }

        const res = await fallbackService.processDinerPayment(session.id, dinerId, amountCents, tipCents, "mock_card_token", {
          actorType: "guest",
          actorId: dinerId
        });
        setSession({ ...res.session });
        setProjection({ ...res.projection });
      }}
    />
  );
}

