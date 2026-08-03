/** Urban Aana oversized tee size chart (inches). */
export const SIZE_GUIDE_ROWS = [
  { size: "S", fitChest: 38, chest: 42, length: 26, shoulder: 21 },
  { size: "M", fitChest: 40, chest: 44, length: 27, shoulder: 22 },
  { size: "L", fitChest: 42, chest: 46, length: 28, shoulder: 23 },
  { size: "XL", fitChest: 44, chest: 48, length: 28.5, shoulder: 24 },
  { size: "XXL", fitChest: 46, chest: 50, length: 29, shoulder: 25 },
  { size: "XXXL", fitChest: 48, chest: 52, length: 29.5, shoulder: 26 },
];

export const SIZE_GUIDE_COLUMNS = [
  { key: "fitChest", label: "To Fit Your Chest Size" },
  { key: "chest", label: "Garment Chest Size" },
  { key: "length", label: "Length" },
  { key: "shoulder", label: "Shoulder" },
];

export const SIZE_GUIDE_NOTE =
  "All measurements are in inches. Slight variation of 0.5–1 inch may occur due to manual measurement.";

function inchesToCm(value) {
  return Math.round(Number(value) * 2.54 * 10) / 10;
}

export function formatSizeGuideValue(value, unit = "in") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (unit === "cm") return String(inchesToCm(n));
  return Number.isInteger(n) ? String(n) : String(n);
}
