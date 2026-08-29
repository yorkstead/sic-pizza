"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Bell, Check, Pizza, ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function GuestSession({ code }: { code: string }) {
  const [proposed, setProposed] = useState(false);
  const [help, setHelp] = useState(false);

  return (
    <main className="mx-auto min-h-screen max-w-lg p-4 pb-12">
      <header className="mb-6 flex items-center justify-between border-b pb-3">
        <div className="flex items-center gap-2">
          <div className="grid size-8 rotate-[-4deg] place-items-center rounded-lg bg-primary font-black text-xs text-primary-foreground">
            SIC
          </div>
          <div>
            <strong className="block text-sm font-black leading-4">SIC PIZZA</strong>
            <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
              Guest Session · Table 11
            </p>
          </div>
        </div>
        <Badge className="font-mono">{code}</Badge>
      </header>

      <div>
        <Badge>Connected to Table Session</Badge>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground">
          Table 11 Menu & Ordering
        </h1>
        <p className="mt-1.5 text-xs text-muted-foreground leading-5">
          Propose items to the table order, track kitchen preparation, and call staff directly from your phone.
        </p>
      </div>

      {/* Featured Pizza Proposal */}
      <Card className="mt-6">
        <CardHeader className="pb-3">
          <div className="flex items-start gap-3">
            <Pizza className="size-6 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="font-black text-foreground text-base">Small Hot Honey Pineapple Pizza</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Fresh dough, crushed tomato, mozzarella, pineapple, extra cheese · $17.50
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {proposed ? (
            <div className="flex items-center gap-2 rounded-xl bg-primary/10 p-3.5 text-xs font-bold text-primary">
              <Check className="size-4 shrink-0" />
              Proposed to server · waiting for tableside approval
            </div>
          ) : (
            <Button size="lg" className="w-full text-sm" onClick={() => setProposed(true)}>
              Propose This Pizza to Table
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Live Table Progress Card */}
      <Card className="mt-4">
        <CardContent className="pt-5">
          <div className="flex items-center justify-between">
            <div>
              <strong className="block text-sm text-foreground">Kitchen Status</strong>
              <p className="text-xs text-muted-foreground">
                In Preparation · 2 items queued
              </p>
            </div>
            <Badge className="border-amber-500/40 bg-amber-500/20 text-amber-300">
              In Prep
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Assistance Button */}
      <Button
        variant="secondary"
        size="lg"
        className="mt-4 w-full text-sm"
        onClick={() => setHelp(true)}
      >
        <Bell className="size-4" />
        {help ? "Server Notified · Staff on the way" : "Request Server Assistance"}
      </Button>

      <div className="mt-6 rounded-xl border bg-secondary/30 p-3 text-[11px] text-muted-foreground leading-5">
        <strong className="block text-foreground font-semibold">Dietary & Allergen Notice:</strong>
        All allergen information uses neutral, factual standards. Please inform your server of any severe allergies before ordering.
      </div>

      <Link
        href="/"
        className="mt-8 flex items-center justify-center gap-1 text-xs font-bold text-primary underline"
      >
        <ArrowLeft className="size-3.5" />
        Return to Server Terminal
      </Link>
    </main>
  );
}
