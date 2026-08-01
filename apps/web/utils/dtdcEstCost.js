/**
 * DTDC ECOM RATE 7D (Surface) — estimated shipping cost.
 *
 * Defaults (Urban Aana):
 * - Product unit weight: 0.5 kg
 * - Box: 20×20×20 cm, max 3 units per box
 * - Chargeable weight = units × 0.5 kg (500 g slabs)
 */

export const DTDC_UNIT_WEIGHT_KG = 0.5;
export const DTDC_BOX_MAX_UNITS = 3;

/** @typedef {"kerala"|"south"|"metro"|"roi"|"jk"} DtdcZone */

const SURFACE_7D = {
  kerala: { base500: 58, add500: 27 },
  south: { base500: 66, add500: 33 },
  metro: { base500: 78, add500: 44 },
  roi: { base500: 86, add500: 51 },
  jk: { base500: 100, add500: 66 },
};

const SOUTH_STATES = new Set([
  "tamil nadu",
  "tn",
  "karnataka",
  "ka",
  "andhra pradesh",
  "ap",
  "telangana",
  "tl",
  "tg",
  "goa",
]);

const METRO_STATES = new Set([
  "delhi",
  "nct of delhi",
  "maharashtra", // Mumbai / Pune billed as metro per rate card
  "west bengal", // Kolkata
  "gujarat", // Ahmedabad
]);

const METRO_CITIES = new Set([
  "mumbai",
  "delhi",
  "new delhi",
  "kolkata",
  "calcutta",
  "ahmedabad",
  "amdavad",
  "pune",
  "bombay",
]);

function norm(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/**
 * @param {{ state?: string, stateName?: string, city?: string }} [addr]
 * @returns {DtdcZone | null}
 */
export function dtdcZoneFromAddress(addr = {}) {
  const state = norm(addr.state || addr.stateName);
  const city = norm(addr.city);
  if (!state && !city) return null;

  if (state === "kerala" || state === "kl") return "kerala";
  if (
    state === "jammu and kashmir" ||
    state === "jammu & kashmir" ||
    state === "j&k" ||
    state === "jk"
  ) {
    return "jk";
  }
  if (SOUTH_STATES.has(state)) return "south";
  if (METRO_CITIES.has(city) || METRO_STATES.has(state)) return "metro";
  return "roi";
}

/**
 * Total sellable units on an order.
 * @param {object} order
 */
export function orderUnitCount(order) {
  const items = order?.items || order?.orderItems || [];
  let n = 0;
  for (const item of items) {
    const q = Number(item.quantity ?? item.qty ?? 0);
    if (Number.isFinite(q) && q > 0) n += q;
  }
  return n;
}

/**
 * Chargeable weight in kg (product units × 0.5).
 * @param {number} units
 */
export function chargeableWeightKg(units) {
  const u = Math.max(0, Math.floor(Number(units) || 0));
  return u * DTDC_UNIT_WEIGHT_KG;
}

/**
 * Boxes needed (max 3 units per box) — for display / packing reference.
 * @param {number} units
 */
export function boxesNeeded(units) {
  const u = Math.max(0, Math.floor(Number(units) || 0));
  if (u <= 0) return 0;
  return Math.ceil(u / DTDC_BOX_MAX_UNITS);
}

/**
 * Surface 7D rupee estimate for a chargeable weight and zone.
 * @param {number} weightKg
 * @param {DtdcZone} zone
 * @returns {number | null}
 */
export function surface7dCost(weightKg, zone) {
  const rates = SURFACE_7D[zone];
  if (!rates) return null;
  const kg = Number(weightKg) || 0;
  if (kg <= 0) return null;

  // Bill in 500 g slabs: first slab = base, each extra 500 g = add
  const slabs = Math.max(1, Math.ceil(kg / DTDC_UNIT_WEIGHT_KG));
  return rates.base500 + (slabs - 1) * rates.add500;
}

/**
 * EST cost for an order (Surface 7D).
 * @param {object} order
 * @returns {{ amount: number | null, zone: DtdcZone | null, units: number, weightKg: number, boxes: number }}
 */
export function estimateDtdcSurfaceCost(order) {
  const units = orderUnitCount(order);
  const weightKg = chargeableWeightKg(units);
  const boxes = boxesNeeded(units);
  const zone = dtdcZoneFromAddress(order?.shippingAddress || {});
  const amount = zone && units > 0 ? surface7dCost(weightKg, zone) : null;
  return { amount, zone, units, weightKg, boxes };
}
