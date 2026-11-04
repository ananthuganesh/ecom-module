/**
 * Shopify-style discount editor: form state ⇄ API payload, checks, and the
 * sidebar summary. Kept free of React so it can be unit-tested.
 */

export const KIND_TITLES = {
  products: "Amount off products",
  bxgy: "Buy X get Y",
  order: "Amount off order",
  shipping: "Free shipping",
};

export const KIND_CLASS = {
  products: "Product discount",
  bxgy: "Product discount",
  order: "Order discount",
  shipping: "Shipping discount",
};

/** Shopify's discount classes, as used by the combination checkboxes. */
export function discountClassOf(kind) {
  if (kind === "shipping") return "shipping";
  if (kind === "products" || kind === "bxgy") return "product";
  return "order";
}

/** Which "Combines with" boxes a discount type offers (shipping can't stack on shipping). */
export function combinationOptions(kind) {
  const all = [
    { key: "combinesWithProduct", cls: "product", label: "Product discounts" },
    { key: "combinesWithOrder", cls: "order", label: "Order discounts" },
    { key: "combinesWithShipping", cls: "shipping", label: "Shipping discounts" },
  ];
  return kind === "shipping" ? all.filter((o) => o.cls !== "shipping") : all;
}

const pad = (n) => String(n).padStart(2, "0");

/** Local date + time inputs for a stored UTC instant ("…Z" or naive UTC). */
export function toLocalParts(value) {
  if (!value) return { date: "", time: "" };
  const raw = String(value);
  const iso = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw) || raw.length <= 10 ? raw : `${raw}Z`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "", time: "" };
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

