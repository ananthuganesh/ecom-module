/**
 * When the admin "Mark as delivered" action is offered. Mirrors the API guard in
 * apps/api/app/services/order_deliver.py (which still has the final say).
 */

const BLOCKED_STATUSES = new Set(["cancelled", "canceled", "abandoned", "return requested", "returned"]);
const BLOCKED_SHIPPING = new Set(["cancelled", "returned"]);

export function isOrderPaid(order) {
  const status = String(
    order?.paymentStatus || order?.transactionDetails?.paymentStatus || ""
  ).toLowerCase();
  return status === "paid";
}

export function isOrderDelivered(order) {
  return (
    Boolean(order?.isDelivered) ||
    String(order?.status || "").toLowerCase() === "delivered" ||
    String(order?.shippingStatus || "").toLowerCase() === "delivered"
  );
}

export function canMarkDelivered(order) {
  if (!order || isOrderDelivered(order)) return false;
  if (BLOCKED_STATUSES.has(String(order.status || "").toLowerCase())) return false;
  if (BLOCKED_SHIPPING.has(String(order.shippingStatus || "").toLowerCase())) return false;
  return isOrderPaid(order);
}

export function markDeliveredConfirmText(order) {
  const hasAwb = Boolean(order?.awbCode || order?.awb);
  const courier = order?.courierName || order?.courier || "the courier";
  return [
    "Mark this order as delivered?",
    hasAwb ? `Tracking with ${courier} will stop updating this order.` : null,
    "The customer will get the delivery email / WhatsApp.",
  ]
    .filter(Boolean)
    .join(" ");
}
