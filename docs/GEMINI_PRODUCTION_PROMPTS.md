# Gemini implementation prompts

Use these in order, one milestone per task. Paste the shared instructions with each numbered prompt. Complete and verify the current milestone before starting the next. This is a route to a controlled pilot, not a promise of production readiness.

## Shared instructions — include with every prompt

You are working in the SIC Pizza restaurant platform repository. Inspect the current checkout, applicable AGENTS.md instructions, Git state, package scripts, and actual implementation before editing. Report a concise state and assumptions summary, then implement the requested milestone rather than only proposing a plan. Preserve unrelated changes. Make routine reversible decisions without asking; identify genuine missing external dependencies without inventing successful integrations.

Preserve the existing visual system, mobile-first vertical layout, integer-cent financial calculations, server approval of guest proposals, and restaurant-neutral domain core. Keep SIC Pizza and Sakura demonstration configuration separate from production data. Treat existing documentation as claims to verify, not proof. Do not broaden this task into inventory, loyalty, AI, RFID, or a UI redesign.

Do not print credentials, use credentials from example files, seed live databases, migrate production, purchase services, rotate provider credentials, push, or deploy unless separately authorized. Use only a verified disposable local/test database for integration checks. Never connect tests to DATABASE_URL blindly. Missing runtime configuration must fail clearly, never silently switch a persistent environment to an in-memory demo. Keep explicit demo mode available and clearly labeled.

Run relevant domain and integration tests, lint, typecheck, and build where feasible. Record baseline failures separately from regressions. Do not claim checks passed if skipped. Update affected documentation and provide files changed, tests/results, remaining risks, external setup required, and the exact acceptance criteria met. Distinguish local verification, CI, deployed revision, domain routing, and physical-device validation. Do not claim pilot readiness from unit tests alone.

## Prompt 0 — Correct the baseline and define the persistence contract

Audit the current prototype and produce an evidence-backed implementation baseline. This milestone is documentation and safe configuration hygiene, not production infrastructure changes.

Inspect README.md, docs/ARCHITECTURE.md, docs/ROADMAP.md, docs/BACKLOG.md, db/schema.ts, drizzle migrations, lib/domain/services/session-repository.ts, session-service.ts, models/session.ts, models/idempotency.ts, models/qr.ts, components/pos-demo.tsx, components/guest-session.tsx, and their tests.

Known observations to recheck:
- Staff and guest components each construct their own in-memory repository. The guest route seeds its own session rather than joining shared persisted state.
- Service emit() appends events separately from save(). Opening a session emits events before saving its parent session, which conflicts with the current audit_events foreign key if naively ported to PostgreSQL.
- Domain/demo IDs include strings such as sess_11 and diner_..., while much of the SQL schema expects UUIDs.
- Repository reads are not consistently tenant-scoped; listAll() is unscoped.
- Idempotency is stored on the aggregate and applied to only some commands. The client queue is an in-memory array.
- QR signatures use a custom integer hash and a default secret. The staff PIN gate runs in the browser.
- docs/ROADMAP.md claims the foundation is 100% pilot-ready; that is not supported by these runtime paths.

Create docs/PRODUCTION_BASELINE.md with an implementation matrix: domain logic, browser demo, server implementation, persisted state, multi-device evidence, and unresolved work. Correct unsupported readiness statements in existing docs without discarding completed domain work.

Write a short persistence decision record: prefer authoritative transactional state plus append-only audit events and a durable outbox for the first pilot. Do not call this full event sourcing unless complete replay, event versioning, and deterministic rebuilds are actually implemented and tested. Define an ID mapping strategy, tenant boundary, schema gaps, command transaction contract, concurrency control, and idempotency scope before implementation.

Check tracked configuration for secret-like values without displaying them. Replace credential-bearing example values with placeholders while preserving unrelated edits. Record that any exposed valid credential needs owner/provider rotation; sanitizing a file does not revoke it. Do not rewrite Git history or rotate credentials yourself.

