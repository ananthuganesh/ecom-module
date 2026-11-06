/**
 * Swatch colours for product colour names (filters, cards). Keys are normalised:
 * lower-case, "-"/"_" as spaces, single spaces. Shades are picked to read like the
 * garment colour, not the CSS keyword (CSS "orange" looks yellow, "purple" too pink).
 */
const COLOR_HEX = {
  // neutrals
  black: "#111111",
  white: "#ffffff",
  "off white": "#f3efe6",
  ivory: "#fbf8ef",
  cream: "#f3ead7",
  beige: "#e4d5bc",
  sand: "#d6c4a1",
  khaki: "#bfae84",
  tan: "#c19a6b",
  camel: "#b9875a",
  brown: "#7b4a2a",
  coffee: "#4b3621",
  chocolate: "#5a3825",
  grey: "#9ca3af",
  gray: "#9ca3af",
  "light grey": "#d1d5db",
  "light gray": "#d1d5db",
  "dark grey": "#4b5563",
  "dark gray": "#4b5563",
  charcoal: "#36393f",
  silver: "#c0c0c0",
  // reds / pinks
  red: "#df1721",
  maroon: "#6e1a1a",
  burgundy: "#7a1f2e",
  wine: "#6b2333",
  rust: "#b4501f",
  coral: "#f47c6b",
  peach: "#f8c3a0",
  pink: "#f4a7c3",
  "baby pink": "#f8c8d8",
  rose: "#e39aa6",
  // oranges / yellows
  orange: "#f2711c",
  mustard: "#d1a02b",
  yellow: "#f6d33c",
  gold: "#d4af37",
  "yellow gold": "#e6c98c",
  "rose gold": "#f3c5b5",
  // greens
  green: "#1f8a4c",
  olive: "#6b6f2a",
  "olive green": "#6b6f2a",
  "bottle green": "#0f4a2e",
  "forest green": "#1f4d2b",
  sage: "#9cae8c",
  mint: "#a8e6c9",
  teal: "#0f7c7a",
  // blues
  blue: "#2563eb",
  "royal blue": "#2f55d4",
  "sky blue": "#8cc8ee",
  "light blue": "#a9cbee",
  "powder blue": "#b9d3e6",
  denim: "#4f6d8f",
  indigo: "#3b3f8f",
  navy: "#1f2a52",
  "navy blue": "#1f2a52",
  // purples
  purple: "#6a2a8c",
  violet: "#7d4cc2",
  lavender: "#b9a7dd",
  lilac: "#c8a7d4",
  plum: "#6e3a5e",
};

function normaliseColorName(colorName) {
  return String(colorName || "")
    .trim()
    .toLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ");
}

/** Hex for a colour name; tries "Dark Burgundy" → "burgundy" before falling back to light grey. */
export function getColorHex(colorName) {
  const key = normaliseColorName(colorName);
  if (!key) return "#e5e7eb";
  if (COLOR_HEX[key]) return COLOR_HEX[key];
  const base = key.replace(/^(light|dark|deep|pale|bright|washed|acid wash|vintage)\s+/, "");
  if (COLOR_HEX[base]) return COLOR_HEX[base];
  const last = key.split(" ").pop();
  return COLOR_HEX[last] || "#e5e7eb";
}

/** Very light swatches (white, cream…) need a visible edge on a white page. */
export function isLightColor(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 225;
}

export function getProductColors(product) {
  const fromColors = Array.isArray(product?.colors)
    ? product.colors.map((c) => String(c || "").trim()).filter(Boolean)
    : [];
  if (fromColors.length) {
    return [...new Map(fromColors.map((c) => [c.toLowerCase(), c])).values()];
  }
  const legacy = String(product?.color || "").trim();
  if (legacy) return [legacy];

  const fromVariants = (product?.variants || [])
    .map((v) => String(v?.color || "").trim())
    .filter(Boolean);
  return [...new Map(fromVariants.map((c) => [c.toLowerCase(), c])).values()];
}
