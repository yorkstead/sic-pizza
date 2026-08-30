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

## Architectural Separation: Platform Core vs. Restaurant Tenants

The codebase strictly decouples general-purpose hospitality domain logic from specific restaurant cuisines, menus, or themes:

1. **Platform Core (`lib/domain/`)**:
   - **Universal Domain Engine**: Table session aggregate lifecycle, order/item aggregates, deterministic split reconciliation with integer-cent remainder tracking, append-only event stream, offline-resilient mutation queue, and service analytics.
   - **Zero Cuisine Dependencies**: Completely agnostic of pizza, dough types, or specific station topologies.
2. **Tenant Configuration Schema (`lib/domain/models/tenant.ts`)**:
   - Declarative schemas for restaurant branding, physical floor plans, kitchen stations, menus, modifier compatibility rules, role assignments, and attention thresholds.
3. **Demonstration Tenants**:
   - **SIC Pizza (`SIC_PIZZA_TENANT`)**: Flagship artisan wood-fired pizzeria featuring half-topping modifier rules, 7-station kitchen routing (`PIZZA`, `GRILL`, `FRY`, `SALAD`, `BAR`, `DESSERT`, `EXPO`), and full tableside ordering.
   - **Sakura Izakaya (`SAKURA_IZAKAYA_TENANT`)**: Japanese gastropub showcasing robata skewers, sashimi, sake highballs, and distinct stations (`SUSHI_BAR`, `YAKITORI_GRILL`, `HOT_KITCHEN`, `SAKE_BAR`, `EXPO`) to prove total platform neutrality.

---

## Key Platform Capabilities

- **1. Live Table Session Experience**: Mobile-first server handheld view answering *"Which table needs me right now?"*
- **2. Pre-Split Diner Item Ownership**: Every item is allocated to single, multiple, or all diners with deterministic integer-cent math.
- **3. Universal Attention & Request Queue**: Role-routed service requests (Runners, Bartenders, Servers, Managers) with age and escalation tracking.
- **4. Rules-Based Attention Engine**: Deterministic operational suggestions ("Do This Next") with 0 LLM dependencies.
- **5. Semantic Modifier Engine**: Invalid-state prevention preventing incompatible customizations before kitchen submission.
- **6. Multi-Station Kitchen Projections (KDS)**: 1 order projected to multiple production stations with synchronized Expo readiness.
- **7. Course Pacing & Coordination**: Hold, fire now, and pacing recommendations across drinks, starters, and mains.
- **8. Guest Web Session via Rotating QR**: Zero-install mobile web ordering with server proposal approval gates.
- **9. Instant Table Handoffs**: State-derived shift transfers with zero verbal brain dumps.
- **10. Manager Operations Command Center**: High-density operational monitoring answering *"What is going wrong right now?"*
- **11. Service Analytics That Explain Why**: Event-derived telemetry tracking greet times, cook speeds, runner lag, and table turn times.
- **12. Offline & Idempotent Mutation Foundation**: Zero duplicate kitchen firing invariant on flaky restaurant Wi-Fi.

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