Acceptance: every readiness claim is evidence-backed; no secret values appear in the report; the next milestone has a concrete schema/transaction contract and no assumption that a database is already provisioned or safe to use.

## Prompt 1 — Build transactional PostgreSQL persistence

Implement the agreed persistence contract using the existing Drizzle/PostgreSQL stack. Read the baseline and decision record first. This milestone builds the server persistence foundation; do not expose unauthenticated production mutations or connect the browser directly to PostgreSQL.

Implement a server-only PostgresTableSessionRepository and refactor the service/repository boundary as needed. Do not preserve the existing interface if it cannot express atomic commands safely. Reconcile all persisted domain fields with db/schema.ts, including tenant/location identity, allocations, request lifecycle, kitchen state, session version, and historical price/tax snapshots. Resolve string IDs versus UUIDs explicitly without lossy casts. Use one documented source of truth; avoid independently writable snapshot and relational copies.

Make each command atomically commit state changes, audit events, its durable idempotency result, and outbox records. On any failure all must roll back. Ensure parent records exist before foreign-key-dependent events. Use database locking or optimistic version checks to prevent lost updates. Enforce one active session per scoped table with a database constraint. Apply concurrency protection and durable idempotency to all mutations, including session opening and multi-table operations. Scope keys to authenticated principal/tenant and command as appropriate; reject reuse with a different request payload. Retrying a committed command must return its prior result without duplicate effects.

Make repository access explicitly organization/location scoped, including lookups by ID. Add schema constraints, indexes, forward migrations, and a repeatable synthetic seed for disposable environments. No automatic seeds on app startup. Do not seed production. Keep the in-memory adapter for labeled demos and compatible domain tests.

Acceptance: PostgreSQL integration tests prove restart survival, tenant isolation, atomic rollback, concurrent table opening, concurrent edits, duplicate retries including empty/void results, conflicting key reuse, and exactly one durable kitchen firing effect. Test with separate connections, not only an in-memory fake. If no disposable PostgreSQL is available, deliver the harness and mark execution unverified; do not claim the milestone validated.

## Prompt 2 — Secure staff access and wire a server-authoritative staff workflow

Use the persistence foundation to implement staff authentication, authorization, validated commands, and the first real browser workflow. Do not expose shared data before these controls exist.

Replace the production browser PIN gate with server-side authentication using established libraries. Use Argon2id for new PIN hashes where supported, no seeded production PIN, distributed login throttling, auditable failures, secure session rotation/expiry/revocation, HttpOnly/Secure/SameSite cookies, and CSRF/origin protections. A short PIN is only a constrained staff-device unlock mechanism: define enrolled/trusted device controls and use stronger authentication for administrative access. Never make a short PIN the sole unrestricted Internet-facing administrator credential. Document secure first-admin bootstrap and staff recovery.

Use the actual employee roles in the repository, including kitchen rather than inventing cook. Derive actor, tenant, location, role, and permitted resource scope from authenticated server state. Never trust client-supplied actor IDs, prices, role claims, or tenant IDs as authority. Enforce the role/action matrix for all reads and writes. Recompute prices/modifiers from the authorized catalog and validate every command payload.

Implement scoped command/query endpoints with predictable validation, authorization, conflict, and retry responses. Replace client-owned authoritative services in the staff runtime with an API transport. First complete: sign in -> open table -> add diners/items -> fire course -> kitchen marks ready -> server sees persisted status. Keep payment simulations isolated and explicitly labeled. Unsupported production actions must be visibly unavailable, not fake successes. Polling is acceptable until the realtime milestone.

Acceptance: the workflow survives reload/restart and works in two independent authenticated browser contexts. Tests cover unauthenticated access, role escalation, cross-tenant IDs, tampered prices, CSRF, expired/revoked sessions, inactive employees, and PIN guessing limits across instances. Production bundles contain no demo PIN authentication bypass or server secret.

## Prompt 3 — Implement genuine guest joining and scoped guest sessions

