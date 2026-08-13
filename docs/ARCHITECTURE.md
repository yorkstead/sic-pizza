# Architecture

## Product boundaries

1. **Identity and access** — employees, roles, device sessions, PIN verification. Production PINs are hashed and rate-limited.
2. **Floor and table sessions** — locations, tables, session ownership, diners, rotating join tokens.
3. **Catalog and pricing** — menus, availability, modifier groups, integer-cent price calculation, taxes.
4. **Ordering** — server-authored items, guest proposals, employee confirmation, timing, discounts, voids.
5. **Kitchen** — immutable submissions, tickets, stations, constrained lifecycle transitions.
6. **Payments** — split allocation, tips, authorization/refund abstraction, provider idempotency, reconciliation.
7. **Voice and safety** — keyed copy by configured tone; allergen, decline, refund, and complaint contexts force neutral language.
8. **Audit and events** — append-only actor/aggregate events used for support, operational history, and eventual live projections.

## Runtime shape

Next.js App Router provides staff and guest web surfaces. Server Components are the default route boundary; focused client components own demo interaction. The future persistence layer uses PostgreSQL through Drizzle and Zod validates every command at ingress. Live updates will project order and kitchen events over a transport adapter so the domain does not depend on WebSockets or a vendor.

Mutations should execute as application commands: validate → authorize → load aggregate → enforce invariant → write state and audit event in one transaction → publish after commit. Money is integer cents. Location scope is explicit in every query and authorization decision.

## Prototype seams

The current UI state is deliberately replaceable: `lib/domain` already owns business rules, `db/schema.ts` owns persistence shape, and the payment provider is an interface. The decorative QR and same-browser KDS simulation prove the workflow but are not security or real-time implementations.
