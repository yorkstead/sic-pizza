# Phased Roadmap: Restaurant Operating System

## Phase 0 — Foundation & Conceptual Reframe (Completed in Current Milestone)

- [x] Reframe SIC Pizza from a sarcastic POS into a fictional demonstration restaurant on a general restaurant operating platform.
- [x] Multi-layer separation: **Platform Core** (`lib/domain/core/`), **Restaurant Configuration** (`lib/domain/restaurant/`), and **SIC Pizza Demo Content** (`lib/demo/sic-pizza/`).
- [x] Establish "One Live Table: Everyone sees what they need" product vision and multi-stakeholder projection model.
- [x] Comprehensive documentation suite:
  - `docs/PRODUCT_VISION.md` (vision, stakeholder projections, operational problem breakdown)
  - `docs/ARCHITECTURE.md` (3-tier architecture, domain boundaries, invariants)
  - `docs/EVENT_MODEL.md` (canonical event envelope, complete domain event taxonomy)
  - `docs/BACKLOG.md` (prioritized multi-phase development plan)
  - `README.md` (reframed repository guide and setup)
- [x] Unified domain types: Table sessions, Diners, Coursed items, Service tasks, Multi-station lifecycle, Event stream.
- [x] Verified zero lint errors, strict typechecking, test execution, and production build.

---

## Phase 1 — Platform Core & Projection Foundations

- [ ] **Operational Task Engine**:
  - Model real-time service task queue (`water_refill`, `call_server`, `condiments`, `drop_check`, `spill_cleanup`).
  - Add task claiming, timer escalation, and multi-role assignment.
- [ ] **Multi-Station KDS & Coursing**:
  - Station routing logic (split items by destination: Pizza Oven, Bar, Fryer, Cold Pantry).
  - Independent hold/fire controls per course (`drinks`, `starters`, `mains`, `desserts`).
  - Expediter (Expo) view for table assembly before dispatch.
- [ ] **Food Runner & Bartender Projections**:
  - Mobile runner queue with table/seat delivery confirmations.
  - Quick-bump drink station queue.
- [ ] **Live Table Synchronization**:
  - SSE / Webhook transport abstraction projecting table mutations across open browser tabs in real-time.

---

## Phase 2 — Persistence & Multi-Tenant Security

- [ ] **PostgreSQL / Drizzle Persistence**:
  - Migrate in-memory state to transactional database queries.
  - Implement optimistic concurrency and aggregate versioning.
  - Multi-location tenant isolation enforced at database repository boundary.
- [ ] **Robust Identity & Authentication**:
  - Salted PIN hashing (Argon2 / bcrypt) with rate-limiting and device binding.
  - Role-based access control (RBAC) across server, bartender, runner, kitchen, expo, manager.
- [ ] **Secure Guest Access**:
  - Cryptographically hashed, time-limited, single-session QR join tokens.
  - Guest rate limiting and proposal abuse protection.

---

## Phase 3 — Operational Workflows & Financial Engine

- [ ] **Advanced Split Settlement**:
  - Exact diner-level itemization, seat-based allocation, and custom amount splits.
  - Deterministic remainder distribution to avoid rounding drift.
- [ ] **Shift & Table Handoff Tools**:
  - Seamless table reassignment with full audit playback.
  - Server checkout and cash/card reconciliation reporting.
- [ ] **Manager Console & Service Telemetry**:
  - Live floor health metrics: table turnaround time, kitchen delay alarms, unassigned service task alerts.
  - Void, comp, and refund authorization with manager override PINs.
- [ ] **Allergen & Safety Invariant Auditing**:
  - Structured ingredient/allergen cross-reference engine.
  - Strict tone override enforcement for all critical customer touchpoints.
