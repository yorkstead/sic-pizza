# Production Baseline & Persistence Architecture Contract

**Document Version:** 1.0.0  
**Status:** Approved Architectural Baseline (Milestone 0)  
**Target Next Milestone:** Prompt 1 — Build transactional PostgreSQL persistence  

---

## 1. Executive Summary & Baseline State

This document establishes an evidence-backed implementation baseline for the Restaurant Operating System platform (demonstrated with SIC Pizza and Sakura Izakaya). It audits the codebase to distinguish verified pure-domain capabilities from in-memory prototypes, identifies critical architectural and schema gaps, records safe configuration hygiene actions, and establishes a binding persistence and transactional contract for subsequent milestones.

---

## 2. Implementation Matrix

The current prototype spans rich domain models, isolated browser components, and an initial Drizzle PostgreSQL schema. The matrix below classifies the actual state of each subsystem based on runtime evidence.

| Subsystem | Pure Domain Logic | Browser Demo (`pos-demo` / `guest-session`) | Server Implementation | Persisted State (PostgreSQL) | Multi-Device Sync | Status & Unresolved Work |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Table Session Lifecycle** | Verified (Unit Tests: 97 pass) | Functional (In-Memory) | Missing (Client-side service) | Partial (Schema defined; no server repo) | None (Local memory only) | Requires server-side transactional repository and atomic commands. |
| **Integer-Cent Financials & Pre-Split** | Verified (Exact cent math, remainder distribution) | Functional | None | Partial (Columns exist in `orders`/`checks`/`payments`) | None | Ledger and balance state machine verified; needs atomic persistence and sandbox gateway. |
| **Universal Attention & Task Queue** | Verified (Role routing, SLA timers, escalation) | Functional | None | Partial (`guest_requests` table exists) | None | Needs realtime multi-device projection distribution. |
| **KDS & Course Pacing** | Verified (Hold, fire, multi-station tickets) | Functional | None | Partial (`kitchen_tickets` table exists) | None | Zero-duplicate firing invariant requires database-level idempotency and outbox dispatch. |
| **Semantic Modifiers & 86'd Controls** | Verified (Mutual exclusion, portioning, allergens) | Functional | None | Partial (`menu_items`, `modifier_groups` schema) | None | Catalog validation must execute authoritatively on the server. |
| **Staff Access & PIN Gate** | Verified (Role definitions & actions) | Insecure (Client-side PIN check `pin === "0420"`) | Missing (No API endpoints or session cookies) | Partial (`employees` table with `pin_hash`) | None | Browser gate must be replaced with Argon2id server authentication, session tokens, and RBAC. |
| **Guest QR & Joining** | Simulated (32-bit hash, fixed secret) | Isolated (Seeds own independent demo session) | Missing (No token verification endpoint) | Partial (`join_token_hash` in `table_sessions`) | None | Replace custom hash with cryptographically secure server tokens and admission flow. |
| **Offline Queue & Idempotency** | Verified (In-Memory queue & retry backoff) | In-Memory only (`ClientMutationQueue`) | Missing (No durable server idempotency store) | Partial (`idempotency_key` column on audit events) | None | Needs browser durable storage (IndexedDB) and server atomic transaction deduplication. |
| **Multi-Tenant Separation** | Verified (Tenant configs for SIC & Sakura) | Functional (Demo toggle) | Missing (Endpoints unscoped) | Partial (`organizations`, `locations` tables) | None | Enforce tenant/location scoping across all database queries and repository methods. |

---

## 3. Detailed Audit Findings & Observations

### 3.1. Repository & Runtime Isolation
- **Observation:** `components/pos-demo.tsx` and `components/guest-session.tsx` each construct their own independent `InMemoryTableSessionRepository`.
- **Runtime Consequence:** When a guest navigates to `/join/[code]`, the guest component opens its own seeded demo session instead of connecting to the live session opened by staff. There is zero cross-client synchronization.

### 3.2. Audit Event Emission vs. Foreign Key Ordering
- **Observation:** In `lib/domain/services/session-service.ts`, `TableSessionService.emit()` immediately persists events to `this.repo.appendEvent()`. In `openTableSession()`, `TABLE_OPENED` and `DINER_ADDED` events are emitted before `this.repo.save(session)` is called.
- **Runtime Consequence:** In the PostgreSQL schema (`0001_clear_hydra.sql`), `audit_events.session_id` has a foreign key constraint referencing `table_sessions.id`. Executing this against PostgreSQL immediately causes a foreign key constraint violation because the parent `table_sessions` record does not yet exist.

