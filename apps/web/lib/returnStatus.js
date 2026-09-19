/**
 * Return progress on an order, for the admin status badge and activity.
 * Orders carry `returns` (newest first) from the API's return requests.
 */

const STAGES = {
  requested: { label: "Return requested", tone: "review", needsAction: true },
  approved: { label: "Return approved", tone: "info", needsAction: true },
  picked_up: { label: "Return in transit", tone: "info", needsAction: true },
  received: { label: "Returned", tone: "neutral", needsAction: false },
};

/** The return that currently defines the order's state, or null. */
export function activeReturn(order) {
  const list = Array.isArray(order?.returns) ? order.returns : [];
  return list.find((r) => STAGES[String(r?.status || "").toLowerCase()]) || null;
}

/**
 * Badge for an order with a return under way: replaces "Delivered" so the
 * list and detail page show where the return is. Null when there's none.
 */
export function returnStatusDisplay(order) {
  const current = activeReturn(order);
  if (current) {
    const stage = STAGES[String(current.status).toLowerCase()];
    return { key: stage.label, label: stage.label, tone: stage.tone, needsAction: stage.needsAction };
  }
  const status = String(order?.status || "").trim().toLowerCase();
  if (status === "return requested") {
    return { key: "Return requested", label: "Return requested", tone: "review", needsAction: true };
  }
  if (status === "returned") {
    return { key: "Returned", label: "Returned", tone: "neutral", needsAction: false };
  }
  return null;
}

function money(amount) {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? `₹${n.toLocaleString("en-IN")}` : null;
}

/** Activity steps for every return on the order (rejected/cancelled included). */
export function returnTimelineSteps(order, seqBase = 110) {
  const list = Array.isArray(order?.returns) ? order.returns : [];
  const steps = [];
  for (const r of list) {
    const id = r._id || r.number;
    const items = Number(r.itemCount) > 0 ? `${r.itemCount} item${Number(r.itemCount) === 1 ? "" : "s"}` : null;
    if (r.requestedAt) {
      steps.push({
        id: `return_requested_${id}`,
        type: "return",
        seq: seqBase,
        title: `Return ${r.number} requested`,
        subtitle: [items, r.reason, money(r.refundAmount) && `Refund due ${money(r.refundAmount)}`]
          .filter(Boolean)
          .join(" · ") || null,
        at: r.requestedAt,
        sortAt: r.requestedAt,
        tone: "info",
      });
    }
    if (r.approvedAt) {
      const pickup = r.awb
        ? `Delhivery pickup booked · AWB ${r.awb}`
        : r.pickupServiceable === false
          ? `Delhivery can't collect — arrange pickup manually${r.pickupNote ? ` (${r.pickupNote})` : ""}`
          : null;
      steps.push({
        id: `return_approved_${id}`,
        type: "return",
        seq: seqBase + 1,
        title: `Return ${r.number} approved`,
        subtitle: pickup,
        at: r.approvedAt,
        sortAt: r.approvedAt,
        tone: r.pickupServiceable === false ? "critical" : "success",
      });
    }
    if (r.pickedUpAt) {
      steps.push({
        id: `return_picked_${id}`,
        type: "return",
        seq: seqBase + 2,
        title: `Return ${r.number} picked up`,
        subtitle: r.awb ? `AWB ${r.awb}` : null,
        at: r.pickedUpAt,
        sortAt: r.pickedUpAt,
        tone: "info",
      });
    }
    if (r.receivedAt) {
      steps.push({
        id: `return_received_${id}`,
        type: "return",
        seq: seqBase + 3,
        title: `Return ${r.number} received`,
        subtitle: money(r.refundAmount) ? `Restocked · refund ${money(r.refundAmount)} due` : "Restocked",
        at: r.receivedAt,
        sortAt: r.receivedAt,
        tone: "success",
      });
    }
    if (r.rejectedAt || String(r.status).toLowerCase() === "rejected") {
      const at = r.rejectedAt || r.requestedAt;
      steps.push({
        id: `return_rejected_${id}`,
        type: "return",
        seq: seqBase + 4,
        title: `Return ${r.number} rejected`,
        subtitle: r.rejectionReason || null,
        at,
        sortAt: at,
        tone: "critical",
      });
    }
  }
  return steps;
}
