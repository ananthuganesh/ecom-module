/**
 * What the admin order page shows about courier pickup and the latest scan.
 * Delhivery only collects after a pickup request; DTDC schedules on booking.
 */

const PICKED_UP = new Set(["In Transit", "Out for Delivery", "Delivered", "Cancelled", "Returned"]);

function carrierNode(order) {
  const td = order?.transactionDetails || {};
  if (order?.carrier === "delhivery" || td.delhivery) return td.delhivery || {};
  return td.dtdc || {};
}

export function isDelhiveryOrder(order) {
  return order?.carrier === "delhivery" || Boolean(order?.transactionDetails?.delhivery?.waybill);
}

function formatPickupDay(isoDate) {
  const [y, m, d] = String(isoDate || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** Courier's own wording, e.g. "Not Picked — Shipment not received from client (Kazhakkoottam)". */
export function courierUpdateText(order) {
  const scan = carrierNode(order).lastScan;
  if (!scan?.status) return "";
  const location = String(scan.location || "").replace(/_/g, " ").trim();
  const remark = String(scan.remark || "").trim();
  return [scan.status, remark].filter(Boolean).join(" — ") + (location ? ` (${location})` : "");
}

/**
 * Delhivery pickup state for an order with a waybill, or null when not applicable.
 * @returns {{ text: string, problem: boolean, canRequest: boolean } | null}
 */
export function pickupSummary(order) {
  if (!isDelhiveryOrder(order) || !(order?.awb || order?.awbCode)) return null;
  if (PICKED_UP.has(order.shippingStatus)) return null;
  const pickup = order.transactionDetails?.delhivery?.pickup;
  if (!pickup) {
    return { text: "No pickup requested — Delhivery won't send a rider", problem: true, canRequest: true };
  }
  if (pickup.error) {
    return { text: `Pickup request failed: ${pickup.error}`, problem: true, canRequest: true };
  }
  const day = formatPickupDay(pickup.date);
  const at = String(pickup.time || "").slice(0, 5);
  const when = [day, at].filter(Boolean).join(", ");
  return {
    text: `Pickup requested${when ? ` for ${when}` : ""}${pickup.id ? ` (#${pickup.id})` : ""}`,
    problem: false,
    canRequest: true,
  };
}
