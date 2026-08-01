function touchKey(t) {
  if (!t) return "";
  return [t.source, t.medium, t.campaign, t.content, t.term, t.gclid, t.fbclid]
    .map((x) => (x || "").toLowerCase())
    .join("|");
}

function normalizeTouchPath(path) {
  return String(path || "").trim().toLowerCase();
}

function firstPresent(...values) {
  for (const value of values) {
    if (value) return value;
  }
  return null;
}

function orderRef(order) {
  const raw = order?.orderNumber != null ? String(order.orderNumber).trim() : "";
  if (raw) return `#${raw.replace(/^#+/, "")}`;
  const id = order?._id != null ? String(order._id) : "";
  return id ? `#${id.slice(-6).toUpperCase()}` : null;
}

function awbCode(order) {
  return String(order.awbCode || order.awb || "").trim() || null;
}

function dtdcBookedAt(order) {
  return firstPresent(
    order.transactionDetails?.dtdc?.createdAt,
    order.shippedAt,
    order.shipmentCreatedAt,
    order.shippingCreatedAt,
    order.transactionDetails?.shipment?.createdAt,
    order.transactionDetails?.shipping?.createdAt
  );
}

function payStatusOf(order) {
  return String(
    order.paymentStatus || order.transactionDetails?.paymentStatus || "pending"
  ).toLowerCase();
}

function shippingStatusOf(order) {
  return String(order.shippingStatus || "").trim();
}

function shippingStatusKey(order) {
  return shippingStatusOf(order).toLowerCase();
}

export function touchesEqual(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return touchKey(a) === touchKey(b) && normalizeTouchPath(a.landingPath) === normalizeTouchPath(b.landingPath);
}

export function formatTouchLabel(touch) {
  if (!touch) return "Direct / none";
  const parts = [touch.source, touch.medium, touch.campaign].filter(Boolean);
  return parts.length ? parts.join(" / ") : "Direct / none";
}

function customerDisplayName(order) {
  const customer =
    order?.customerId && typeof order.customerId === "object"
      ? order.customerId
      : order?.user && typeof order.user === "object"
        ? order.user
        : null;
  const ship = order?.shippingAddress || {};
  const name =
    [customer?.name, order?.customerName, order?.name, ship?.name, ship?.fullName]
      .map((v) => String(v || "").replace(/\s+/g, " ").trim())
      .find((v) => v && !/^guest(\s+user)?$/i.test(v)) || "";
  return name;
}

function formatMoneyINR(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₹${n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isDelivered(order) {
  return (
    !!order.isDelivered ||
    String(order.status || "").toLowerCase() === "delivered" ||
    shippingStatusKey(order) === "delivered"
  );
}

function isCancelled(order) {
  return String(order.status || "").toLowerCase() === "cancelled";
}

function hasAwb(order) {
  return !!awbCode(order);
}

function isInTransitLike(order) {
  const ship = shippingStatusKey(order);
  const st = String(order.status || "").toLowerCase();
  return (
    ship.includes("transit") ||
    ship.includes("out for delivery") ||
    ["shipped", "out for delivery"].includes(st)
  );
}

/** Local calendar day key YYYY-MM-DD for grouping. */
export function timelineDayKey(iso) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "unknown";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Shopify-style day label: Today / Yesterday / July 26 */
export function formatTimelineDayLabel(iso, now = new Date()) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const startOf = (date) =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOf(now) - startOf(d)) / dayMs);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/** Time only, e.g. 9:55 PM */
export function formatTimelineTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Newest-first steps grouped by calendar day.
 * Fulfillment chain uses lifecycle seq so Delivered > Shipped > AWB > Fulfilled.
 * pin: "bottom" keeps schedule-like rows under activity.
 */
