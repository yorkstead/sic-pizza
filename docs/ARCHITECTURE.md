# Architecture: Restaurant Operating System

## System Overview

The Restaurant Operating System is an event-driven, projection-based platform built around a single operational aggregate root: the **Table Session**.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      RESTAURANT OPERATING SYSTEM                        │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │                    SIC PIZZA DEMO RESTAURANT                      │  │
│  │  - Pizza menu catalog, toppings, integer-cent modifier pricing    │  │
│  │  - Feral / Dry / Neutral brand tone dictionary                    │  │
│  │  - Dark-first visual branding & themed interactive UI slice       │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │ conforms to                        │
│  ┌─────────────────────────────────▼─────────────────────────────────┐  │
│  │                   RESTAURANT CONFIGURATION                        │  │
│  │  - Dining Area & Table topology                                   │  │
│  │  - Station routing (Oven, Grill, Bar, Cold, Expo)                 │  │
│  │  - Course definitions (Drinks, Starters, Mains, Desserts)         │  │
│  │  - Operational task types (Water, Assistance, Clean, Check Drop)  │  │
│  │  - Location & Tax policy, Voice configuration rules               │  │
│  └─────────────────────────────────┬─────────────────────────────────┘  │
│                                    │ runs on                            │
│  ┌─────────────────────────────────▼─────────────────────────────────┐  │
│  │                         PLATFORM CORE                             │  │
│  │  - TableSession Aggregate Root (Diners, Courses, Tasks, Items)    │  │
│  │  - Domain Services & Invariant Enforcement Layer                  │  │
│  │  - Multi-station Kitchen Lifecycle (Queued -> InPrep -> Ready)    │  │
│  │  - Multi-stakeholder Projections (Guest, Server, KDS, Expo, Mgr) │  │
│  │  - Append-Only Audit & Domain Event Stream                        │  │
│  │  - Integer-Cent Math & Split-Allocation Payment Seams             │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1. Domain Entities & Aggregate Boundaries

### Core Domain Entities

1. **`Restaurant` / Organization**: Top-level tenant entity with currency, timezone, and global brand settings.
2. **`Location`**: Physical store location with specific tax rate, operating hours, and active employees.
3. **`DiningArea`**: Physical floor zone (e.g. `Main Dining`, `Patio`, `Bar Area`, `Lounge`).
4. **`DiningTable`**: Specific physical table with seating capacity and real-time status (`available`, `occupied`, `reserved`, `dirty`).
5. **`ServicePeriod`**: Active service window (e.g. `Lunch`, `Dinner`, `Happy Hour`, `Late Night`).
6. **`Employee` & `Role`**: Staff member bound to location with assigned role (`server`, `bartender`, `runner`, `kitchen`, `expo`, `manager`, `host`, `admin`) and hashed PIN credentials.
7. **`Menu`, `MenuItem`, `ModifierGroup`, `ModifierOption`**: Hierarchical catalog with item station routing, course assignments, allergen tags, and integer-cent modifier pricing.
8. **`Course`**: Pacing category (`drinks`, `starters`, `mains`, `desserts`).
9. **`OrderItem` & `Order`**: Item instance tied to table session, seat/diner, station, course, and lifecycle state (`draft` → `proposed` → `confirmed` → `held` → `fired` → `preparing` → `ready` → `delivered` → `voided`).
10. **`KitchenStation` & `KitchenTicket`**: Station queue (e.g. Pizza Oven, Bar, Cold Prep, Expo) managing ticket-level and item-level preparation states.
11. **`GuestRequest`**: Operational task request (`water_refill`, `call_server`, `condiments`, `drop_check`, `spill_cleanup`, `cutlery`) with status (`pending` → `acknowledged` → `completed`).
12. **`Check` & `Payment`**: Bill partitions (equal split or diner-itemized split) and gateway payment records tracking integer-cent balances and tips.
13. **`AuditEvent` / `DomainEvent`**: Immutable record of every operational mutation.

---

## 2. The TableSession Aggregate Root

The `TableSession` models the complete lifecycle of a dining party from initial seating through final table reset:

### Derived Operational Projections

Instead of maintaining brittle redundant flags, the `TableSession` derives its operational state on-demand:

