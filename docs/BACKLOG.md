# Phased backlog

## Phase 0 — foundation (this milestone)

- [x] App Router/Bun/Tailwind/shadcn-style foundation and dark-first token system
- [x] Staff PIN → floor → table/diners → pizza → review → KDS → split-pay demo
- [x] Guest join/proposal prototype and server confirmation gate
- [x] Domain rules, Drizzle schema, payment seam, voice policy, audit history
- [x] Pricing/modifier and transition tests

## Phase 1 — durable service

- [ ] PostgreSQL migrations, seed command, repository layer, transactional command handlers
- [ ] Salted PIN hashes, rate limits, device sessions, RBAC and location scoping
- [ ] Short-lived rotating join tokens stored only as hashes
- [ ] Optimistic concurrency, idempotency keys, and live KDS/table projections
- [ ] Menu/version management, availability, allergens and station routing

## Phase 2 — operational POS

- [ ] Fire/hold/coursing, void/comp permissions, offline recovery and printer routing
- [ ] Taxes, service charges, discounts, cash drawer and shift reconciliation
- [ ] Payment provider certification, partial authorization, decline, refund and chargeback flows
- [ ] Accessibility and device lab; kitchen latency/load testing; security review

## Phase 3 — management and learning

- [ ] Manager voice controls with preview and protected sensitive categories
- [ ] Reporting, labor/menu analytics, audit export and retention controls
- [ ] Multi-location menu inheritance and organization-level policy