export function groupTimelineByDay(steps, now = new Date()) {
  const timeOf = (step) => {
    const raw = step?.sortAt || step?.at;
    if (!raw) return Number.NEGATIVE_INFINITY;
    const t = new Date(raw).getTime();
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };

  const withIndex = (steps || []).map((step, index) => ({ step, index }));
  withIndex.sort((a, b) => {
    const pinA = a.step.pin === "bottom" ? 1 : 0;
    const pinB = b.step.pin === "bottom" ? 1 : 0;
    if (pinA !== pinB) return pinA - pinB;

    const seqA = Number(a.step.seq || 0);
    const seqB = Number(b.step.seq || 0);
    if (seqA && seqB && seqA !== seqB) {
      return seqB - seqA;
    }

    const ta = timeOf(a.step);
    const tb = timeOf(b.step);
    if (tb !== ta) return tb - ta;
    return b.index - a.index;
  });
  const sorted = withIndex.map(({ step }) => step);

  // Group by calendar day of the activity time (or sortAt)
  const groups = [];
  const byKey = new Map();
  for (const step of sorted) {
    const key = timelineDayKey(step.sortAt || step.at);
    if (!byKey.has(key)) {
      const group = {
        key,
        label: formatTimelineDayLabel(step.sortAt || step.at, now),
        steps: [],
      };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).steps.push(step);
  }

  // Day groups: newest day first (by first step's time in already seq-sorted list,
  // but re-order groups by max seq/time so Delivered day stays above older days)
  groups.sort((ga, gb) => {
    const maxSeq = (g) => Math.max(0, ...g.steps.map((s) => Number(s.seq || 0)));
    const maxTime = (g) => Math.max(...g.steps.map((s) => timeOf(s)), Number.NEGATIVE_INFINITY);
    const sa = maxSeq(ga);
    const sb = maxSeq(gb);
    if (sa !== sb) return sb - sa;
    return maxTime(gb) - maxTime(ga);
  });

  // Keep steps inside each day in seq/time order (same comparator)
  for (const group of groups) {
    group.steps.sort((a, b) => {
      const seqA = Number(a.seq || 0);
      const seqB = Number(b.seq || 0);
      if (seqA && seqB && seqA !== seqB) return seqB - seqA;
      const ta = timeOf(a);
      const tb = timeOf(b);
      if (tb !== ta) return tb - ta;
      return 0;
    });
  }

  return groups;
}

/**
 * Order activity timeline (ops-focused):
 * Order placed → Confirmation → Payment → Fulfilled → DTDC AWB →
 * DTDC shipped → DTDC delivered → Cancel / Refund
 */
