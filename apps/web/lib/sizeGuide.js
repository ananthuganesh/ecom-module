/** Oversized tee garment measurements (inches). */
export const SIZE_GUIDE_ROWS = [
  { size: "XS", chest: 36, length: 26, shoulder: 16, sleeve: 7.5 },
  { size: "S", chest: 38, length: 26.5, shoulder: 17, sleeve: 7.75 },
  { size: "M", chest: 40, length: 27.5, shoulder: 18, sleeve: 8 },
  { size: "L", chest: 42, length: 28.25, shoulder: 19, sleeve: 8.25 },
  { size: "XL", chest: 44, length: 29, shoulder: 20, sleeve: 8.5 },
  { size: "XXL", chest: 46, length: 29.5, shoulder: 21, sleeve: 8.5 },
  { size: "3XL", chest: 48, length: 30, shoulder: 22, sleeve: 8.75 },
  { size: "4XL", chest: 50, length: 32, shoulder: 23, sleeve: 8.75 },
];

export const SIZE_GUIDE_COLUMNS = [
  { key: "chest", label: "Garment Chest" },
  { key: "length", label: "Length" },
  { key: "shoulder", label: "Shoulder" },
  { key: "sleeve", label: "Sleeve" },
];

function inchesToCm(value) {
  return Math.round(Number(value) * 2.54 * 10) / 10;
}

export function formatSizeGuideValue(value, unit = "in") {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  if (unit === "cm") return String(inchesToCm(n));
  return Number.isInteger(n) ? String(n) : String(n);
}
