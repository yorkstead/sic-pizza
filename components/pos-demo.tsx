"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChefHat, Clock3, CreditCard, History, LogOut, Pizza, QrCode, Store, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { money } from "@/lib/utils";
import { pricePizza, TOPPINGS, transitionOrder, type OrderStatus, type PizzaSelection } from "@/lib/domain/order";
import { voice, type VoiceTone } from "@/lib/domain/voice";

type View = "floor" | "order" | "kds" | "join" | "pay" | "history";
type Audit = { id: number; at: string; actor: string; action: string; detail: string };
type Item = { id: number; diner: string; pizza: PizzaSelection; cents: number; source: "server" | "guest"; confirmed: boolean };

const tables = [
  { id: 11, seats: 4, state: "open" }, { id: 12, seats: 2, state: "available" }, { id: 14, seats: 6, state: "available" },
  { id: 20, seats: 4, state: "check" }, { id: 21, seats: 2, state: "available" }, { id: 22, seats: 8, state: "available" }
] as const;
const nextStatus: Partial<Record<OrderStatus, OrderStatus>> = { submitted: "making", making: "ready", ready: "served" };
const statusCopy: Record<OrderStatus, string> = { draft: "Building", submitted: "Kitchen queue", making: "Being made", ready: "Ready for pickup", served: "Served", paid: "Paid" };

