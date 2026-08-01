# Order UTM Attribution + Timeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist first-touch + last-touch UTM/click-id attribution on storefront orders and show Attribution + an extended activity timeline on admin order detail.

**Architecture:** Client captures UTMs into `localStorage` (30-day first-touch); checkout sends `attribution` on `POST /api/orders`; API sanitizes and stores `Order.attribution` snapshot; admin UI renders attribution and builds timeline from attribution + existing order fields (no activity collection).

**Tech Stack:** FastAPI, Beanie/MongoDB, Next.js (App Router), `localStorage`, existing admin order detail page.

## Global Constraints

- First-touch **and** last-touch; first-touch TTL **30 days**
- Params: `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `gclid`, `fbclid` + `landedAt`, `landingPath`
- Snapshot at order create only — never mutate later
- Skip capture on `/admin` routes
- No orders-list UTM filters, no abandoned UTM, no edit attribution (v1)
- Timeline computed in UI only — no new activity collection
- Sanitize strings: trim, max length 200, drop unknown keys

## File map

| File | Responsibility |
|------|----------------|
| `apps/api/app/services/attribution.py` | Sanitize attribution payload |
| `apps/api/tests/test_attribution.py` | Unit tests for sanitize |
| `apps/api/app/documents/__init__.py` | `Order.attribution` field |
| `apps/api/app/routers/orders.py` | Accept + save attribution on create |
| `apps/web/lib/attribution.js` | Capture, storage, snapshot |
| `apps/web/lib/attribution.test.mjs` | Node test runner for pure helpers |
| `apps/web/components/AttributionCapture.jsx` | Run capture on storefront navigations |
| `apps/web/app/layout.js` | Mount `AttributionCapture` |
| `apps/web/app/checkout/page.js` | Attach snapshot to create payloads |
| `apps/web/app/admin/orders/[id]/page.js` | Attribution block + timeline steps |
| `apps/web/lib/orderTimeline.js` | Pure timeline builder (testable) |

---

### Task 1: API sanitize helper + Order field + create wiring

**Files:**
- Create: `apps/api/app/services/attribution.py`
- Create: `apps/api/tests/test_attribution.py`
- Modify: `apps/api/app/documents/__init__.py` (Order class ~141–173)
- Modify: `apps/api/app/routers/orders.py` (`create_order`, Order(...) ~110–133)

**Interfaces:**
- Produces: `sanitize_attribution(raw: Any) -> dict | None`
- Produces: `Order.attribution: Optional[dict] = None`
- Consumes: `body.get("attribution")` in `create_order`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/tests/test_attribution.py`:

```python
from app.services.attribution import sanitize_attribution


def test_sanitize_none_returns_none():
    assert sanitize_attribution(None) is None
    assert sanitize_attribution({}) is None
    assert sanitize_attribution("x") is None


def test_sanitize_keeps_known_fields():
    raw = {
        "firstTouch": {
            "source": " ig ",
            "medium": "cpc",
            "campaign": "summer",
            "content": "banner",
            "term": "hijab",
            "gclid": "g1",
            "fbclid": "f1",
            "landedAt": "2026-07-01T10:00:00.000Z",
            "landingPath": "/shop?utm_source=ig",
            "evil": "drop-me",
        },
        "lastTouch": {
            "source": "google",
            "medium": "organic",
            "campaign": "",
            "landedAt": "2026-07-20T10:00:00.000Z",
            "landingPath": "/",
        },
        "extra": True,
    }
    out = sanitize_attribution(raw)
    assert out is not None
    assert "extra" not in out
    assert out["firstTouch"]["source"] == "ig"
    assert "evil" not in out["firstTouch"]
    assert out["firstTouch"]["gclid"] == "g1"
    assert "campaign" not in out["lastTouch"]  # empty dropped
    assert out["lastTouch"]["source"] == "google"


def test_sanitize_truncates_long_strings():
    long = "x" * 500
    out = sanitize_attribution({"firstTouch": {"source": long}, "lastTouch": None})
    assert out["firstTouch"]["source"] == "x" * 200
    assert out["lastTouch"] is None


def test_sanitize_both_empty_touches_returns_none():
    assert sanitize_attribution({"firstTouch": {}, "lastTouch": {}}) is None
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/ananthuganesh/Documents/siyara/apps/api && .venv/bin/pytest tests/test_attribution.py -v`