Replace the independently seeded guest runtime with secure access to the same persisted session staff opened. Inspect models/qr.ts, app/join/[code]/page.tsx, components/guest-session.tsx, and guest UI actions.

Remove the custom hash/default-secret validation from production. Use server-generated cryptographically random opaque join tokens stored hashed, or a vetted authenticated-token implementation with expiry, audience, session/tenant binding, revocation, and key rotation. Never send signing secrets to the browser. Exchange a valid join token for a restricted guest session; do not use the QR token as permanent authority on every command. Bind diner identity server-side and enforce permitted guest actions and response-field minimization.

Define how QR codes are physically displayed. A printed QR cannot rotate its printed contents: use an explicit static entry plus controlled admission flow, or a genuinely refreshed staff/table display. Expiry limits token reuse; it does not prove physical presence or revoke an already joined guest. Implement expiry/revocation for guest sessions and invalidate access at table closure/reset so the next party cannot inherit access. Avoid leaking bearer tokens through logs, analytics, or referrers.

Persist proposals and service requests; require staff approval before kitchen firing. Prevent guests from impersonating diners, accessing staff audit data, authorizing payments, changing price, or joining closed/unrelated sessions. Remove false receipt-sent/payment-success notices from persistent mode until backed by real provider evidence.

Acceptance: a separate guest browser joins an existing staff table; proposal approval and service requests round-trip through PostgreSQL. Tampered, expired, revoked, cross-tenant, and closed-session tokens fail. A guest cannot access another diner's private information or retain access across table turnover. Demo /join/SIC-11 remains only an explicitly isolated demo if retained.

## Prompt 4 — Add realtime delivery with recovery

Implement authorized multi-device projections on the committed state/outbox foundation. Verify the intended hosting runtime before choosing SSE, WebSockets, or a managed transport; document the choice and any unverified hosting limits. Do not assume a process-local broadcaster or PostgreSQL notification alone provides durable cross-instance delivery.

Publish only committed changes through a durable cursor/event sequence. Make outbox dispatch retryable and consumers duplicate-tolerant. Authorize subscriptions and projection fields for staff roles and guest session scope. Support reconnect/resume, ordering, duplicate delivery, missed-event detection, retention gaps, and full snapshot resynchronization. Recheck access when sessions expire or are revoked. Show disconnected/stale states honestly. Prefer invalidation plus authorized snapshot fetches where it reduces sensitive data exposure.

Acceptance: separate staff, kitchen, and guest browser contexts see committed updates; two server instances receive changes; restart/reconnect recovers missed updates; rolled-back changes never appear; unauthorized subscriptions fail; expired/revoked subscribers lose access. Record observed update latency without inventing a service guarantee. Include a fallback refresh path and deployment requirements.

## Prompt 5 — Persist offline work and handle uncertain outcomes

Replace the in-memory-only ClientMutationQueue with durable browser storage and a recovery protocol against the server's durable idempotency contract. Inspect models/idempotency.ts and lib/domain/docs/offline-idempotency.md; correct guarantees that have not been demonstrated.

Define a command policy for offline drafts, queued commands requiring review, and prohibited operations. Pending local work must never appear as accepted by the kitchen. Do not automatically replay stale transfers, voids, or course firing without validating current session version and operational state. Persist stable cryptographic command IDs, payloads, order/dependencies, and acknowledgments. Use bounded exponential backoff with jitter; distinguish authorization/conflict/validation failures from connection failures. Prevent duplicate flushes across browser tabs.

Handle refresh, browser restart, response loss after server commit, session closure while offline, account/device switching, logout with pending work, and storage failure. Separate each tenant/user queue so another staff login cannot inherit authority. Reauthorize every replay. Provide a visible conflict/review and unresolved-work workflow; never silently discard failed mutations. Disable offline payments unless a separately approved provider-supported implementation exists; never queue raw card data.

