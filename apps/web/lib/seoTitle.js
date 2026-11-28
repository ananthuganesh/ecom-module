/** Google shows about 60 characters of a title before cutting it off. */
export const TITLE_MAX = 60;

/**
 * Keep an admin-written "Name | Detail | Brand" title within TITLE_MAX by
 * dropping the middle parts first, then the brand. Never cuts mid-word.
 */
export function fitTitle(title, max = TITLE_MAX) {
  const text = String(title || "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const parts = text.split(" | ").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const nameAndBrand = `${parts[0]} | ${parts[parts.length - 1]}`;
    if (nameAndBrand.length <= max) return nameAndBrand;
  }
  const first = parts[0] || text;
  if (first.length <= max) return first;
  const cut = first.slice(0, max + 1);
  return cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max).trim();
}