Expected: FAIL (module not found / import error)

- [ ] **Step 3: Implement sanitize**

Create `apps/api/app/services/attribution.py`:

```python
"""Sanitize client attribution payloads for Order.attribution."""

from __future__ import annotations

from typing import Any

_TOUCH_KEYS = (
    "source",
    "medium",
    "campaign",
    "content",
    "term",
    "gclid",
    "fbclid",
    "landedAt",
    "landingPath",
)
_MAX_LEN = 200


def _clean_str(value: Any) -> str | None:
    if value is None:
        return None
    s = str(value).strip()
    if not s:
        return None
    return s[:_MAX_LEN]


def _sanitize_touch(raw: Any) -> dict | None:
    if not isinstance(raw, dict):
        return None
    out: dict[str, str] = {}
    for key in _TOUCH_KEYS:
        cleaned = _clean_str(raw.get(key))
        if cleaned is not None:
            out[key] = cleaned
    return out or None


def sanitize_attribution(raw: Any) -> dict | None:
    if not isinstance(raw, dict):
        return None
    first = _sanitize_touch(raw.get("firstTouch"))
    last = _sanitize_touch(raw.get("lastTouch"))
    if first is None and last is None:
        return None
    return {"firstTouch": first, "lastTouch": last}
```

- [ ] **Step 4: Add Order field**

In `apps/api/app/documents/__init__.py`, on `Order`, after `updatedAt` (or near `transactionDetails`):

```python
attribution: Optional[dict] = None
```

(`Optional` and `dict` already imported/used in this file.)

- [ ] **Step 5: Wire create_order**

In `apps/api/app/routers/orders.py`:

1. Import: `from app.services.attribution import sanitize_attribution`
2. Before `Order(...)`:

```python
attribution = sanitize_attribution(body.get("attribution"))
```

3. Pass into constructor:

```python
attribution=attribution,
```

- [ ] **Step 6: Run tests — expect PASS**

Run: `cd /Users/ananthuganesh/Documents/siyara/apps/api && .venv/bin/pytest tests/test_attribution.py -v`

Expected: all PASS

- [ ] **Step 7: Commit**

```bash
cd /Users/ananthuganesh/Documents/siyara
git add apps/api/app/services/attribution.py apps/api/tests/test_attribution.py apps/api/app/documents/__init__.py apps/api/app/routers/orders.py
git commit -m "$(cat <<'EOF'
feat: store sanitized UTM attribution on order create

EOF
)"
```

---

### Task 2: Client attribution lib + capture component

**Files:**
- Create: `apps/web/lib/attribution.js`
- Create: `apps/web/lib/attribution.test.mjs`
- Create: `apps/web/components/AttributionCapture.jsx`
- Modify: `apps/web/app/layout.js`

**Interfaces:**
- Produces: `parseTouchFromLocation({ search, pathname }) -> touch|null`
- Produces: `readStoredAttribution() -> { firstTouch, lastTouch }`
- Produces: `captureAttributionFromLocation(loc) -> void` (mutates localStorage)
- Produces: `getAttributionSnapshot() -> { firstTouch, lastTouch } | null`
- Storage key: `urban-aana-attribution`
- First-touch TTL: `30 * 24 * 60 * 60 * 1000` ms

- [ ] **Step 1: Write failing Node tests**

Create `apps/web/lib/attribution.test.mjs` (Node built-in test runner):

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseTouchFromLocation,
  applyTouchToState,
  FIRST_TOUCH_TTL_MS,
} from "./attribution.js";

