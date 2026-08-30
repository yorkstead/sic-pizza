"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, AlertCircle } from "lucide-react";
import { GuestSessionApp } from "./guest/guest-session-app";
import {
  InMemoryTableSessionRepository,
  TableSessionService,
  projectTableSession,
  validateRotatingQRToken,
  type TableSession,
  type TableSessionProjection
} from "@/lib/domain";

export function GuestSession({ code }: { code: string }) {
  const repo = useMemo(() => new InMemoryTableSessionRepository(), []);
  const service = useMemo(() => new TableSessionService(repo), [repo]);

  const [session, setSession] = useState<TableSession | null>(null);
  const [projection, setProjection] = useState<TableSessionProjection | null>(null);
  const [loading, setLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);

  useEffect(() => {
    async function initGuestSession() {
      try {
        // If code is a base64url rotating token, validate it safely
        if (code.length > 20 && !code.startsWith("SIC-")) {
          const validation = validateRotatingQRToken(code, "sess_11");
          if (!validation.valid) {
            setTokenError(validation.reason || "Invalid QR code credentials");
            setLoading(false);
            return;
          }
        }

        // Initialize / seed demo session for Table 11
        const { session: s11 } = await service.openTableSession({
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

        // Seed some items
        await service.addItem("sess_11", {
          menuItemId: "pizza_pep",
          name: "Large Pepperoni Hot Honey Pizza",
          course: "mains",
          stationId: "pizza",
          basePriceCents: 2400,
          selectedModifiers: [
            {
              modifierOptionId: "mod_hot_honey",
              name: "Hot Honey Drizzle",
              level: "NORMAL",
              placement: "WHOLE",
              priceCents: 200
            }
          ],
          splitMode: "whole_table",
          assignedDinerIds: s11.diners.map((d) => d.id)
        });

        // Seed a proposed item from guest
        await service.proposeItem("sess_11", {
          menuItemId: "starter_garlic_knots",
          name: "Garlic Parmesan Knots (6pc)",
          course: "starters",
          stationId: "pizza",
          basePriceCents: 800,
          quantity: 1,
          selectedModifiers: [],
          dinerId: s11.diners[0].id,
          splitMode: "single",
          assignedDinerIds: [s11.diners[0].id]
        });

        const currentSession = (await repo.findById("sess_11"))!;
        setSession(currentSession);
        setProjection(projectTableSession(currentSession));
      } catch (err) {
        console.error("Failed to init guest session:", err);
      } finally {
        setLoading(false);
      }
    }

    initGuestSession();
  }, [code, repo, service]);

  if (loading) {
    return (
      <main className="mx-auto min-h-screen max-w-lg p-6 flex flex-col items-center justify-center text-center space-y-3">
        <div className="grid size-12 animate-spin place-items-center rounded-full border-4 border-primary border-t-transparent" />
        <p className="text-xs font-mono font-bold text-muted-foreground uppercase tracking-widest">
          Connecting to Table 11...
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
        <h1 className="text-xl font-black text-foreground">QR Code Expired</h1>
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
        const res = await service.proposeItem(session.id, itemData, {
          actorType: "guest",
          actorId: itemData.dinerId
        });
        setSession({ ...res.session });
        setProjection({ ...res.projection });
      }}
      onCreateRequest={async (category, description, dinerId) => {
        const res = await service.createGuestRequest(session.id, category, description, dinerId, {
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
        const res = await service.processDinerPayment(session.id, dinerId, amountCents, tipCents, "mock_card_token", {
          actorType: "guest",
          actorId: dinerId
        });
        setSession({ ...res.session });
        setProjection({ ...res.projection });
      }}
    />
  );
}