Acceptance: network fault tests prove that a command committed before its response was lost does not fire twice after restart/retry. Pending work survives reload, rejected work remains explainable, and closed-table or wrong-user mutations cannot replay. Verify supported browsers and clearly state whether browser storage durability/device testing remains unverified.

## Prompt 6 — Implement sandbox payments, refunds, and reconciliation

Treat payment-provider and supported-reader selection as a decision gate, not an assumption that Stripe is already configured. Inspect existing payment/allocation logic and confirm merchant country, currency, target devices, tip flow, and provider capability using current official documentation. If selection is unresolved, implement the provider-neutral ledger/state-machine tests and document the exact missing decision before adding a vendor SDK.

For an approved provider, implement sandbox-only payment initiation and provider-supported client/reader collection. Use server-calculated integer-cent balances and separate tip amounts. Never accept browser success as payment truth or store PAN/CVC. Use provider idempotency keys, verified webhooks with durable deduplication, and reconciliation for lost/out-of-order notifications. Represent pending, authorized, captured, failed, cancelled, partially refunded, and refunded outcomes as appropriate to provider capabilities.

Distinguish splitting a check among diners from partially capturing an authorization. Reserve/lock unsettled balances to prevent concurrent overpayment. Prevent check edits from invalidating an in-flight payment without explicit resolution. Make capture, tip adjustment, void, comp, cash tender/change, and partial/full refund semantics explicit. Refunds and comps require authorized actors and reasons; financial history is append-only. Provider HTTP success alone must not erase pending or uncertain financial states. Only confirm receipt delivery if an actual delivery service confirms the corresponding outcome.

Reconcile internal tender totals and provider payments/refunds/fees/payout references, distinguishing a captured payment from bank settlement. Surface unmatched records and uncertain outcomes for manager review. Test rounding, split tenders, tips, duplicate webhooks, failed captures/refunds, concurrent payment attempts, retries, and reconciliation differences. Keep live charging disabled and document merchant onboarding, security/compliance review, reader certification/support, and physical tests still required. Do not describe the application itself as certified because it uses a payment SDK.

## Prompt 7 — Hardware and controlled-pilot release gate

Build the hardware adapter and operational readiness work only on verified preceding milestones. First identify actual target printer, cash drawer, reader, tablet/phone OS, connectivity, and deployment topology. Hardware compatibility research can happen earlier; do not assume an ordinary hosted browser can directly speak TCP ESC/POS to a LAN printer.

Use a supported device SDK or authenticated local bridge as appropriate. Implement durable print jobs with stable IDs, retry policy, status, routing, and audited reprints labeled as reprints. Distinguish queued/sent from physically printed: ambiguous printer acknowledgments require operator resolution rather than promises of exactly-once paper output. Trigger drawers only for authorized cash transactions or audited manager no-sale actions; payment/webhook retries must not repeatedly kick the drawer.

Deliver simulated adapter tests plus a real-device test checklist for printer disconnection, paper-out, bridge restart, reprints, station routing, drawer failure, and reader disconnects. Do not claim physical success without the actual hardware.

Create docs/PILOT_READINESS.md with evidence-based pass/fail/unverified gates: scoped access/security review, concurrency, guest table turnover, recovery from Wi-Fi/server restart, payment/refund/reconciliation tests, backup and demonstrated restore, monitoring/alerts, secret rotation, deployment rollback, supported device/browser checks, staff training, incident response, and manual service fallback. Include a bounded synthetic rehearsal followed by an explicitly approved limited live pilot; no automatic production cutover. Keep the current POS/manual fallback available. Mark blocked external gates honestly and complete all independent local work.

## Reference sources

- OWASP authentication guidance: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP password storage guidance: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- OWASP session management guidance: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- Stripe Terminal refund semantics (only if Stripe is selected): https://docs.stripe.com/terminal/features/refunds
- Stripe Terminal offline payment constraints (only if Stripe is selected): https://docs.stripe.com/terminal/features/operate-offline/collect-card-payments

Recheck current official provider documentation during implementation. These sources do not establish this application's readiness or certification.
