# ADR-0001: Authenticated tenant context is mandatory for persisted commands

**Status:** Implemented and locally verified against disposable PostgreSQL
**Date:** 2026-09-01

## Context

The PostgreSQL repository requires organization and location scope, but the current `TableSessionService` command methods accept a session ID and later call legacy repository methods without a `TenantContext`. The PostgreSQL adapter compensates by manufacturing a `default` location for those calls. Authenticated API routes therefore cannot reliably carry their verified organization and location through the business-service boundary.

Several persistence tests exercise `InMemoryTableSessionRepository` while describing PostgreSQL guarantees. The optional live harness also succeeds without running a database assertion when `TEST_DATABASE_URL` is absent. Those tests remain useful domain tests, but they do not establish restart survival, database constraints, cross-connection concurrency, or tenant isolation in PostgreSQL.

## Decision

1. Every server command and query will require an immutable execution context containing `organizationId`, `locationId`, and authenticated principal identity.
2. Business services will pass that context to every repository read and transactional commit. Server code must not use the legacy unscoped repository overloads.
3. PostgreSQL queries will match both organization and location exactly. `NULL` tenant fields and manufactured default contexts will not be accepted as compatibility paths for persistent records.
4. The database schema will make organization and location ownership non-null where the record is tenant-owned and will enforce the active-table and idempotency uniqueness rules with database constraints.
5. PostgreSQL acceptance tests will require an explicitly named disposable `TEST_DATABASE_URL`, verify that it points to an approved disposable database, apply migrations, and run with separate connections. Missing configuration will be reported as unverified rather than passed.
6. Runtime persistence fails closed when `DATABASE_URL` is absent. In-memory behavior is permitted only when `SIC_DEMO_MODE=true` or through explicit test injection, and must remain synthetic and labeled.

## Consequences

The existing browser demo and in-memory domain tests remain available. Server-created services are now bound to authenticated organization/location context, PostgreSQL queries require exact scope, state/audit/outbox writes share one repository transaction, and migration `0003_premium_sentinel.sql` adds non-null ownership plus active-session and idempotency uniqueness constraints.

A disposable PostgreSQL harness exists at `tests/integration/postgres-persistence.integration.ts`. On 2026-09-01, migration `0003` and all four integration scenarios passed against an ephemeral local PostgreSQL 17 container: separate-connection restart survival, exact cross-tenant denial, concurrent active-table exclusion, atomic rollback after a late audit failure, and durable idempotency response/conflict behavior. The container and its synthetic data were removed afterward. The configured Neon `DATABASE_URL` was not migrated, seeded, or tested.

Payments, realtime delivery, offline replay, and hardware adapters remain simulations or unverified integrations until they run on this corrected persisted command path. Durable service-level command replay beyond the repository contract still needs endpoint-level PostgreSQL verification.

No production migration, deployment, provider change, or live-data access is authorized by this ADR.