- **Current Dining Stage**:
  - `seated`: Table opened, diners seated, no orders placed yet.
  - `ordering`: Diners building order / guest proposing items.
  - `food_in_flight`: Items fired to kitchen, active prep in progress.
  - `dining`: Courses delivered, party enjoying meal.
  - `check_presented`: Split checks calculated and presented.
  - `settling`: Payments in flight / partial payment recorded.
  - `cleared`: Table paid in full and ready to reset.
  - `closed`: Session finalized and archived.
- **Assigned Server**: Active employee responsible for table service.
- **Diners / Seats**: Roster of seated guests, diner names, and seat assignments.
- **Elapsed Seated Time**: Time since session opened.
- **Active Orders & Coursing**: Unvoided items grouped by course.
- **Kitchen Progress**: Aggregated station prep state (`not_ordered`, `queued`, `preparing`, `ready_for_runner`, `all_delivered`).
- **Open Guest Requests**: Pending assistance and service tasks.
- **Unpaid Balance**: Total billable amount minus authorized payments (integer cents).
- **Payment State**: `unbilled`, `split_pending`, `partially_paid`, `fully_paid`.
- **Operational Attention State**: Urgent heuristic flags for floor staff:
  - `urgent_guest_request`: Unacknowledged guest service requests.
  - `kitchen_delayed`: Kitchen tickets exceeding target preparation time (>25m).
  - `check_requested`: Guest requested bill drop.
  - `ready_to_clear`: Bill settled in full, table needs reset.
  - `idle_attention_needed`: Table open without server assignment or idle >15m without food.
  - `normal`: Routine service state.

---

## 3. Auditable Domain Event Model

Every operational mutation is published as a strongly-typed, immutable `DomainEvent`:

| Event Type | Aggregate | Trigger Description |
| :--- | :--- | :--- |
| `TABLE_OPENED` | `session` | Party seated; session created. |
| `DINER_ADDED` | `session` | Guest joined via QR or server added diner. |
| `DINER_REMOVED` | `session` | Diner removed (only permitted if no active items). |
| `TABLE_TRANSFERRED` | `session` | Table reassigned to another server. |
| `ITEM_PROPOSED` | `item` | Guest proposed an item from mobile view. |
| `ITEM_APPROVED` | `item` | Server approved guest proposal. |
| `ITEM_ADDED` | `item` | Server added item directly to order. |
| `ITEM_MODIFIED` | `item` | Item modifiers or instructions updated prior to prep. |
| `ITEM_VOIDED` | `item` | Item voided with mandatory reason and authorizer ID. |
| `COURSE_FIRED` | `order` | Server fired a course to the kitchen. |
| `TICKET_CREATED` | `ticket` | Station ticket created from fired course items. |
| `TICKET_ACCEPTED` | `ticket` | Line cook accepted station ticket. |
| `ITEM_STARTED` | `item` | Line cook started item preparation. |
| `ITEM_READY` | `item` | Station marked item ready for expo / runner. |
| `ITEM_DELIVERED` | `item` | Food runner marked item delivered to seat. |
| `REQUEST_CREATED` | `request` | Guest or server created service request. |
| `REQUEST_ACKNOWLEDGED` | `request` | Staff acknowledged service request. |
| `REQUEST_COMPLETED` | `request` | Staff fulfilled service request. |
| `CHECK_CREATED` | `check` | Check generated (full or split). |
| `CHECK_CLAIMED` | `check` | Diner claimed check for payment. |
| `PAYMENT_STARTED` | `payment` | Payment authorization initiated. |
| `PAYMENT_COMPLETED` | `payment` | Payment authorized and check balance reduced. |
| `TABLE_CLOSED` | `session` | Table closed (requires $0.00 unpaid balance). |

---

## 4. Service & Repository Boundaries

UI components and API handlers interact with the domain exclusively through the **`TableSessionService`** and **`TableSessionRepository`**:

- **Command Handlers**: Methods such as `openTableSession()`, `proposeItem()`, `approveItem()`, `fireCourse()`, `markTicketItemReady()`, `processPayment()`, `closeTableSession()`.
- **Invariants**:
  - Direct database row mutation for state transitions is prohibited.
  - Zero floating-point arithmetic.
  - Guest proposals must be approved by an employee before kitchen dispatch.
  - Voids require a mandatory audit reason.
  - Table closure is blocked while unpaid balances or pending guest requests remain.
