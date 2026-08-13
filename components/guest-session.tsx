"use client";
import { useState } from "react";
import Link from "next/link";
import { Bell, Check, Pizza } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function GuestSession({ code }: { code: string }) {
  const [proposed, setProposed] = useState(false);
  const [help, setHelp] = useState(false);
  return <main className="mx-auto min-h-screen max-w-lg p-4 pb-12"><header className="mb-8 flex items-center justify-between py-3"><div><strong className="text-xl">SIC PIZZA</strong><p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Guest mode · no account</p></div><Badge>{code}</Badge></header><Badge>Table 11 · Joined</Badge><h1 className="mt-3 text-4xl font-black tracking-tight">Welcome to the group project.</h1><p className="mt-2 text-muted-foreground">Browse, propose, request help, watch the kitchen, and pay. Your server still has the keys.</p><Card className="mt-7"><CardHeader><div className="flex items-center gap-3"><Pizza className="size-6 text-primary" /><div><h2 className="font-black">Pineapple witness protection</h2><p className="text-sm text-muted-foreground">Small · pineapple · extra cheese · $17.50</p></div></div></CardHeader><CardContent>{proposed ? <div className="flex items-center gap-2 rounded-xl bg-primary/10 p-4 text-sm font-bold text-primary"><Check className="size-4" />Proposed · waiting for server confirmation</div> : <Button size="lg" className="w-full" onClick={() => setProposed(true)}>Propose this pizza</Button>}</CardContent></Card><Card className="mt-4"><CardContent className="pt-5"><div className="flex items-center justify-between"><div><strong>Order status</strong><p className="text-sm text-muted-foreground">Kitchen queue · running total $26.86</p></div><Badge>Submitted</Badge></div></CardContent></Card><Button variant="secondary" size="lg" className="mt-4 w-full" onClick={() => setHelp(true)}><Bell className="size-4" />{help ? "Server notified" : "Request assistance"}</Button><p className="mt-6 text-xs leading-5 text-muted-foreground">Allergen information and payment errors use clear, neutral language. Ask your server before ordering if you have a food allergy.</p><Link href="/" className="mt-8 block text-center text-sm font-bold text-primary underline">Return to staff prototype</Link></main>;
}
