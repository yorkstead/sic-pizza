# Restaurant Operating System (SIC Pizza Demonstration)

A modern, real-time, multi-stakeholder restaurant operating platform designed around a single unifying principle:

> **One live table. Everyone sees what they need.**

Rather than passing data across disjointed POS terminals, guest ordering apps, kitchen screens, and bar printers, every participant interacts with a purpose-built projection of the shared **Table Session**.

**SIC Pizza** serves as the fictional, fully-branded demonstration restaurant running on top of this general, restaurant-agnostic operating platform.

---

## The Operational Model

```
                      ┌─────────────────────────────────────────┐
                      │            LIVE TABLE SESSION           │
                      │  - Diners & Seats                       │
                      │  - Courses & Items                      │
                      │  - Operational Tasks & Help Requests    │
                      │  - Station Routing & Kitchen Queue      │
                      │  - Split Balances & Payments            │
                      │  - Append-Only Audit Stream             │
                      └────────────────────┬────────────────────┘
                                           │
         ┌───────────────┬─────────────────┼────────────────┬───────────────┐
         ▼               ▼                 ▼                ▼               ▼
   ┌───────────┐   ┌───────────┐     ┌───────────┐    ┌───────────┐   ┌───────────┐
   │   GUEST   │   │  SERVER   │     │  KITCHEN  │    │   EXPO    │   │  MANAGER  │
   │PROJECTION │   │PROJECTION │     │PROJECTION │    │PROJECTION │   │PROJECTION │
   └───────────┘   └───────────┘     └───────────┘    └───────────┘   └───────────┘
```

The system directly eliminates major hospitality friction points:
- **Zero forgotten requests**: Real-time service task queue (`water_refill`, `call_server`, `condiments`, `drop_check`).
- **Synchronized guest & server ordering**: 1-tap server confirmation gate for guest item proposals.
- **Continuous split reconciliation**: Real-time diner-level tracking with deterministic integer-cent math.
- **Station-aware coursing & expo pacing**: Independent hold/fire controls per course (`drinks`, `starters`, `mains`, `desserts`).
- **Frictionless shift handoffs**: Append-only event history providing full context to any staff member.

---

## Architectural Separation

The codebase enforces strict separation across three tiers:

1. **Platform Core (`lib/domain/core/`)**:
   - Universal restaurant primitives: table session lifecycle, order/item aggregates, coursing, operational task board, multi-station state machine, integer-cent calculations, and append-only domain event envelopes.
   - Completely agnostic of pizza, food types, or sarcasm.
2. **Restaurant Configuration (`lib/domain/restaurant/`)**:
   - Schema and definitions for physical floor layouts, kitchen stations (e.g. Pizza Oven, Bar, Cold Prep, Expo), coursing pacing, tax rates, and role permissions.
3. **SIC Pizza Demo Content & Branding (`lib/demo/sic-pizza/`)**:
   - Demonstration implementation featuring pizza customizers, integer-cent topping engines, dark-first UI tokens, and optional voice modes (`dry`, `feral`, `neutral`).

---

## Documentation

- [`docs/PRODUCT_VISION.md`](docs/PRODUCT_VISION.md) — Comprehensive product vision, problem breakdowns, and stakeholder projections.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — System boundaries, invariants, technical stack, and design decisions.
- [`docs/EVENT_MODEL.md`](docs/EVENT_MODEL.md) — Append-only domain event taxonomy and schema.
- [`docs/BACKLOG.md`](docs/BACKLOG.md) — Phased multi-milestone roadmap.

---

## Getting Started

Requirements: [Bun](https://bun.sh) 1.3+ and (optionally for persistence) PostgreSQL 16+.

```bash
bun install
bun run dev
```

Open `http://localhost:3000`, enter employee dev PIN `0420`, and explore the live table lifecycle:
**Floor** → **Order** → **KDS** → **Guests** (`/join/SIC-11`) → **Pay** → **History**.

---

## Verification & Commands

```bash
bun run lint
bun run typecheck
bun test
bun run build
bun run db:generate
bun run db:migrate
```