export function buildOrderTimeline(order) {
  if (!order) return [];
  const steps = [];
  const createdAt = order.createdAt || null;
  const updatedAt = order.updatedAt || createdAt;
  const ref = orderRef(order);
  const customer = customerDisplayName(order);
  const payStatus = payStatusOf(order);
  const amountText = formatMoneyINR(order.finalPrice ?? order.total ?? order.amount);
  const method = String(
    order.transactionDetails?.paymentMethod || order.paymentMethod || ""
  ).trim();
  const paidAt =
    order.transactionDetails?.paidAt || order.paidAt || createdAt || null;
  const awb = awbCode(order);
  const bookedAt = dtdcBookedAt(order);
  const shipLabel = shippingStatusOf(order);
  const deliveredAt = order.deliveredAt || null;

  // Stable lifecycle ranks (higher = later = closer to top when times are close/messy)
  const SEQ = {
    order_placed: 10,
    confirmation: 20,
    payment: 30,
    fulfilled: 40,
    dtdc_awb: 50,
    dtdc_shipped: 60,
    dtdc_ofd: 70,
    dtdc_delivered: 80,
    cancelled: 90,
    refund: 100,
  };

  // 1) Order placed
  steps.push({
    id: "order_placed",
    type: "order",
    seq: SEQ.order_placed,
    title: "Order placed",
    subtitle: customer ? `Customer · ${customer}` : null,
    at: createdAt,
    sortAt: createdAt,
  });

  // 2) Confirmation
  steps.push({
    id: "confirmation",
    type: "confirmation",
    seq: SEQ.confirmation,
    title: ref
      ? `Confirmation ${ref} was generated for this order.`
      : "Confirmation was generated for this order.",
    subtitle: null,
    at: createdAt,
    sortAt: createdAt,
  });

  // 3) Payment
  if (payStatus === "paid" || payStatus === "pay_on_delivery") {
    steps.push({
      id: "payment",
      type: "payment",
      seq: SEQ.payment,
      title: payStatus === "pay_on_delivery" ? "Cash on delivery" : "Payment received",
      subtitle: [amountText, method ? method.toUpperCase() : null].filter(Boolean).join(" · ") || null,
      at: paidAt,
      sortAt: paidAt,
      tone: "success",
    });
  } else if (payStatus && payStatus !== "pending") {
    steps.push({
      id: "payment",
      type: "payment",
      seq: SEQ.payment,
      title: `Payment ${payStatus.replace(/_/g, " ")}`,
      subtitle: amountText,
      at: createdAt,
      sortAt: createdAt,
    });
  }

  // 4–7) Fulfillment / DTDC — never use updatedAt for early steps (it jumps after delivery)
  if (hasAwb(order)) {
    const fulfillAt = bookedAt || paidAt || createdAt;
    steps.push({
      id: "fulfilled",
      type: "fulfilled",
      seq: SEQ.fulfilled,
      title: "Marked as fulfilled",
      subtitle: "DTDC consignment booked",
      at: bookedAt || null,
      sortAt: fulfillAt,
      tone: "success",
    });

    steps.push({
      id: "dtdc_awb",
      type: "shipped",
      seq: SEQ.dtdc_awb,
      title: `DTDC assigned AWB ${awb}`,
      subtitle: order.courier || order.transactionDetails?.dtdc?.courier_partner || "DTDC",
      at: bookedAt || null,
      sortAt: fulfillAt,
      tone: "info",
    });

    if (isInTransitLike(order) || isDelivered(order)) {
      const shippedWhen =
        order.transactionDetails?.dtdc?.shippedAt ||
        (isDelivered(order) ? deliveredAt : null) ||
        fulfillAt;
      steps.push({
        id: "dtdc_shipped",
        type: "shipped",
        seq: SEQ.dtdc_shipped,
        title: "DTDC shipped",
        subtitle: shipLabel && !/^delivered$/i.test(shipLabel) ? shipLabel : "In transit",
        at: order.transactionDetails?.dtdc?.shippedAt || null,
        sortAt: shippedWhen,
        tone: "success",
      });
    }

    if (shippingStatusKey(order).includes("out for delivery")) {
      steps.push({
        id: "dtdc_ofd",
        type: "shipped",
        seq: SEQ.dtdc_ofd,
        title: "DTDC out for delivery",
        subtitle: null,
        at: deliveredAt || fulfillAt,
        sortAt: deliveredAt || fulfillAt,
        tone: "success",
      });
    }

    if (isDelivered(order)) {
      steps.push({
        id: "dtdc_delivered",
        type: "delivered",
        seq: SEQ.dtdc_delivered,
        title: "DTDC delivered",
        subtitle: null,
        at: deliveredAt,
        sortAt: deliveredAt || fulfillAt,
        tone: "success",
      });
    }
  }

  // Cancel
  if (isCancelled(order)) {
    const cancelledAt = order.cancelledAt || updatedAt || createdAt;
    steps.push({
      id: "cancelled",
      type: "cancelled",
      seq: SEQ.cancelled,
      title: "Order cancelled",
      subtitle: hasAwb(order) ? `AWB ${awb}` : null,
      at: cancelledAt,
      sortAt: cancelledAt,
      tone: "critical",
    });
  }

  // Refund
  if (payStatus === "refunded" || payStatus === "partially_refunded") {
    const refundedAmount = formatMoneyINR(
      order.refundedAmount ?? order.transactionDetails?.refundedAmount
    );
    const refundAt =
      order.transactionDetails?.refundedAt ||
      order.refundedAt ||
      updatedAt ||
      createdAt;
    steps.push({
      id: "refund",
      type: "refund",
      seq: SEQ.refund,
      title: payStatus === "partially_refunded" ? "Partial refund issued" : "Refund issued",
      subtitle: refundedAmount ? `${refundedAmount} refunded` : null,
      at: refundAt,
      sortAt: refundAt,
      tone: "critical",
    });
  }

  return steps;
}
