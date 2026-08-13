# SIC Pizza

Mobile-first tableside POS and collaborative ordering prototype for a fictional pizza joint with questionable judgment and strict operational clarity.

## Current milestone

The foundation delivers a browser-runnable vertical slice:

- seeded employee dev-PIN (`0420`) and responsive staff shell;
- multi-table floor, table session, diners, custom pizza modifiers, integer-cent pricing, and review;
- server approval for customer-proposed items;
- mocked kitchen submission and KDS lifecycle reflected in table status;
- QR/join prototype at `/join/SIC-11` with no account required;
- equal-split mocked card authorizations and tip display;
- configurable `dry`, `feral`, and `neutral` voice modes with a forced neutral sensitive context;
- append-only audit/event-history concept;
- multi-location PostgreSQL schema in Drizzle.

The interactive milestone intentionally uses in-memory React state. The database schema is the persistence contract for the next milestone; no production credentials or payment details are needed to run this demo.

## Setup

Requirements: Bun 1.3+ and, only when exercising persistence, PostgreSQL 16+.

```bash
bun install
cp .env.example .env.local
bun run dev
```

Open `http://localhost:3000`, enter PIN `0420`, and follow Floor → Order → KDS → Guests → Pay → History.

## Commands

```bash
bun run lint
bun run typecheck
bun test
bun run build
bun run db:generate
bun run db:migrate
```

## Architecture decisions

- **App Router, no `/src`:** routes and layouts live in `app/`; interactive surfaces are explicit client components.
- **Domain-first rules:** pricing, transitions, voice policy, and payment interfaces live in `lib/domain` and have no React dependency.
- **Integer cents:** prices, tax, totals, tips, and payment amounts never use floating-point currency values.
- **Server authority:** guest items are proposals until an employee confirms them; only valid transitions can reach the kitchen.
- **Auditable by default:** the schema models immutable events with actor, aggregate, location, payload, and timestamp.
- **Multi-location core:** organization and location ownership is present at the root of employee, table, and event data.
- **Provider boundary:** payment authorization is an interface with a deterministic mock implementation.
- **Voice as policy:** copy keys select a configured tone; sensitive contexts always select neutral text.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and [`docs/BACKLOG.md`](docs/BACKLOG.md) for boundaries and phased delivery.

## Next milestone

Persist the existing slice with authenticated server actions and transactions, rotate hashed QR join tokens, add live table/KDS updates, and introduce real role/device/session controls. Payment remains mocked until reconciliation, idempotency, refund, and decline flows are fully specified and tested.