export function PosDemo() {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [view, setView] = useState<View>("floor");
  const [table, setTable] = useState(11);
  const [diners, setDiners] = useState(["Alex", "Sam"]);
  const [tone, setTone] = useState<VoiceTone>("dry");
  const [pizza, setPizza] = useState<PizzaSelection>({ size: "large", toppings: ["pepperoni"], extraCheese: false });
  const [items, setItems] = useState<Item[]>([]);
  const [status, setStatus] = useState<OrderStatus>("draft");
  const [paid, setPaid] = useState<number[]>([]);
  const [events, setEvents] = useState<Audit[]>([{ id: 1, at: "6:42 PM", actor: "System", action: "SESSION_SEEDED", detail: "Table 11 demo restored" }]);

  const subtotal = items.filter((item) => item.confirmed).reduce((sum, item) => sum + item.cents, 0);
  const tax = Math.round(subtotal * 0.0825);
  const total = subtotal + tax;
  const split = Math.ceil(total / Math.max(diners.length, 1));
  const addEvent = (action: string, detail: string, actor = "Jordan · server") => setEvents((old) => [{ id: Date.now(), at: new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }), actor, action, detail }, ...old]);

  function login() {
    if (pin !== "0420") { setError("PIN not recognized. For this prototype, use 0420."); return; }
    setAuthenticated(true); addEvent("EMPLOYEE_LOGIN", "Jordan opened a device session");
  }
  function chooseTable(id: number) { setTable(id); setStatus("draft"); setItems([]); setPaid([]); addEvent("TABLE_OPENED", `Table ${id} opened`); setView("order"); }
  function toggleTopping(name: string) { setPizza((current) => ({ ...current, toppings: current.toppings.includes(name) ? current.toppings.filter((t) => t !== name) : [...current.toppings, name] })); }
  function addPizza() { const cents = pricePizza(pizza); setItems((old) => [...old, { id: Date.now(), diner: diners[0] ?? "Table", pizza, cents, source: "server", confirmed: true }]); addEvent("ITEM_ADDED", `${pizza.size} custom pizza · ${money(cents)}`); }
  function proposeGuestItem() { const guestPizza: PizzaSelection = { size: "small", toppings: ["pineapple"], extraCheese: true }; setItems((old) => [...old, { id: Date.now(), diner: diners[1] ?? "Guest", pizza: guestPizza, cents: pricePizza(guestPizza), source: "guest", confirmed: false }]); addEvent("ITEM_PROPOSED", "Guest proposed a pineapple pizza", "Sam · guest"); setView("order"); }
  function confirmItem(id: number) { setItems((old) => old.map((item) => item.id === id ? { ...item, confirmed: true } : item)); addEvent("ITEM_CONFIRMED", "Server approved guest item"); }
  function submit() { if (!items.length || items.some((item) => !item.confirmed)) return; setStatus(transitionOrder(status, "submitted")); addEvent("ORDER_SUBMITTED", `${items.length} item(s) sent to kitchen`); setView("kds"); }
  function advance() { const target = nextStatus[status]; if (!target) return; setStatus(transitionOrder(status, target)); addEvent("ORDER_STATUS_CHANGED", `${status} → ${target}`, "Kitchen · KDS"); }
  function pay(index: number) { if (paid.includes(index)) return; setPaid((old) => [...old, index]); addEvent("PAYMENT_AUTHORIZED", `Mock card authorized for ${money(split)} + ${money(Math.round(split * 0.2))} tip`, diners[index] ?? "Guest"); if (paid.length + 1 === diners.length) { setStatus("paid"); addEvent("ORDER_PAID", "All split payments authorized", "System"); } }

  if (!authenticated) return <Login pin={pin} setPin={setPin} error={error} login={login} />;

  const nav = [
    ["floor", Store, "Floor"], ["order", Pizza, "Order"], ["kds", ChefHat, "KDS"], ["join", QrCode, "Guests"], ["pay", CreditCard, "Pay"], ["history", History, "History"]
  ] as const;

  return (
    <div className="mx-auto min-h-screen max-w-7xl pb-24 lg:grid lg:grid-cols-[220px_1fr] lg:pb-0">
      <aside className="hidden border-r p-5 lg:flex lg:flex-col">
        <Brand />
        <div className="mt-8 space-y-1">{nav.map(([key, Icon, label]) => <Button key={key} variant={view === key ? "secondary" : "ghost"} className="w-full justify-start" onClick={() => setView(key)}><Icon className="size-4" />{label}</Button>)}</div>
        <div className="mt-auto rounded-xl border bg-card p-3 text-xs text-muted-foreground"><strong className="block text-foreground">Jordan · Server</strong>Downtown · Device 03</div>
      </aside>
      <main className="min-w-0">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b bg-background/90 px-4 py-3 backdrop-blur md:px-7"><Brand compact /><div className="flex items-center gap-2"><Badge>Table {table}</Badge><Button variant="ghost" size="icon" aria-label="Log out" onClick={() => setAuthenticated(false)}><LogOut className="size-4" /></Button></div></header>
        <div className="p-4 md:p-7">
          {view === "floor" && <Floor current={table} choose={chooseTable} tone={tone} setTone={setTone} />}
          {view === "order" && <OrderView table={table} diners={diners} setDiners={setDiners} pizza={pizza} setPizza={setPizza} toggleTopping={toggleTopping} addPizza={addPizza} items={items} confirmItem={confirmItem} subtotal={subtotal} tax={tax} total={total} status={status} submit={submit} tone={tone} />}
          {view === "kds" && <Kds table={table} items={items} status={status} advance={advance} />}
          {view === "join" && <Join table={table} propose={proposeGuestItem} status={status} total={total} />}
          {view === "pay" && <Pay diners={diners} total={total} split={split} paid={paid} pay={pay} status={status} tone={tone} />}
          {view === "history" && <HistoryView events={events} />}
        </div>
      </main>
      <nav aria-label="Primary" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-6 border-t bg-background/95 px-1 py-2 backdrop-blur lg:hidden">{nav.map(([key, Icon, label]) => <button key={key} onClick={() => setView(key)} className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg text-[10px] font-bold ${view === key ? "bg-secondary text-primary" : "text-muted-foreground"}`}><Icon className="size-4" />{label}</button>)}</nav>
    </div>
  );
}