### 3.3. Identifier Discrepancies (String vs. UUID)
- **Observation:** Domain models and demo initializers generate string identifiers such as `sess_11`, `diner_sess_11_1`, `tbl_11`, `emp_jordan`, and `area_main`. The PostgreSQL schema (`db/schema.ts`) specifies `uuid("id").primaryKey().defaultRandom()` and UUID foreign keys.
- **Runtime Consequence:** Attempting to store domain strings directly in PostgreSQL UUID columns causes database parse errors without explicit mapping or standardization.

### 3.4. Unscoped Repository Methods & Tenant Isolation
- **Observation:** `TableSessionRepository.listAll()` in `lib/domain/services/session-repository.ts` accepts no tenant or location parameters. `listActive(locationId)` does not enforce organization-level scoping.
- **Runtime Consequence:** Unscoped reads risk cross-tenant data leakage in multi-tenant environments.

### 3.5. Idempotency Scope & Storage
- **Observation:** Aggregate-level idempotency is currently stored in an in-memory record `session.executedIdempotencyKeys` and applied only to `addItem` and `fireCourse`. Other critical mutating commands (`addDiner`, `removeDiner`, `transferTable`, `proposeItem`, `approveItem`, `modifyItem`, `voidItem`, `createGuestRequest`, `createCheck`, `processPayment`) lack idempotency tracking. `ClientMutationQueue` is an ephemeral in-memory array that resets on browser reload.
- **Runtime Consequence:** Duplicate command retransmissions across network retries can create duplicate checks, void operations, diner additions, or service requests.

### 3.6. Security Hygiene & Cryptographic Tokens
- **Observation:**
  - `lib/domain/models/qr.ts` uses a custom bitshift 32-bit hash (`createSimpleSignature`) with a hardcoded `DEFAULT_SECRET`.
  - `components/pos-demo.tsx` performs authentication by comparing the input PIN against `"0420"` directly in the browser.
- **Runtime Consequence:** Client-side credentials and custom non-cryptographic hashes are vulnerable to tampering and cannot be used in a production or pilot environment.

### 3.7. Documentation Readiness Claims
- **Observation:** `docs/ROADMAP.md` claimed: *"The core domain and operational software foundation is 100% pilot-ready."*
- **Correction:** This statement was unsupported by the runtime architecture (in-memory single-client execution). `docs/ROADMAP.md` and `docs/ARCHITECTURE.md` have been corrected to accurately reflect a robust pure-domain foundation undergoing phased persistence and security implementation.

---

## 4. Persistence Decision Record (PDR-001)

### Context & Decision
The platform requires a durable persistence foundation supporting multi-device synchronization, offline client recovery, and zero duplicate kitchen/payment effects.

**Decision:** We adopt an **Authoritative Transactional State + Append-Only Audit Stream + Durable Outbox** architecture for the pilot foundation.

> [!NOTE]
> **Explicit Architectural Boundary:** We deliberately do **not** classify this as "full event sourcing." Full event sourcing requires tested deterministic state reconstruction from the event stream, event schema migration/upcasting, and snapshot rebuild pipelines. The authoritative source of truth for all transactional queries and invariants in this milestone is the relational PostgreSQL state, with audit events and outbox entries written atomically alongside aggregate mutations.

```mermaid
flowchart TD
    subgraph Client Handheld / KDS / Guest
        A[Command Envelope]
    end

    subgraph PostgreSQL Transaction [Single Atomic DB Transaction]
        B[1. Verify / Acquire Lock on table_sessions]
        C[2. Check / Insert Idempotency Record]
        D[3. Mutate Relational Tables: table_sessions, order_items, checks]
        E[4. Insert Append-Only Audit Event]
        F[5. Insert Outbox Event with Monotonic Sequence]
    end

    subgraph Background Relay
        G[Durable Outbox Worker]
    end

    subgraph Projections & Realtime
        H[Connected Server Handhelds]
        I[Kitchen Station KDS]
        J[Guest Web View]
    end

    A -->|POST Command| B
    B --> C --> D --> E --> F
    F -->|Transaction Commit| G
    G --> H
    G --> I
    G --> J
```

### Key Contract Specifications