describe("parseTouchFromLocation", () => {
  it("returns null without utm or click ids", () => {
    assert.equal(
      parseTouchFromLocation({ search: "", pathname: "/shop" }),
      null
    );
  });

  it("parses utm and click ids", () => {
    const t = parseTouchFromLocation({
      search: "?utm_source=ig&utm_medium=cpc&utm_campaign=summer&gclid=g1",
      pathname: "/shop",
      nowIso: "2026-07-26T00:00:00.000Z",
    });
    assert.equal(t.source, "ig");
    assert.equal(t.medium, "cpc");
    assert.equal(t.campaign, "summer");
    assert.equal(t.gclid, "g1");
    assert.equal(t.landingPath, "/shop?utm_source=ig&utm_medium=cpc&utm_campaign=summer&gclid=g1");
    assert.equal(t.landedAt, "2026-07-26T00:00:00.000Z");
  });
});

describe("applyTouchToState", () => {
  it("sets first and last when empty", () => {
    const touch = {
      source: "ig",
      medium: "cpc",
      landedAt: "2026-07-26T00:00:00.000Z",
      landingPath: "/?utm_source=ig",
    };
    const next = applyTouchToState(null, touch, Date.parse(touch.landedAt));
    assert.deepEqual(next.firstTouch, touch);
    assert.deepEqual(next.lastTouch, touch);
  });

  it("keeps first within TTL and updates last", () => {
    const first = {
      source: "ig",
      medium: "cpc",
      landedAt: "2026-07-01T00:00:00.000Z",
      landingPath: "/?utm_source=ig",
    };
    const last = {
      source: "google",
      medium: "cpc",
      landedAt: "2026-07-20T00:00:00.000Z",
      landingPath: "/?utm_source=google",
    };
    const now = Date.parse("2026-07-20T00:00:00.000Z");
    const next = applyTouchToState({ firstTouch: first, lastTouch: first }, last, now);
    assert.equal(next.firstTouch.source, "ig");
    assert.equal(next.lastTouch.source, "google");
  });

  it("resets first when older than TTL", () => {
    const old = {
      source: "old",
      medium: "cpc",
      landedAt: "2026-01-01T00:00:00.000Z",
      landingPath: "/?utm_source=old",
    };
    const neu = {
      source: "new",
      medium: "cpc",
      landedAt: "2026-07-26T00:00:00.000Z",
      landingPath: "/?utm_source=new",
    };
    const now = Date.parse(neu.landedAt);
    assert.ok(now - Date.parse(old.landedAt) > FIRST_TOUCH_TTL_MS);
    const next = applyTouchToState({ firstTouch: old, lastTouch: old }, neu, now);
    assert.equal(next.firstTouch.source, "new");
    assert.equal(next.lastTouch.source, "new");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/ananthuganesh/Documents/siyara/apps/web && node --test lib/attribution.test.mjs`

Expected: FAIL (cannot find module / exports)

- [ ] **Step 3: Implement `apps/web/lib/attribution.js`**

```js
export const ATTRIBUTION_KEY = "urban-aana-attribution";
export const FIRST_TOUCH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const PARAM_MAP = {
  utm_source: "source",
  utm_medium: "medium",
  utm_campaign: "campaign",
  utm_content: "content",
  utm_term: "term",
  gclid: "gclid",
  fbclid: "fbclid",
};

function truncate(s, n = 200) {
  return String(s).slice(0, n);
}

/** Pure: parse touch from location-like object. */
export function parseTouchFromLocation({ search = "", pathname = "/", nowIso } = {}) {
  const q = new URLSearchParams(
    typeof search === "string" && search.startsWith("?") ? search.slice(1) : search || ""
  );
  const touch = {};
  for (const [param, key] of Object.entries(PARAM_MAP)) {
    const v = q.get(param);
    if (v && String(v).trim()) touch[key] = truncate(String(v).trim());
  }
  if (!Object.keys(touch).length) return null;
  const qs = q.toString();
  touch.landingPath = truncate(qs ? `${pathname}?${qs}` : pathname || "/");
  touch.landedAt = nowIso || new Date().toISOString();
  return touch;
}

/** Pure: merge incoming touch into stored state. */
export function applyTouchToState(prev, touch, nowMs = Date.now()) {
  if (!touch) return prev || { firstTouch: null, lastTouch: null };
  const prevFirst = prev?.firstTouch || null;
  let firstTouch = prevFirst;
  const firstAge =
    prevFirst?.landedAt != null ? nowMs - Date.parse(prevFirst.landedAt) : Infinity;
  if (!prevFirst || Number.isNaN(firstAge) || firstAge > FIRST_TOUCH_TTL_MS) {
    firstTouch = touch;
  }
  return { firstTouch, lastTouch: touch };
}

export function readStoredAttribution() {
  if (typeof window === "undefined") return { firstTouch: null, lastTouch: null };
  try {
    const raw = localStorage.getItem(ATTRIBUTION_KEY);
    if (!raw) return { firstTouch: null, lastTouch: null };
    const parsed = JSON.parse(raw);
    return {
      firstTouch: parsed?.firstTouch || null,
      lastTouch: parsed?.lastTouch || null,
    };
  } catch {
    return { firstTouch: null, lastTouch: null };
  }
}

function writeStoredAttribution(state) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function captureAttributionFromLocation(loc) {
  if (typeof window === "undefined") return;
  const touch = parseTouchFromLocation({
    search: loc?.search ?? window.location.search,
    pathname: loc?.pathname ?? window.location.pathname,
  });
  if (!touch) return;
  const prev = readStoredAttribution();
  const next = applyTouchToState(prev, touch, Date.now());
  writeStoredAttribution(next);
}

/** Snapshot for order create body. */
export function getAttributionSnapshot() {
  const { firstTouch, lastTouch } = readStoredAttribution();
  if (!firstTouch && !lastTouch) return null;
  return { firstTouch, lastTouch };
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /Users/ananthuganesh/Documents/siyara/apps/web && node --test lib/attribution.test.mjs`

Expected: all PASS

- [ ] **Step 5: Add AttributionCapture + mount in layout**

Create `apps/web/components/AttributionCapture.jsx`:

```jsx
"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { captureAttributionFromLocation } from "@/lib/attribution";

function AttributionCaptureInner() {
  const pathname = usePathname() || "";
  const searchParams = useSearchParams();

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;
    const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
    captureAttributionFromLocation({ pathname, search });
  }, [pathname, searchParams]);

  return null;
}

export default function AttributionCapture() {
  return (
    <Suspense fallback={null}>
      <AttributionCaptureInner />
    </Suspense>
  );
}
```

Add missing import:

```jsx
import { Suspense, useEffect } from "react";
```

In `apps/web/app/layout.js`, import and render next to `GtmLoader`:

```jsx
import AttributionCapture from "@/components/AttributionCapture";
// ...
<GtmLoader />
<AttributionCapture />
{children}
```

- [ ] **Step 6: Commit**

```bash
cd /Users/ananthuganesh/Documents/siyara
git add apps/web/lib/attribution.js apps/web/lib/attribution.test.mjs apps/web/components/AttributionCapture.jsx apps/web/app/layout.js
git commit -m "$(cat <<'EOF'
feat: capture first/last UTM attribution in localStorage

EOF
)"
```

---

### Task 3: Attach attribution on checkout create

**Files:**
- Modify: `apps/web/app/checkout/page.js`

**Interfaces:**
- Consumes: `getAttributionSnapshot()` from `@/lib/attribution`
- Produces: `attribution` field on both magic and standard `orderService.create` bodies

- [ ] **Step 1: Import helper**

Near other `@/lib` imports:

```js
import { getAttributionSnapshot } from "@/lib/attribution";
```

- [ ] **Step 2: Magic create (~352)**

Add to the create object:

```js
attribution: getAttributionSnapshot(),
```

- [ ] **Step 3: Standard create (~410 `orderData`)**

Add:

```js
attribution: getAttributionSnapshot(),
```

- [ ] **Step 4: Manual smoke check**

1. Open storefront with `/?utm_source=ig&utm_medium=cpc&utm_campaign=test`
2. DevTools → Application → localStorage → `urban-aana-attribution` present
3. Place a test order (or inspect Network → `POST /api/orders` body includes `attribution`)

- [ ] **Step 5: Commit**

```bash
cd /Users/ananthuganesh/Documents/siyara
git add apps/web/app/checkout/page.js
git commit -m "$(cat <<'EOF'
feat: send attribution snapshot with checkout order create

EOF
)"
```

---

### Task 4: Admin attribution UI + order timeline helper

**Files:**
- Create: `apps/web/lib/orderTimeline.js`
- Create: `apps/web/lib/orderTimeline.test.mjs`
- Modify: `apps/web/app/admin/orders/[id]/page.js` (Attribution block above Order Timeline ~678; replace timeline body)

**Interfaces:**
- Produces: `buildOrderTimeline(order) -> Array<{ id, title, subtitle, at }>`
- Timeline step ids: `first_visit`, `last_touch`, `order_created`, `payment`, `shipped`, `delivered`, `expected_fulfillment`

- [ ] **Step 1: Write timeline tests**

Create `apps/web/lib/orderTimeline.test.mjs`:

```js
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildOrderTimeline, formatTouchLabel } from "./orderTimeline.js";

