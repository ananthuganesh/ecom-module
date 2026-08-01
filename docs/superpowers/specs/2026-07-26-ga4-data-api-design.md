# GA4 Data API — admin Analytics

**Date:** 2026-07-26  
**Scope:** Traffic insights beside existing order (Mongo) analytics.

## Decision

- **Sales KPIs** stay on `GET /api/orders/stats` (Mongo).
- **Traffic** from Google Analytics Data API v1beta (`runReport` + `runRealtimeReport`).
- Secrets env-only (same as GTM): no writable admin forms for credentials.

## Env

| Var | Purpose |
|---|---|
| `GA4_PROPERTY_ID` | Numeric GA4 property ID |
| `GA4_CREDENTIALS_JSON` | Service account JSON (preferred) |
| `GA4_CREDENTIALS_FILE` | Optional path to JSON key file |
| `GA4_ENABLED` | Default `true`; requires property + creds |

Service account needs **Viewer** on the GA4 property.

## API

- `GET /api/admin/ga4/settings` — status only (configured?, propertyId masked)
- `GET /api/admin/ga4/report?range=7d|30d|90d|365d` — KPIs, top pages, sources, realtime

## Admin UI

- Analytics page: new **Website traffic** section (KPIs, top pages, sources, users right now)
- Settings → Integrations → Google Analytics (read-only status)

## Graceful degradation

If GA4 not configured or API errors: show muted empty/error state; do not break sales analytics.