/** UTC ISO string for local date + time inputs, or null. */
export function fromLocalParts(date, time) {
  if (!date) return null;
  const d = new Date(`${date}T${time || "00:00"}:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function randomCode(length = 12, rand = Math.random) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[Math.floor(rand() * alphabet.length)];
  return out;
}

export function emptyForm(kind = "order", now = new Date()) {
  const start = toLocalParts(now.toISOString());
  return {
    kind,
    method: "code",
    name: "",
    code: "",
    status: "active",
    combinesWithProduct: false,
    combinesWithOrder: false,
    combinesWithShipping: false,
    limitShippingRate: false,
    maxShippingRate: "",
    discountType: "percentage",
    discountValue: "",
    maxDiscount: null,
    appliesTo: kind === "products" ? "collections" : "products",
    productIds: [],
    collectionIds: [],
    oncePerOrder: false,
    minRequirement: "none",
    minOrderAmount: "",
    minQuantity: "",
    eligibility: "all",
    customerIds: [],
    limitTotal: false,
    usageLimit: "",
    oncePerCustomer: false,
    startDate: start.date,
    startTime: start.time,
    hasEnd: false,
    endDate: "",
    endTime: "",
    showOnProduct: false,
    badge: "",
    tags: [],
    // Buy X get Y
    buyRequirement: "quantity",
    buyQuantity: "",
    buyAmount: "",
    buyAppliesTo: "products",
    buyProductIds: [],
    buyCollectionIds: [],
    getQuantity: "",
    getAppliesTo: "products",
    getProductIds: [],
    getCollectionIds: [],
    getValueType: "percentage",
    getDiscountPercent: "",
    getAmountOff: "",
    limitUsesPerOrder: false,
    maxUsesPerOrder: "",
  };
}

const str = (v) => (v === null || v === undefined ? "" : String(v));

/** Editor state for a saved coupon (including ones saved by the old form). */
export function formFromCoupon(c) {
  const kind = c.kind || "order";
  // Coupons saved before scheduling existed were live from creation; "now" keeps that.
  const start = toLocalParts(c.startsAt || c.createdAt || new Date().toISOString());
  const end = toLocalParts(c.expiryDate);
  const legacyMin = Number(c.minOrderAmount || 0) > 0 ? "amount" : "none";
  // The old form saved "free" as 100% (and the API defaults the type to percentage).
  const savedType = c.getValueType || "percentage";
  const getValueType =
    savedType === "percentage" && Number(c.getDiscountPercent ?? 100) >= 100 ? "free" : savedType;
  return {
    ...emptyForm(kind),
    kind,
    method: c.method || "code",
    name: c.name || "",
    code: c.code || "",
    status: c.status || "active",
    combinesWithProduct: !!c.combinesWithProduct,
    combinesWithOrder: !!c.combinesWithOrder,
    combinesWithShipping: !!c.combinesWithShipping,
    limitShippingRate: c.maxShippingRate != null,
    maxShippingRate: c.maxShippingRate != null ? str(c.maxShippingRate) : "",
    discountType: c.discountType || "percentage",
    discountValue: str(c.discountValue),
    maxDiscount: c.maxDiscount ?? null,
    appliesTo: c.appliesTo || "products",
    productIds: c.productIds || [],
    collectionIds: c.collectionIds || [],
    oncePerOrder: c.oncePerOrder ?? true,
    minRequirement: c.minRequirement || legacyMin,
    minOrderAmount: Number(c.minOrderAmount || 0) > 0 ? str(c.minOrderAmount) : "",
    minQuantity: Number(c.minQuantity || 0) > 0 ? str(c.minQuantity) : "",
    eligibility: c.eligibility || "all",
    customerIds: c.customerIds || [],
    limitTotal: c.usageLimit != null && Number(c.usageLimit) > 0,
    usageLimit: c.usageLimit != null && Number(c.usageLimit) > 0 ? str(c.usageLimit) : "",
    oncePerCustomer: !!c.oncePerCustomer,
    startDate: start.date,
    startTime: start.time,
    hasEnd: !!c.expiryDate,
    endDate: end.date,
    endTime: end.time,
    showOnProduct: !!c.showOnProduct,
    badge: c.badge || "",
    tags: c.tags || [],
    buyRequirement: c.buyRequirement || "quantity",
    buyQuantity: str(c.buyQuantity ?? 1),
    buyAmount: Number(c.buyAmount || 0) > 0 ? str(c.buyAmount) : "",
    buyAppliesTo: c.buyAppliesTo || "products",
    buyProductIds: (c.buyProductIds && c.buyProductIds.length ? c.buyProductIds : c.productIds) || [],
    buyCollectionIds: c.buyCollectionIds || [],
    getQuantity: str(c.getQuantity ?? 1),
    getAppliesTo: c.getAppliesTo || "products",
    getProductIds:
      (c.getProductIds && c.getProductIds.length
        ? c.getProductIds
        : kind === "bxgy" && (c.buyAppliesTo || "products") === "products"
          ? c.buyProductIds && c.buyProductIds.length
            ? c.buyProductIds
            : c.productIds
          : []) || [],
    getCollectionIds: c.getCollectionIds || [],
    getValueType,
    getDiscountPercent: getValueType === "percentage" ? str(c.getDiscountPercent) : "",
    getAmountOff: Number(c.getAmountOff || 0) > 0 ? str(c.getAmountOff) : "",
    limitUsesPerOrder: c.maxUsesPerOrder != null && Number(c.maxUsesPerOrder) > 0,
    maxUsesPerOrder: c.maxUsesPerOrder != null && Number(c.maxUsesPerOrder) > 0 ? str(c.maxUsesPerOrder) : "",
  };
}

const num = (v) => Number(v);
const positive = (v) => Number.isFinite(num(v)) && num(v) > 0;
const wholePositive = (v) => Number.isInteger(num(v)) && num(v) > 0;

/** First problem with the form, in the order the fields appear, or "". */
export function validateForm(f) {
  if (f.method === "automatic") {
    if (!String(f.name || "").trim()) return "Enter a title for the discount.";
  } else {
    if (!String(f.code || "").trim()) return "Enter a discount code.";
    if (/\s/.test(String(f.code).trim())) return "Discount codes can't contain spaces.";
  }

  if (f.kind === "shipping") {
    if (f.limitShippingRate && !(Number.isFinite(num(f.maxShippingRate)) && num(f.maxShippingRate) >= 0 && String(f.maxShippingRate).trim() !== "")) {
      return "Enter the highest shipping rate this discount covers.";
    }
    if (f.minRequirement === "amount" && !positive(f.minOrderAmount)) return "Enter the minimum purchase amount.";
    if (f.minRequirement === "quantity" && !wholePositive(f.minQuantity)) return "Enter the minimum quantity of items.";
  } else if (f.kind === "bxgy") {
    if (f.buyRequirement === "amount" ? !positive(f.buyAmount) : !wholePositive(f.buyQuantity)) {
      return f.buyRequirement === "amount"
        ? "Enter the minimum purchase amount the customer must spend."
        : "Enter how many items the customer must buy.";
    }
    if (f.buyAppliesTo === "collections" ? !f.buyCollectionIds.length : !f.buyProductIds.length) {
      return `Select the ${f.buyAppliesTo === "collections" ? "collections" : "products"} the customer buys.`;
    }
    if (!wholePositive(f.getQuantity)) return "Enter how many items the customer gets.";
    if (f.getAppliesTo === "collections" ? !f.getCollectionIds.length : !f.getProductIds.length) {
      return `Select the ${f.getAppliesTo === "collections" ? "collections" : "products"} the customer gets.`;
    }
    if (f.getValueType === "percentage" && !(positive(f.getDiscountPercent) && num(f.getDiscountPercent) <= 100)) {
      return "Enter a percentage between 1 and 100.";
    }
    if (f.getValueType === "amount" && !positive(f.getAmountOff)) return "Enter the amount off each item.";
    if (f.limitUsesPerOrder && !wholePositive(f.maxUsesPerOrder)) return "Enter the maximum uses per order.";
  } else {
    if (!positive(f.discountValue)) return "Enter a discount value.";
    if (f.discountType === "percentage" && num(f.discountValue) > 100) return "Percentage must be 1–100.";
    if (f.kind === "products") {
      if (f.appliesTo === "collections" ? !f.collectionIds.length : !f.productIds.length) {
        return `Select at least one ${f.appliesTo === "collections" ? "collection" : "product"}.`;
      }
    }
    if (f.minRequirement === "amount" && !positive(f.minOrderAmount)) return "Enter the minimum purchase amount.";
    if (f.minRequirement === "quantity" && !wholePositive(f.minQuantity)) return "Enter the minimum quantity of items.";
  }

  if (f.eligibility === "customers" && !f.customerIds.length) return "Select at least one customer.";
  if (f.limitTotal && !wholePositive(f.usageLimit)) return "Enter the total number of uses.";
  if (!f.startDate) return "Choose a start date.";
  if (f.hasEnd) {
    if (!f.endDate) return "Choose an end date.";
    const start = fromLocalParts(f.startDate, f.startTime);
    const end = fromLocalParts(f.endDate, f.endTime || "23:59");
    if (start && end && end <= start) return "End date must be after the start date.";
  }
  return "";
}

/** API payload for the form. Leaves fields the editor doesn't show (name, cap) intact. */
export function payloadFromForm(f) {
  const bxgy = f.kind === "bxgy";
  const products = f.kind === "products";
  const shipping = f.kind === "shipping";
  const automatic = f.method === "automatic";
  // Automatic discounts keep their internal id (AUTO-…); the API makes one if blank.
  const code = automatic
    ? String(f.code || "").startsWith("AUTO-") ? f.code : ""
    : String(f.code || "").trim().toUpperCase();
  const allowed = new Set(combinationOptions(f.kind).map((o) => o.key));
  return {
    method: automatic ? "automatic" : "code",
    name: String(f.name || "").trim() || code,
    code,
    kind: f.kind,
    status: f.status || "active",
    combinesWithProduct: allowed.has("combinesWithProduct") && !!f.combinesWithProduct,
    combinesWithOrder: allowed.has("combinesWithOrder") && !!f.combinesWithOrder,
    combinesWithShipping: allowed.has("combinesWithShipping") && !!f.combinesWithShipping,
    maxShippingRate: shipping && f.limitShippingRate ? num(f.maxShippingRate) : null,
    discountType: bxgy || shipping ? "percentage" : f.discountType,
    discountValue: bxgy || shipping ? 0 : num(f.discountValue),
    maxDiscount: !bxgy && !shipping && f.discountType === "percentage" ? (f.maxDiscount ?? null) : null,
    appliesTo: products ? f.appliesTo : "products",
    productIds: products && f.appliesTo === "products" ? f.productIds : [],
    collectionIds: products && f.appliesTo === "collections" ? f.collectionIds : [],
    oncePerOrder: products && f.discountType === "fixed" ? !!f.oncePerOrder : true,
    minRequirement: bxgy ? "none" : f.minRequirement,
    minOrderAmount: !bxgy && f.minRequirement === "amount" ? num(f.minOrderAmount) : 0,
    minQuantity: !bxgy && f.minRequirement === "quantity" ? num(f.minQuantity) : 0,
    eligibility: f.eligibility,
    customerIds: f.eligibility === "customers" ? f.customerIds : [],
    // Automatic discounts have no usage limits (as in Shopify).
    usageLimit: !automatic && f.limitTotal ? num(f.usageLimit) : null,
    oncePerCustomer: !automatic && !!f.oncePerCustomer,
    startsAt: fromLocalParts(f.startDate, f.startTime),
    expiryDate: f.hasEnd ? fromLocalParts(f.endDate, f.endTime || "23:59") : null,
    showOnProduct: !!f.showOnProduct,
    badge: f.showOnProduct ? String(f.badge || "").trim() || null : null,
    tags: f.tags || [],
    buyRequirement: bxgy ? f.buyRequirement : "quantity",
    buyQuantity: bxgy && f.buyRequirement === "quantity" ? num(f.buyQuantity) : 1,
    buyAmount: bxgy && f.buyRequirement === "amount" ? num(f.buyAmount) : 0,
    buyAppliesTo: bxgy ? f.buyAppliesTo : "products",
    buyProductIds: bxgy && f.buyAppliesTo === "products" ? f.buyProductIds : [],
    buyCollectionIds: bxgy && f.buyAppliesTo === "collections" ? f.buyCollectionIds : [],
    getQuantity: bxgy ? num(f.getQuantity) : 1,
    getAppliesTo: bxgy ? f.getAppliesTo : "products",
    getProductIds: bxgy && f.getAppliesTo === "products" ? f.getProductIds : [],
    getCollectionIds: bxgy && f.getAppliesTo === "collections" ? f.getCollectionIds : [],
    getValueType: bxgy ? f.getValueType : "percentage",
    getDiscountPercent: bxgy
      ? f.getValueType === "free"
        ? 100
        : f.getValueType === "percentage"
          ? num(f.getDiscountPercent)
          : 0
      : 100,
    getAmountOff: bxgy && f.getValueType === "amount" ? num(f.getAmountOff) : 0,
    maxUsesPerOrder: bxgy && f.limitUsesPerOrder ? num(f.maxUsesPerOrder) : null,
  };
}

export function formatRupees(value) {
  const n = Number(value) || 0;
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: Number.isInteger(n) ? 0 : 2 })}`;
}

function plural(n, one, many = `${one}s`) {
  return `${n} ${Number(n) === 1 ? one : many}`;
}

function valueLine(f) {
  if (f.kind === "shipping") {
    return f.limitShippingRate && String(f.maxShippingRate).trim() !== ""
      ? `Free shipping on rates up to ${formatRupees(f.maxShippingRate)}`
      : "Free shipping on all rates";
  }
  if (f.kind === "bxgy") {
    if (!wholePositive(f.getQuantity)) return "";
    const off =
      f.getValueType === "free"
        ? "free"
        : f.getValueType === "amount"
          ? positive(f.getAmountOff) ? `at ${formatRupees(f.getAmountOff)} off each` : ""
          : positive(f.getDiscountPercent) ? `at ${num(f.getDiscountPercent)}% off` : "";
    if (!off) return "";
    const buy =
      f.buyRequirement === "amount"
        ? positive(f.buyAmount) ? `Spend ${formatRupees(f.buyAmount)}` : ""
        : wholePositive(f.buyQuantity) ? `Buy ${plural(num(f.buyQuantity), "item")}` : "";
    return buy ? `${buy}, get ${plural(num(f.getQuantity), "item")} ${off}` : "";
  }
  if (!positive(f.discountValue)) return "";
  const amount = f.discountType === "percentage" ? `${num(f.discountValue)}% off` : `${formatRupees(f.discountValue)} off`;
  if (f.kind === "order") return `${amount} entire order`;
  const ids = f.appliesTo === "collections" ? f.collectionIds : f.productIds;
  const each = f.discountType === "fixed" && !f.oncePerOrder ? " each item in" : "";
  if (!ids.length) return "";
  return `${amount}${each} ${plural(ids.length, f.appliesTo === "collections" ? "collection" : "product")}`;
}

function startLine(f, now) {
  const start = f.startDate ? new Date(`${f.startDate}T${f.startTime || "00:00"}:00`) : null;
  if (!start || Number.isNaN(start.getTime())) return "";
  const sameDay = start.toDateString() === now.toDateString();
  const label = sameDay
    ? "today"
    : start.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: start.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  if (!f.hasEnd || !f.endDate) return `Active from ${label}`;
  const end = new Date(`${f.endDate}T${f.endTime || "23:59"}:00`);
  const endLabel = end.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: end.getFullYear() === now.getFullYear() ? undefined : "numeric" });
  return `Active from ${label} until ${endLabel}`;
}