describe("formatTouchLabel", () => {
  it("joins source/medium/campaign", () => {
    assert.equal(
      formatTouchLabel({ source: "ig", medium: "cpc", campaign: "summer" }),
      "ig / cpc / summer"
    );
  });
});

describe("buildOrderTimeline", () => {
  it("includes first, last (when different), created, payment, shipped, delivered", () => {
    const steps = buildOrderTimeline({
      createdAt: "2026-07-26T12:00:00.000Z",
      attribution: {
        firstTouch: {
          source: "ig",
          medium: "cpc",
          campaign: "a",
          landedAt: "2026-07-01T00:00:00.000Z",
        },
        lastTouch: {
          source: "google",
          medium: "cpc",
          campaign: "b",
          landedAt: "2026-07-20T00:00:00.000Z",
        },
      },
      paymentStatus: "paid",
      transactionDetails: { paymentStatus: "paid", paymentMethod: "razorpay" },
      awb: "AWB1",
      status: "shipped",
      isDelivered: true,
      deliveredAt: "2026-07-28T00:00:00.000Z",
    });
    assert.deepEqual(
      steps.map((s) => s.id),
      ["first_visit", "last_touch", "order_created", "payment", "shipped", "delivered"]
    );
  });

  it("skips last_touch when identical to first", () => {
    const touch = {
      source: "ig",
      medium: "cpc",
      landedAt: "2026-07-01T00:00:00.000Z",
    };
    const steps = buildOrderTimeline({
      createdAt: "2026-07-26T12:00:00.000Z",
      attribution: { firstTouch: touch, lastTouch: touch },
      paymentStatus: "pay_on_delivery",
      transactionDetails: { paymentMethod: "cod", paymentStatus: "pay_on_delivery" },
    });
    assert.deepEqual(
      steps.map((s) => s.id),
      ["first_visit", "order_created", "payment"]
    );
  });

  it("works with no attribution", () => {
    const steps = buildOrderTimeline({
      createdAt: "2026-07-26T12:00:00.000Z",
      paymentStatus: "pending",
    });
    assert.equal(steps[0].id, "order_created");
    assert.ok(steps.some((s) => s.id === "payment"));
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `cd /Users/ananthuganesh/Documents/siyara/apps/web && node --test lib/orderTimeline.test.mjs`

Expected: FAIL

- [ ] **Step 3: Implement `apps/web/lib/orderTimeline.js`**

```js
function touchKey(t) {
  if (!t) return "";
  return [t.source, t.medium, t.campaign, t.content, t.term, t.gclid, t.fbclid]
    .map((x) => (x || "").toLowerCase())
    .join("|");
}

export function formatTouchLabel(touch) {
  if (!touch) return "Direct / none";
  const parts = [touch.source, touch.medium, touch.campaign].filter(Boolean);
  return parts.length ? parts.join(" / ") : "Direct / none";
}

function paymentLabel(order) {
  const status = String(
    order.paymentStatus || order.transactionDetails?.paymentStatus || "pending"
  ).toLowerCase();
  const method = order.transactionDetails?.paymentMethod || order.paymentMethod || "";
  if (status === "paid") return `Paid${method ? ` (${method})` : ""}`;
  if (status === "pay_on_delivery") return "Cash on delivery";
  if (status === "refunded" || status === "partially_refunded") return status;
  return `Payment ${status || "pending"}`;
}

function isShipped(order) {
  if (order.awb) return true;
  const st = String(order.status || "").toLowerCase();
  const ship = String(order.shippingStatus || "").toLowerCase();
  return (
    ["shipped", "out for delivery", "delivered"].includes(st) ||
    ship.includes("ship") ||
    ship.includes("transit") ||
    ship.includes("delivered")
  );
}

export function buildOrderTimeline(order) {
  if (!order) return [];
  const steps = [];
  const attr = order.attribution || {};
  const first = attr.firstTouch || null;
  const last = attr.lastTouch || null;

  if (first) {
    steps.push({
      id: "first_visit",
      title: "First visit",
      subtitle: formatTouchLabel(first),
      at: first.landedAt || null,
    });
  }
  if (last && touchKey(last) !== touchKey(first)) {
    steps.push({
      id: "last_touch",
      title: "Last touch",
      subtitle: formatTouchLabel(last),
      at: last.landedAt || null,
    });
  }

  steps.push({
    id: "order_created",
    title: "Order created",
    subtitle: null,
    at: order.createdAt || null,
  });

  steps.push({
    id: "payment",
    title: paymentLabel(order),
    subtitle: null,
    at: order.createdAt || null,
  });

  if (isShipped(order)) {
    steps.push({
      id: "shipped",
      title: "Shipped",
      subtitle: order.awb ? `AWB ${order.awb}` : order.courier || null,
      at: order.updatedAt || null,
    });
  }

  if (order.isDelivered || String(order.status || "").toLowerCase() === "delivered") {
    steps.push({
      id: "delivered",
      title: "Delivered",
      subtitle: null,
      at: order.deliveredAt || null,
    });
  }

  if (order.deliveryDate) {
    steps.push({
      id: "expected_fulfillment",
      title: "Expected fulfillment",
      subtitle: null,
      at: order.deliveryDate,
    });
  }

  return steps;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd /Users/ananthuganesh/Documents/siyara/apps/web && node --test lib/orderTimeline.test.mjs`

Expected: PASS

- [ ] **Step 5: Wire admin order detail UI**

In `apps/web/app/admin/orders/[id]/page.js`:

1. Import:

```js
import { buildOrderTimeline, formatTouchLabel } from "@/lib/orderTimeline";
```

2. Inside the component (after `order` is available for render), compute:

```js
const timelineSteps = order ? buildOrderTimeline(order) : [];
const firstTouch = order?.attribution?.firstTouch || null;
const lastTouch = order?.attribution?.lastTouch || null;
const sameTouch = firstTouch && lastTouch
  ? formatTouchLabel(firstTouch) === formatTouchLabel(lastTouch) &&
    (firstTouch.gclid || "") === (lastTouch.gclid || "") &&
    (firstTouch.fbclid || "") === (lastTouch.fbclid || "")
  : !firstTouch || !lastTouch;
```

3. Above the existing “Order Timeline” block (~678), add Attribution section matching existing heading styles (`text-[13px] font-[550] text-gray-400`):

```jsx
<div className="pt-6 border-t border-gray-50">
  <h3 className="text-[13px] font-[550] text-gray-400 mb-4 flex items-center gap-2">
    <Tag className="w-3.5 h-3.5" /> Attribution
  </h3>
  {!firstTouch && !lastTouch ? (
    <p className="text-[13px] font-[550] text-gray-500">Direct / none</p>
  ) : sameTouch ? (
    <AttributionTouchRows touch={firstTouch || lastTouch} />
  ) : (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] font-[550] text-gray-400 mb-2">First touch</p>
        <AttributionTouchRows touch={firstTouch} />
      </div>
      <div>
        <p className="text-[12px] font-[550] text-gray-400 mb-2">Last touch</p>
        <AttributionTouchRows touch={lastTouch} />
      </div>
    </div>
  )}
</div>
```

Add a small helper component in the same file (above the page export):

```jsx
function AttributionTouchRows({ touch }) {
  if (!touch) return <p className="text-[13px] font-[550] text-gray-500">Direct / none</p>;
  const rows = [
    ["Source", touch.source],
    ["Medium", touch.medium],
    ["Campaign", touch.campaign],
    ["Content", touch.content],
    ["Term", touch.term],
    ["gclid", touch.gclid],
    ["fbclid", touch.fbclid],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 text-[13px] font-[550]">
          <span className="text-gray-400 shrink-0">{label}</span>
          <span className="text-[#0E1217] text-right break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}
```

4. Replace the timeline inner list with:

```jsx
<div className="space-y-4">
  {timelineSteps.map((step, idx) => (
    <div
      key={step.id}
      className={`flex gap-3 relative ${
        idx < timelineSteps.length - 1
          ? "before:absolute before:left-[7px] before:top-[18px] before:bottom-[-10px] before:w-[2px] before:bg-gray-100"
          : ""
      }`}
    >
      <div className="w-4 h-4 rounded-full bg-primary shrink-0 z-10 border-2 border-white" />
      <div className="flex-1">
        <p className="text-[13px] font-[550] text-primary leading-tight">{step.title}</p>
        {step.subtitle ? (
          <p className="text-[13px] text-gray-500 font-[550]">{step.subtitle}</p>
        ) : null}
        {step.at ? (
          <p className="text-[13px] text-gray-400 font-[550]">
            {new Date(step.at).toLocaleString()}
          </p>
        ) : null}
      </div>
    </div>
  ))}
</div>
```

Remove the old hard-coded “Order Created” / “Expected Fullfillment” blocks (they are covered by `buildOrderTimeline`).

- [ ] **Step 6: Commit**

```bash
cd /Users/ananthuganesh/Documents/siyara
git add apps/web/lib/orderTimeline.js apps/web/lib/orderTimeline.test.mjs apps/web/app/admin/orders/[id]/page.js
git commit -m "$(cat <<'EOF'
feat: show order attribution and activity timeline in admin

EOF
)"
```

---

## Spec coverage checklist

| Spec requirement | Task |
|------------------|------|
| Capture UTM + gclid/fbclid | Task 2 |
| First + last touch, 30d TTL | Task 2 |
| Send on order create | Task 3 |
| Sanitize + `Order.attribution` | Task 1 |
| Admin Attribution block | Task 4 |
| Timeline: first/last/created/payment/shipped/delivered | Task 4 |
| Skip empty steps / Direct none | Task 4 |
| Out of scope list filters / abandoned / edit | Not implemented (intentional) |

## Self-review notes

- No TBD placeholders.
- Function names consistent: `sanitize_attribution`, `getAttributionSnapshot`, `buildOrderTimeline`.
- Payment verify/webhooks untouched (attribution at create only).