function Brand({ compact = false }: { compact?: boolean }) { return <div className={`flex items-center gap-2 ${compact ? "lg:hidden" : ""}`}><div className="grid size-9 rotate-[-4deg] place-items-center rounded-lg bg-primary font-black text-primary-foreground">SIC</div><div><strong className="block leading-4">PIZZA</strong><span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">Bad decisions, hot</span></div></div>; }

function Login({ pin, setPin, error, login }: { pin: string; setPin: (v: string) => void; error: string; login: () => void }) {
  return <main className="grid min-h-screen place-items-center p-4"><Card className="w-full max-w-sm overflow-hidden"><div className="h-1 bg-primary" /><CardHeader><Brand /><Badge className="mt-6 w-fit">Employee access</Badge><h1 className="mt-3 text-3xl font-black tracking-tight">Clock in to the chaos.</h1><p className="mt-2 text-sm text-muted-foreground">Seeded dev PIN: <span className="font-mono text-foreground">0420</span></p></CardHeader><CardContent><label htmlFor="pin" className="mb-2 block text-sm font-bold">4-digit PIN</label><input id="pin" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && login()} className="h-14 w-full rounded-xl border bg-background px-4 text-center font-mono text-2xl tracking-[.6em]" aria-describedby={error ? "pin-error" : undefined} />{error && <p id="pin-error" role="alert" className="mt-2 text-sm text-danger">{error}</p>}<Button size="lg" className="mt-4 w-full" onClick={login}>Enter the building</Button><p className="mt-4 text-xs leading-5 text-muted-foreground">Prototype only. Production PINs will be salted, rate-limited, device-bound, and never displayed.</p></CardContent></Card></main>;
}

function PageTitle({ eyebrow, title, note }: { eyebrow: string; title: string; note: string }) { return <div className="mb-6"><span className="font-mono text-xs uppercase tracking-[.2em] text-primary">{eyebrow}</span><h1 className="mt-1 text-3xl font-black tracking-tight md:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">{note}</p></div>; }

function Floor({ current, choose, tone, setTone }: { current: number; choose: (id: number) => void; tone: VoiceTone; setTone: (tone: VoiceTone) => void }) {
  return <><PageTitle eyebrow="Downtown · Dinner" title="Floor" note="6:44 PM. Nobody has cried in the walk-in yet." /><div className="mb-5 flex flex-wrap gap-2"><span className="self-center text-xs font-bold text-muted-foreground">Voice:</span>{(["dry", "feral", "neutral"] as const).map((t) => <Button key={t} size="default" variant={tone === t ? "default" : "secondary"} onClick={() => setTone(t)}>{t}</Button>)}</div><div className="grid grid-cols-2 gap-3 md:grid-cols-3">{tables.map((t) => <button key={t.id} onClick={() => choose(t.id)} className={`min-h-36 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-primary ${t.id === current ? "bg-primary text-primary-foreground" : "bg-card"}`}><div className="flex justify-between"><span className="font-mono text-xs uppercase">{t.state}</span><Users className="size-4" /></div><strong className="mt-8 block text-3xl">{t.id}</strong><span className="text-xs opacity-70">{t.seats} seats</span></button>)}</div><p className="mt-4 text-sm text-muted-foreground">Tap any table to {voice("openTable", tone).toLowerCase()}.</p></>;
}