/** "Combines with product and shipping discounts" / "Can't combine with other discounts". */
export function combinationLine(f) {
  const names = combinationOptions(f.kind)
    .filter((o) => f[o.key])
    .map((o) => o.label.replace(" discounts", "").toLowerCase());
  if (!names.length) return "Can't combine with other discounts";
  const list = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return `Combines with ${list} discounts`;
}

/** Bullet points for the sidebar "Details" card, like Shopify's. */
export function detailLines(f, now = new Date()) {
  const lines = [];
  const value = valueLine(f);
  if (value) lines.push(value);
  lines.push(
    f.eligibility === "customers"
      ? f.customerIds.length ? `For ${plural(f.customerIds.length, "customer")}` : "For specific customers"
      : "All customers"
  );
  lines.push("For Online Store");
  if (f.method === "automatic") lines.push("Applies automatically at checkout");
  if (f.kind !== "bxgy") {
    if (f.minRequirement === "amount" && positive(f.minOrderAmount)) {
      lines.push(`Minimum purchase of ${formatRupees(f.minOrderAmount)}`);
    } else if (f.minRequirement === "quantity" && wholePositive(f.minQuantity)) {
      lines.push(`Minimum purchase of ${plural(num(f.minQuantity), "item")}`);
    } else {
      lines.push("No minimum purchase requirement");
    }
  }
  if (f.kind === "bxgy" && f.limitUsesPerOrder && wholePositive(f.maxUsesPerOrder)) {
    lines.push(`Up to ${plural(num(f.maxUsesPerOrder), "use")} per order`);
  }
  if (f.method !== "automatic") {
    const limits = [];
    if (f.limitTotal && wholePositive(f.usageLimit)) limits.push(`Limit of ${plural(num(f.usageLimit), "use")}`);
    if (f.oncePerCustomer) limits.push("one use per customer");
    lines.push(limits.length ? limits.join(", ").replace(/^./, (c) => c.toUpperCase()) : "No usage limits");
  }
  lines.push(combinationLine(f));
  const start = startLine(f, now);
  if (start) lines.push(start);
  return lines;
}

/** Status shown in the discounts list, from the saved coupon. */
export function couponStatus(c, now = new Date()) {
  if ((c.status || "active") !== "active") return { label: "Inactive", tone: "neutral" };
  const at = (v) => {
    if (!v) return null;
    const raw = String(v);
    const d = new Date(/([zZ]|[+-]\d{2}:?\d{2})$/.test(raw) || raw.length <= 10 ? raw : `${raw}Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  };
  const start = at(c.startsAt);
  const end = at(c.expiryDate);
  if (start && start > now) return { label: "Scheduled", tone: "info" };
  if (end && end < now) return { label: "Expired", tone: "neutral" };
  if (c.usageLimit != null && Number(c.usageLimit) > 0 && Number(c.usedCount || 0) >= Number(c.usageLimit)) {
    return { label: "Used up", tone: "neutral" };
  }
  return { label: "Active", tone: "success" };
}

/** One-line value for the discounts list, from the saved coupon. */
export function couponSummary(c) {
  return valueLine(formFromCoupon(c)) || KIND_TITLES[c.kind || "order"] || "Discount";
}
