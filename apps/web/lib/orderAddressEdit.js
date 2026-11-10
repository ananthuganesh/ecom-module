/**
 * Changing a placed order's delivery address. Mirrors the API rules in
 * apps/api/app/services/order_address.py, which has the final say.
 */
import { validateAddressForm } from "./customerAddressForm.js";

const CLOSED_STATUSES = new Set(["cancelled", "canceled", "abandoned", "delivered", "return requested", "returned"]);
const MOVING_SHIPPING = new Set(["in transit", "out for delivery", "delivered", "returned"]);

function lower(value) {
  return String(value || "").trim().toLowerCase();
}

export function shipmentBooked(order) {
  const details = order?.transactionDetails || {};
  return Boolean(
    String(order?.awb || order?.awbCode || "").trim() ||
      String(details?.dtdc?.reference_number || "").trim() ||
      String(details?.delhivery?.waybill || "").trim()
  );
}

function isPaid(order) {
  return lower(order?.paymentStatus || order?.transactionDetails?.paymentStatus) === "paid";
}

/**
 * actor: "admin" | "customer".
 * Returns { editable, code, reason, needsShipmentCancel } (code: closed | moving | booked | unpaid):
 * needsShipmentCancel = staff can edit after cancelling the booked (not yet moving) shipment.
 */
export function orderAddressEditState(order, actor = "customer") {
  const blocked = (code, reason, extra = {}) => ({
    editable: false,
    code,
    reason,
    needsShipmentCancel: false,
    ...extra,
  });
  if (!order) return blocked("missing", "");
  const status = lower(order.status || order.orderStatus);
  if (CLOSED_STATUSES.has(status) || order.isDelivered) {
    return blocked("closed", `This order is ${status || "closed"}; its address can't be changed.`);
  }
  if (MOVING_SHIPPING.has(lower(order.shippingStatus))) {
    return blocked("moving", "The parcel is already with the courier; its address can't be changed.");
  }
  if (shipmentBooked(order)) {
    if (actor === "customer") {
      return blocked("booked", "Your order has already been handed to the courier. Contact us to change the address.");
    }
    return blocked("booked", "A shipment is booked. Cancel it first, then change the address.", {
      needsShipmentCancel: true,
    });
  }
  if (actor === "customer" && !isPaid(order)) {
    return blocked("unpaid", "Only paid orders can have their address changed.");
  }
  return { editable: true, code: "", reason: "", needsShipmentCancel: false };
}

/** Loose state-name match ("Tamil Nadu" / "tamilnadu" / "J&K" vs "j and k"). */
export function normalizeStateName(value) {
  return lower(value).replace(/&/g, "and").replace(/[^a-z]/g, "");
}

export function sameState(a, b) {
  const x = normalizeStateName(a);
  const y = normalizeStateName(b);
  return !x || !y || x === y;
}

/** Order address form: saved-address rules plus a name and a 10-digit phone for the courier. */
export function validateOrderAddressForm(form) {
  const base = validateAddressForm(form);
  if (base) return base;
  if (!String(form?.name || "").trim()) return "Enter the recipient's name.";
  if (!/^\d{10}$/.test(String(form?.phone || "").trim())) {
    return "A 10-digit mobile number is needed for the courier.";
  }
  return "";
}

/** Most recent change from the order's audit log, or null. */
export function lastAddressChange(order) {
  const list = order?.transactionDetails?.addressChanges;
  return Array.isArray(list) && list.length ? list[list.length - 1] : null;
}

/** Order address → form; both street lines go into the one street field so line 2 isn't lost. */
export function orderAddressToForm(addr = {}) {
  const name =
    String(addr.name || "").trim() ||
    [addr.firstName, addr.lastName].filter(Boolean).join(" ").trim();
  const house = [addr.address || addr.house || addr.street, addr.address2]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(", ");
  const phone = String(addr.phone || addr.contact || "").replace(/\D/g, "");
  return {
    label: "",
    name,
    phone: phone.length > 10 ? phone.slice(-10) : phone,
    house,
    city: String(addr.city || "").trim(),
    state: String(addr.state || "").trim(),
    pincode: String(addr.postalCode || addr.pincode || addr.zipcode || addr.zip || "").trim(),
    country: String(addr.country || "India").trim() || "India",
    isDefault: false,
  };
}