function OrderView({ table, diners, setDiners, pizza, setPizza, toggleTopping, addPizza, items, confirmItem, subtotal, tax, total, status, submit, tone }: { table: number; diners: string[]; setDiners: (d: string[]) => void; pizza: PizzaSelection; setPizza: (p: PizzaSelection) => void; toggleTopping: (n: string) => void; addPizza: () => void; items: Item[]; confirmItem: (id: number) => void; subtotal: number; tax: number; total: number; status: OrderStatus; submit: () => void; tone: VoiceTone }) {
  return <><PageTitle eyebrow={`Table ${table} · ${statusCopy[status]}`} title="Build the damage" note="Prices and selections stay literal. Commentary is optional and never replaces facts." /><div className="grid gap-5 xl:grid-cols-[1.3fr_.7fr]"><div className="space-y-5"><Card><CardHeader><h2 className="font-bold">Who’s pretending to share?</h2></CardHeader><CardContent className="flex flex-wrap gap-2">{diners.map((d) => <Badge key={d}>{d}</Badge>)}<Button variant="secondary" onClick={() => setDiners([...diners, `Guest ${diners.length + 1}`])}>+ Add diner</Button></CardContent></Card><Card><CardHeader><div className="flex items-center justify-between"><div><h2 className="text-xl font-black">Custom pizza</h2><p className="text-sm text-muted-foreground">Every topping costs $1.75. Extra cheese costs $2.25.</p></div><Pizza className="size-6 text-primary" /></div></CardHeader><CardContent className="space-y-5"><fieldset><legend className="mb-2 text-sm font-bold">Size</legend><div className="grid grid-cols-2 gap-2">{(["small", "large"] as const).map((size) => <Button key={size} variant={pizza.size === size ? "default" : "secondary"} onClick={() => setPizza({ ...pizza, size })}>{size} · {money(size === "small" ? 1400 : 1900)}</Button>)}</div></fieldset><fieldset><legend className="mb-2 text-sm font-bold">Toppings</legend><div className="grid grid-cols-2 gap-2">{TOPPINGS.map((t) => <Button key={t} variant={pizza.toppings.includes(t) ? "default" : "secondary"} onClick={() => toggleTopping(t)}>{pizza.toppings.includes(t) && <Check className="size-4" />}{t}</Button>)}</div>{pizza.toppings.includes("pineapple") && <p className="mt-2 text-xs text-muted-foreground">Yes, pineapple. We’re notifying the authorities.</p>}</fieldset><Button variant={pizza.extraCheese ? "default" : "secondary"} className="w-full" onClick={() => setPizza({ ...pizza, extraCheese: !pizza.extraCheese })}>Extra cheese · $2.25</Button><Button size="lg" className="w-full" onClick={addPizza}>Add pizza · {money(pricePizza(pizza))}</Button></CardContent></Card></div><Card className="h-fit xl:sticky xl:top-24"><CardHeader><h2 className="text-xl font-black">Order review</h2><Badge className="mt-2">{items.length} items</Badge></CardHeader><CardContent>{items.length === 0 ? <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">The order is gloriously empty.</div> : <div className="space-y-3">{items.map((item) => <div key={item.id} className="rounded-xl border bg-background p-3"><div className="flex justify-between gap-3"><div><strong className="capitalize">{item.pizza.size} custom</strong><p className="text-xs text-muted-foreground">{item.diner} · {item.pizza.toppings.join(", ") || "cheese"}</p></div><strong>{money(item.cents)}</strong></div>{!item.confirmed && <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/10 p-2"><span className="text-xs font-bold text-primary">Guest proposal · approval required</span><Button onClick={() => confirmItem(item.id)}>Confirm</Button></div>}</div>)}</div>}<div className="my-5 space-y-2 border-y py-4 text-sm"><div className="flex justify-between text-muted-foreground"><span>Subtotal</span><span>{money(subtotal)}</span></div><div className="flex justify-between text-muted-foreground"><span>Tax</span><span>{money(tax)}</span></div><div className="flex justify-between text-lg font-black"><span>Total</span><span>{money(total)}</span></div></div><Button size="lg" className="w-full" disabled={status !== "draft" || !items.length || items.some((i) => !i.confirmed)} onClick={submit}><ChefHat className="size-5" />{voice("sendKitchen", tone)}</Button></CardContent></Card></div></>;
}

