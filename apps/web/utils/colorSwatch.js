/** Map common color names to swatch hex values for product cards. */
const COLOR_HEX = {
  black: "#111111",
  blue: "#2563eb",
  white: "#ffffff",
  red: "#df1721",
  pink: "#f9a8d4",
  "yellow gold": "#e6c98c",
  "rose gold": "#f3c5b5",
  silver: "#c0c0c0",
  gold: "#d4af37",
  green: "#16a34a",
  purple: "#7c3aed",
  orange: "#f97316",
  brown: "#92400e",
  gray: "#9ca3af",
  grey: "#9ca3af",
  navy: "#1e3a8a",
  teal: "#0d9488",
  maroon: "#7f1d1d",
  olive: "#6b7280",
  beige: "#e7e5e4",
  cream: "#f5f0e6",
  khaki: "#c3b091",
  charcoal: "#374151",
};

export function getColorHex(colorName) {
  if (!colorName) return "#e5e7eb";
  const key = String(colorName).trim().toLowerCase();
  return COLOR_HEX[key] || "#e5e7eb";
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
