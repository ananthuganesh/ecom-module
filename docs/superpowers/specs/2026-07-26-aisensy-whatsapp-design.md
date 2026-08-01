# AiSensy WhatsApp — v1 design

**Date:** 2026-07-26  
**Scope:** Settings + contact sync + abandoned recovery + order templates (placed / paid / shipped / delivered). No Marketing campaign blast UI yet.

## Approach

- Templates and Live API campaigns are created/approved in AiSensy.
- Urban Aana Settings map each store event → exact AiSensy campaign name.
- Sends use `POST https://backend.aisensy.com/campaign/t1/api/v2`.
- Optional Project API password enables bulk contact sync; campaign sends also auto-create contacts.

## Events

| Event | Trigger | Default template params |
|-------|---------|-------------------------|
| `abandoned` | Auto after idle ≥15 min (configurable); admin can still send manually | name, amount, item count, cart link |
| `orderPlaced` | Non-magic checkout create; Magic complete | name, order #, amount |
| `orderPaid` | Payment verify / webhook / Magic paid | name, order #, amount |
| `orderShipped` | DTDC create consignment; admin status `shipped` | name, order #, AWB |
| `orderDelivered` | DTDC track → Delivered; admin status `delivered` | name, order # |

Abandoned auto-recovery runs every ~60s in the API process. Sends once per checkout (`recoverySentAt`). Requires phone on the checkout (or linked user).

Order sends are idempotent per order+event via `transactionDetails.aisensy`.

## UI

- Settings → Integrations → AiSensy
- Marketing → WhatsApp shows mapped events (not mock templates)
- Orders → Abandoned → Send Recovery Reminder
