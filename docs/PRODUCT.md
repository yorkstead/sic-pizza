# Product Definition & Stakeholder Experience

## 1. Product Philosophy

Hospitality is human connection. Most restaurant software adds friction: complex nested POS menus, awkward bill-splitting at checkout, lost guest refill requests, and chaotic kitchen paper tickets.

The platform eliminates unnecessary friction through **contextual projections**:

```
                       ┌─────────────────────────┐
                       │   TABLE SESSION ENGINE  │
                       └────────────┬────────────┘
         ┌──────────────┬───────────┼───────────┬──────────────┐
         ▼              ▼           ▼           ▼              ▼
   [Server Phone]  [Guest QR]   [Line KDS]    [Expo]     [Manager Hub]
```

---

## 2. Stakeholder Projections

### A. The Server (Mobile Handheld)
- **Ergonomics**: Optimized for one-handed thumb use on the floor.
- **Floor View**: Answers *"Which table needs me right now?"* at a glance.
- **Table Session**: Live course state, diner breakdown, active items, pending requests, pre-split check totals.
- **Proposal Approval Gate**: 1-tap review for items added by guests from their phones.
- **Instant Table Handoffs**: State-derived shift transfers with zero verbal brain dumps.

### B. The Guest (QR Mobile Web App)
- **Zero Friction**: No account creation, no app download, fast instant access via rotating QR tokens.
- **Capabilities**: Browse menu, configure semantic modifiers, propose items to the server, claim shared item shares, request refills/condiments/boxes/check, and pay their portion.
- **Hospitality Preserved**: Empowers the guest without replacing the server.

### C. Kitchen Line Cooks & Bartenders (Multi-Station KDS)
- **Clear Intent**: Modifiers formatted with placement indicators (`[Left 1/2]`, `NO`, `EXTRA`, `SIDE`).
- **Station-Specific Routing**: Each station only sees relevant items (e.g., Pizza Station deck, Fry, Salad, Bar).
- **High-Contrast Touch Controls**: Large buttons for 1-tap status advances (`QUEUED` $\to$ `ACCEPTED` $\to$ `IN_PREP` $\to$ `READY`).

### D. The Expo Master
- **Table Consolidation**: Tracks all stations simultaneously to ensure hot food and cold salads land on trays together.
- **Runner Dispatch**: 1-tap mark as `DELIVERED` when the runner takes the tray to the dining room.

### E. The Floor Manager (Live Command Center)
- **Live Operations**: Answers *"What is going wrong right now?"* without vanity SaaS charts.
- **Focus Areas**: Needs Attention (food complaints, overdue tables), Kitchen Flow (line bottlenecks), Dining Room occupancy, Staff Load balancing, and Payment Exceptions.
- **Manager Interventions**: 1-tap table reassignments, escalation comp resolutions, 86'd inventory stock toggling.

### F. The Restaurant Operator (Service Analytics)
- **Telemetry That Explains Why**: Greet time ($\le 2\text{m}$), seated-to-order ($\le 8\text{m}$), station ticket cook times, runner delivery lag, check settlement duration, table turn duration, void rates, and remake frequencies.
