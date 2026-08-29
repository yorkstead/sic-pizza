# Product Vision: Restaurant Operating System

## Executive Summary

Traditional hospitality software divides the restaurant floor into disconnected operational silos: handheld POS terminals, separate guest ordering portals, isolated kitchen display systems (KDS), bar ticket printers, runner screens, and back-office management dashboards. When a guest asks for extra water, requests a bill split, or adds an appetizer, data is manually communicated across staff or awkwardly shuttled through point-to-point integrations.

**The Central Concept**:
> **One live table. Everyone sees what they need.**

A single, real-time **Table Session** serves as the shared operational source of truth across all participants in the restaurant. Rather than passing data back and forth between separate apps, every actor interacts with a purpose-built **projection** of the exact same table state.

---

## Core Problem Statement

The platform directly eliminates the major friction points of modern restaurant operations:

| Problem in Traditional POS | Restaurant Operating System Solution |
| :--- | :--- |
| **Servers juggling dozens of tiny tasks** | Explicit, shared operational task queue (water, condiments, check drop, table check-in) with clear claiming and completion status. |
| **Guests trying to flag down busy staff** | Real-time guest session allowing contactless assistance requests, item proposals, live kitchen progress tracking, and on-demand payment. |
| **Reconstructing split checks at the end** | Continuous, real-time item assignment by seat/diner throughout the entire meal; deterministic integer-cent split math at any time. |
| **Handwritten or ambiguous modifiers** | Structured modifier groups with allergen flags, inventory constraints, and station-aware routing. |
| **Poor visibility into kitchen progress** | Multi-station KDS state machine (`draft` → `proposed` → `confirmed` → `held` → `fired` → `preparing` → `ready` → `delivered`). |
| **Forgotten guest requests** | High-visibility server notifications and team-wide service task boards with escalation timers. |
| **Badly coordinated coursing** | Station-aware coursing (`drinks`, `appetizers`, `mains`, `desserts`) with independent hold/fire controls and expo pacing. |
| **Difficult shift / table handoffs** | Complete, auditable, replayable timeline of table events (orders, requests, voids, payments) visible immediately to the receiving server. |
| **Disconnected guest vs server ordering** | Server authority gate: guest proposals appear instantaneously in the server's review stream for 1-tap confirmation before kitchen routing. |
| **Unclear team responsibility** | Role-based task claiming (runners grab ready tickets, bartenders grab drink tickets, servers manage guest relationship). |
| **Delayed recognition of service issues** | Real-time table health heuristics (time since last contact, kitchen delay thresholds, unacknowledged help requests). |

---

## The Stakeholder Projections

Every participant in the dining experience views a tailored projection derived from the same live table session:

```
                      ┌─────────────────────────────────────────┐
                      │            LIVE TABLE SESSION           │
                      │  - Diners & Seats                       │
                      │  - Courses & Items                      │
                      │  - Operational Tasks & Help Requests    │
                      │  - State Machine & Kitchen Routing      │
                      │  - Split Balances & Payments            │
                      │  - Append-Only Audit Stream             │
                      └────────────────────┬────────────────────┘
                                           │
         ┌───────────────┬─────────────────┼────────────────┬───────────────┐
         ▼               ▼                 ▼                ▼               ▼
   ┌───────────┐   ┌───────────┐     ┌───────────┐    ┌───────────┐   ┌───────────┐
   │   GUEST   │   │  SERVER   │     │  KITCHEN  │    │   EXPO    │   │  MANAGER  │
   │PROJECTION │   │PROJECTION │     │PROJECTION │    │PROJECTION │   │PROJECTION │
   ├───────────┤   ├───────────┤     ├───────────┤    ├───────────┤   ├───────────┤
   │- Join QR  │   │- Floor map│     │- Station  │    │- All-line │   │- Shift map│
   │- Proposals│   │- Approval │     │  queue    │    │  assembly │   │- Table SLA│
   │- Status   │   │- Fire/Hold│     │- Prep timer│   │- Runner   │   │- Voids/   │
   │- Call Help│   │- Split pay│     │- Bump item│    │  dispatch │   │  Refunds  │
   │- Self-pay │   │- Tasks    │     │- Recall   │    │- Quality  │   │- Audit log│
   └───────────┘   └───────────┘     └───────────┘    └───────────┘   └───────────┘
```

1. **Guests**:
   - Frictionless QR onboarding without app downloads or account creation.
   - Propose food & drinks directly to the bill, request table assistance (water, condiments, bill), track kitchen progress in real-time, and settle payment split by diner or seat.
2. **Servers**:
   - Tableside floor overview with real-time table status indicators (active, ordering, kitchen delay, check requested).
   - Approval gate for guest proposals, fine-grained coursing controls (fire next course, hold mains), and friction-free payment settlement.
3. **Kitchen Stations (Line Cooks)**:
   - Dedicated station views (e.g. Pizza Oven, Grill, Sauté, Pantry, Bar) showing only items relevant to that station with active timers and modifier callouts.
4. **Expo (Expediter / Kitchen Runner)**:
   - Consolidated ticket assembly view ensuring all courses arrive at the table synchronized and hot; runner dispatch controls.
5. **Bartenders**:
   - Streamlined drink-ticket queue with immediate bump capabilities and direct communication with servers.
6. **Food Runners**:
   - Mobile-first task list of "Ready for Delivery" items with seat numbers and table identifiers.
7. **Managers**:
   - Bird's-eye floor telemetry: table turn times, bottlenecked stations, open voids/comps, unassigned service tasks, and full audit event playback.

---

## Separation of Concerns: Platform vs Configuration vs Demo

The system is architected in three distinct tiers:

1. **Platform Core (`lib/domain/core/`)**:
   - Universal restaurant primitives: multi-tenant locations, table session lifecycle, generic order/item aggregates, coursing engine, operational task queue, payment interfaces, append-only event stream.
   - **Zero dependency on pizza or sarcastic copy**.
2. **Restaurant Configuration (`lib/domain/restaurant/`)**:
   - Restaurant definition schema: physical floor plan, station definitions, modifier groups, tax rates, operational task definitions, service voice policies, and role permissions.
3. **SIC Pizza Demo Content & Branding (`lib/demo/sic-pizza/`)**:
   - A demonstration restaurant implementation showcasing pizza specialty options, multi-topping pricing engines, custom dark-first UI branding, and customizable voice modes (`neutral`, `dry`, `feral`).