#### 1. ID Mapping & Schema Standardization Strategy
- Primary and foreign keys in PostgreSQL will use canonical UUIDs (v4/v7).
- The domain layer will generate and accept standard UUID strings. For backwards compatibility with demo seeds and tests, deterministic UUID generation (`uuidv5` / namespace hashing) or UUID string generators (`crypto.randomUUID()`) will be used across domain aggregates.

#### 2. Tenant Boundary & Isolation
- Every database query, repository lookup, mutation, and outbox record must be strictly scoped by `(organization_id, location_id)`.
- Global unscoped methods (e.g. `listAll()`) are prohibited. All repository methods require an explicit tenant context.

#### 3. Single Active Session Constraint
- A physical table may have at most **one active session** at any time.
- Enforced at the database level via a partial unique index:
  ```sql
  CREATE UNIQUE INDEX "idx_unique_active_table_session" 
  ON "table_sessions" ("table_id") 
  WHERE "closed_at" IS NULL;
  ```

#### 4. Concurrency Control & Lost Update Prevention
- `table_sessions` table will maintain an integer `version` column.
- Mutations must perform optimistic concurrency checks (`UPDATE ... WHERE id = $id AND version = $expectedVersion`) or select with row-level locks (`SELECT FOR UPDATE`) within the command transaction.

#### 5. Command Transaction Contract
Every mutating command executed by the server must execute within a single PostgreSQL transaction (`BEGIN ... COMMIT`):
1. **Concurrency Lock / Version Validation**: Load target session aggregate with version check.
2. **Idempotency Guard**: Check for prior execution with `(tenant_id, location_id, principal_id, idempotency_key)`. If found, return cached response immediately without executing side effects.
3. **Domain Mutation & Relational Writes**: Update `table_sessions`, `order_items`, `kitchen_tickets`, `guest_requests`, `checks`, `payments`.
4. **Audit Log Insertion**: Insert immutable row into `audit_events` with parent session ID.
5. **Outbox Message Insertion**: Insert row into `outbox_events` containing the serialized projection delta and event type for downstream broadcast.
6. **Atomic Rollback**: Any constraint violation or domain error rolls back all writes.

#### 6. Durable Idempotency Scope
- Idempotency records are scoped to `(tenant_id, location_id, principal_id, idempotency_key)`.
- Records store:
  - `request_hash`: SHA-256 hash of the command payload. (Reject reuse of the same key with different payloads with a `409 Conflict`).
  - `status`: `PENDING` | `COMPLETED` | `FAILED`.
  - `response_payload`: Serialized JSON result for zero-duplicate replay.
  - `created_at` / `expires_at`: Retention window (e.g., 48 hours).

---

## 5. Security & Configuration Hygiene

During the Milestone 0 baseline audit, tracked configuration files were inspected for credential-like values:

| File | Inspected Element | Remediation Action |
| :--- | :--- | :--- |
| `.env.example` | Default `DATABASE_URL` string | Replaced with standard placeholder `postgres://username:password@localhost:5432/sic_pizza_dev`. |
| `drizzle.config.ts` | Fallback connection string | Replaced with generic dev placeholder `postgres://username:password@localhost:5432/sic_pizza_dev`. |
| `lib/domain/models/qr.ts` | `DEFAULT_SECRET` variable | Documented as demo-only fallback. Server-managed rotating secrets required in Milestone 3. |
| `components/pos-demo.tsx` | Hardcoded `"0420"` dev PIN | Documented as browser prototype only. Server Argon2id authentication required in Milestone 2. |

> [!CAUTION]
> **Credential Rotation Policy:** Sanitizing tracked repository files or removing default strings does not revoke or rotate credentials. If any valid production credential was ever committed or exposed, it must be revoked and rotated directly with the infrastructure provider/owner. Never seed or migrate live databases from unauthenticated or untrusted clients.

---

## 6. Acceptance Criteria for Milestone 0 Met

- [x] **Audit completed:** Every readiness claim in documentation and code is backed by verified runtime evidence.
- [x] **Implementation Matrix established:** Concrete status breakdown across domain logic, browser demo, server implementation, persistence, and multi-device capabilities.
- [x] **Persistence Decision Record defined:** Clear contract for authoritative transactional state, audit events, durable outbox, ID mapping, tenant boundaries, and concurrency control.
- [x] **Safe configuration hygiene verified:** Tracked connection strings and examples replaced with placeholders; zero secrets displayed in report.
- [x] **Tests & Build verified:** 97 domain tests passing, clean TypeScript typecheck (`tsc --noEmit`), and clean linting (`eslint .`).
