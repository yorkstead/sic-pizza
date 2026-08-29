# Core Event Model

## Overview

The Restaurant Operating System relies on an **append-only event model** to record all state transitions across table sessions, orders, kitchen stations, service tasks, and payments.

Every mutation creates an immutable domain event that provides:
1. Complete operational auditability for table handoffs and post-shift reporting.
2. Reactive synchronization across all stakeholder projections (Guest, Server, Kitchen, Expo, Manager).
3. Resilient event-driven integration with receipt printers, payment terminals, and telemetry collectors.

---

## 1. Domain Event Envelope

Every event adheres to a strict canonical structure:

```typescript
export type ActorType = "employee" | "guest" | "system";

export type DomainEventEnvelope<TPayload = Record<string, unknown>> = {
  id: string; // UUID v7 or v4
  locationId: string; // Tenant & Location boundary
  sessionId: string; // Table session aggregate root
  aggregateType: "session" | "order" | "item" | "kitchen" | "service_task" | "payment";
  aggregateId: string;
  type: string; // Domain event type name
  actorType: ActorType;
  actorId?: string; // Employee UUID, guest diner ID, or "system"
  occurredAt: string; // ISO 8601 UTC timestamp
  version: number; // Aggregate sequence version
  payload: TPayload;
};
```

---

## 2. Event Taxonomy by Subsystem

### Table Session Events
- `SESSION_OPENED`: Initiated when a server or host opens a table session.
  - *Payload*: `{ tableId, tableName, openedByEmployeeId, capacity }`
- `DINER_JOINED`: Guest joins via QR token or server adds a diner.
  - *Payload*: `{ dinerId, displayName, joinMethod: "qr" | "server" }`
- `DINER_LEFT`: Diner departs or is removed from the session.
  - *Payload*: `{ dinerId }`
- `SESSION_TRANSFERRED`: Table handed off to a different server.
  - *Payload*: `{ fromEmployeeId, toEmployeeId, reason }`
- `SESSION_CLOSED`: Table session finalized after full payment and table clearing.
  - *Payload*: `{ closedAt, totalPaidCents, closedByEmployeeId }`

### Ordering & Item Lifecycle Events
- `ITEM_PROPOSED`: Guest proposes an item via the mobile join view.
  - *Payload*: `{ itemId, dinerId, menuItemId, name, quantity, unitPriceCents, course, modifiers }`
- `ITEM_CONFIRMED`: Server approves a guest proposal.
  - *Payload*: `{ itemId, confirmedByEmployeeId }`
- `ITEM_ADDED`: Server directly adds an item to the table order.
  - *Payload*: `{ itemId, dinerId, menuItemId, name, quantity, unitPriceCents, course, modifiers }`
- `ITEM_VOIDED`: Server or manager voids an unmade or returned item.
  - *Payload*: `{ itemId, voidReason, authorizedByEmployeeId }`
- `COURSE_FIRED`: Server fires an entire course (e.g. Starters or Mains).
  - *Payload*: `{ course: "drinks" | "starters" | "mains" | "desserts", itemIds: string[] }`
- `COURSE_HELD`: Server holds a course from kitchen prep.
  - *Payload*: `{ course: string, itemIds: string[] }`

### Kitchen & Station Events
- `ORDER_SUBMITTED`: Order items dispatched to kitchen station queues.
  - *Payload*: `{ orderId, itemIds: string[], targetStations: string[] }`
- `STATION_PREPARATION_STARTED`: Line cook starts preparing a ticket/item at a station.
  - *Payload*: `{ stationId, itemId, startedByEmployeeId }`
- `STATION_ITEM_COMPLETED`: Station finishes item prep (bumped to Expo).
  - *Payload*: `{ stationId, itemId, completedAt }`
- `EXPO_COURSE_ASSEMBLED`: Expediter verifies all items for a table course are ready.
  - *Payload*: `{ course: string, itemIds: string[], expoEmployeeId }`
- `EXPO_RUNNER_DISPATCHED`: Runner assigned to deliver assembled course to table.
  - *Payload*: `{ runnerEmployeeId, tableId, itemIds: string[] }`
- `ITEM_DELIVERED`: Food runner marks items delivered at the table.
  - *Payload*: `{ itemIds: string[], deliveredByEmployeeId }`

### Operational Service Tasks
- `SERVICE_TASK_REQUESTED`: Guest or staff requests assistance.
  - *Payload*: `{ taskId, taskType: "water" | "help" | "condiments" | "check" | "clean", tableId, dinerId? }`
- `SERVICE_TASK_CLAIMED`: Server or runner acknowledges and claims the task.
  - *Payload*: `{ taskId, claimedByEmployeeId }`
- `SERVICE_TASK_COMPLETED`: Task fulfilled and cleared from board.
  - *Payload*: `{ taskId, completedByEmployeeId }`

### Payments & Settlement Events
- `SPLIT_ALLOCATION_CONFIGURED`: Diners configure equal, itemized, or custom split.
  - *Payload*: `{ splitType: "equal" | "itemized" | "custom", allocations: Array<{ dinerId, amountCents }> }`
- `PAYMENT_AUTHORIZED`: Payment authorization succeeded for a portion of the bill.
  - *Payload*: `{ paymentId, dinerId, amountCents, tipCents, provider, transactionRef }`
- `PAYMENT_FAILED`: Payment attempt declined or failed.
  - *Payload*: `{ paymentId, dinerId, amountCents, errorCode, neutralMessage }`
- `ORDER_SETTLED`: All allocated balances reached $0.00; table marked paid.
  - *Payload*: `{ orderId, totalCents, totalTipCents, paymentCount }`