function Kds({ table, items, status, advance }: { table: number; items: Item[]; status: OrderStatus; advance: () => void }) { const target = nextStatus[status]; return <><PageTitle eyebrow="Kitchen display" title="Hot screens, cold hearts" note="Ticket changes update the table-facing status immediately in this prototype." /><Card className="max-w-2xl border-t-4 border-t-primary"><CardHeader><div className="flex items-start justify-between"><div><Badge>Table {table}</Badge><h2 className="mt-2 text-2xl font-black">#{table}-001</h2></div><Badge className={status === "ready" ? "border-success text-success" : ""}><Clock3 className="mr-1 size-3" />{statusCopy[status]}</Badge></div></CardHeader><CardContent><div className="space-y-3">{items.map((item) => <div key={item.id} className="flex justify-between border-b py-3"><div><strong>1 × {item.pizza.size} pizza</strong><p className="text-sm text-muted-foreground">{item.pizza.toppings.join(" · ")}{item.pizza.extraCheese ? " · EXTRA CHEESE" : ""}</p></div><span className="font-mono text-xs">{item.diner}</span></div>)}</div>{target ? <Button size="lg" className="mt-5 w-full" onClick={advance}>Mark {target}</Button> : <p className="mt-5 rounded-xl bg-secondary p-4 text-center text-sm">No kitchen action needed. Miracles happen.</p>}</CardContent></Card></>; }

function Join({ table, propose, status, total }: { table: number; propose: () => void; status: OrderStatus; total: number }) { const code = `SIC-${table}`; return <><PageTitle eyebrow="Customer session" title="Let strangers near the order" note={`Prototype token ${code} rotates conceptually; production will hash short-lived, single-table join tokens.`} /><div className="grid gap-5 md:grid-cols-2"><Card><CardContent className="grid place-items-center py-8"><div className="grid size-48 grid-cols-5 gap-1 rounded-xl bg-white p-4" aria-label="Decorative QR prototype">{Array.from({ length: 25 }, (_, i) => <span key={i} className={`${[0,1,2,4,5,7,8,10,12,14,16,18,20,21,22,23,24].includes(i) ? "bg-black" : "bg-white"}`} />)}</div><p className="mt-4 font-mono text-sm">/join/{code}</p><Link className="mt-2 text-sm font-bold text-primary underline" href={`/join/${code}`}>Open guest preview</Link></CardContent></Card><Card><CardHeader><h2 className="text-xl font-black">Guest controls</h2></CardHeader><CardContent className="space-y-3"><div className="rounded-xl border p-4"><span className="text-xs text-muted-foreground">Live order state</span><strong className="mt-1 block">{statusCopy[status]} · {money(total)}</strong></div><Button size="lg" className="w-full" onClick={propose}>Simulate guest pizza proposal</Button><Button variant="secondary" className="w-full">Request assistance</Button><p className="text-xs leading-5 text-muted-foreground">Guests can propose items and see totals. A server must confirm every guest-added item before kitchen submission.</p></CardContent></Card></div></>; }

function Pay({ diners, total, split, paid, pay, status, tone }: { diners: string[]; total: number; split: number; paid: number[]; pay: (i: number) => void; status: OrderStatus; tone: VoiceTone }) { return <><PageTitle eyebrow="Mock payments" title={voice("splitCheck", tone)} note="Authorization is simulated. Declines and refunds will always use clear, neutral copy." /><div className="mb-4 rounded-xl border bg-card p-4"><div className="flex justify-between"><span className="text-muted-foreground">Order total</span><strong className="text-2xl">{money(total)}</strong></div><p className="mt-1 text-xs text-muted-foreground">Equal split may over-allocate by a cent in the prototype; production settlement assigns remainder deterministically.</p></div><div className="grid gap-3 md:grid-cols-2">{diners.map((d, i) => <Card key={d}><CardContent className="pt-5"><div className="flex items-center justify-between"><div><strong>{d}</strong><p className="text-sm text-muted-foreground">{money(split)} + suggested 20% tip</p></div>{paid.includes(i) ? <Badge className="border-success text-success"><Check className="mr-1 size-3" />Paid</Badge> : <Button disabled={!total || status === "draft"} onClick={() => pay(i)}>Mock pay</Button>}</div></CardContent></Card>)}</div></>; }

function HistoryView({ events }: { events: Audit[] }) { return <><PageTitle eyebrow="Audit trail" title="Receipts for every bad decision" note="Append-only event intent: actor, time, aggregate, action, and relevant payload." /><Card><CardContent className="pt-5"><ol className="relative ml-2 border-l">{events.map((event) => <li key={event.id} className="relative mb-6 ml-5 last:mb-0"><span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-background bg-primary" /><div className="flex flex-wrap items-center gap-2"><Badge>{event.action}</Badge><time className="font-mono text-xs text-muted-foreground">{event.at}</time></div><p className="mt-2 text-sm font-bold">{event.detail}</p><p className="text-xs text-muted-foreground">{event.actor}</p></li>)}</ol></CardContent></Card></>; }
