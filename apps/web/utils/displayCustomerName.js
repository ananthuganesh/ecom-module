/**
 * Prefer a real customer display name over placeholder "Guest User".
 */
const BAD = new Set([
  "",
  "guest",
  "guest user",
  "guestuser",
  "customer",
  "admin user",
  "imported guest",
  "—",
  "-",
  "n/a",
]);

function cleanName(value) {
  const name = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!name || BAD.has(name.toLowerCase())) return "";
  if (/^[\d\s+\-()]+$/.test(name)) return "";
  return name;
}

/** Handles / emails / `akhilst1996` — not a first + last name. */
function isUsernameLike(value) {
  const name = String(value || "").trim();
  if (!name) return false;
  if (name.includes("@")) return true;
  return !/\s/.test(name) && /\d/.test(name);
}

function personName(value) {
  const name = cleanName(value);
  if (!name || isUsernameLike(name)) return "";
  return name;
}

function fromFirstLast(obj) {
  if (!obj || typeof obj !== "object") return "";
  const first = personName(obj.firstName);
  const last = personName(obj.lastName);
  return cleanName(`${first} ${last}`);
}

function nameFromEmail(email) {
  if (!email || !String(email).includes("@")) return "";
  const local = String(email).split("@")[0] || "";
  if (!local || local.toLowerCase().includes("guest") || local.length < 3) return "";
  if (/^\d+$/.test(local)) return "";
  const human = local
    .replace(/[._-]+/g, " ")
    .replace(/\d+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (human.length < 2) return "";
  return human.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function displayCustomerName(orderOrCustomer, fallback = "Customer") {
  const customer =
    orderOrCustomer?.customerId && typeof orderOrCustomer.customerId === "object"
      ? orderOrCustomer.customerId
      : orderOrCustomer?.user && typeof orderOrCustomer.user === "object"
        ? orderOrCustomer.user
        : orderOrCustomer?.name ||
            orderOrCustomer?.email ||
            orderOrCustomer?.firstName ||
            orderOrCustomer?.lastName
          ? orderOrCustomer
          : null;

  const ship = orderOrCustomer?.shippingAddress || {};
  const phone = customer?.phone || ship.phone || ship.mobile || "";

  return (
    fromFirstLast(customer) ||
    fromFirstLast(ship) ||
    personName(ship.fullName) ||
    personName(ship.name) ||
    personName(customer?.name) ||
    nameFromEmail(customer?.email || ship.email || orderOrCustomer?.email) ||
    (phone ? String(phone) : "") ||
    fallback
  );
}

export default displayCustomerName;
