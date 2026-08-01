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
        : orderOrCustomer?.name || orderOrCustomer?.email
          ? orderOrCustomer
          : null;

  const ship = orderOrCustomer?.shippingAddress || {};
  const fromShip =
    cleanName(ship.name) ||
    cleanName(ship.fullName) ||
    cleanName(`${ship.firstName || ""} ${ship.lastName || ""}`);

  const fromCustomer = cleanName(customer?.name);
  const fromEmail = nameFromEmail(customer?.email || ship.email || orderOrCustomer?.email);
  const phone = customer?.phone || ship.phone || ship.mobile || "";

  return fromCustomer || fromShip || fromEmail || (phone ? String(phone) : "") || fallback;
}

export default displayCustomerName;
