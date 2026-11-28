/** Google shows roughly this many characters of a meta description. */
export const DESCRIPTION_MAX = 155;

function plain(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function clip(text, max) {
  if (text.length <= max) return text;
  // Prefer ending on a whole sentence when that keeps most of the text.
  const head = text.slice(0, max);
  const end = Math.max(head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
  if (end >= max * 0.4) return head.slice(0, end + 1);
  const cut = text.slice(0, max + 1);
  const at = cut.lastIndexOf(" ");
  return `${cut.slice(0, at > 0 ? at : max).replace(/[,;:.\s-]+$/, "")}…`;
}

function inr(n) {
  const v = Number(n) || 0;
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: v % 1 ? 2 : 0 })}`;
}

/**
 * Product meta description: the admin text (or product copy) followed by the
 * price and a call to action, kept within DESCRIPTION_MAX.
 */
export function productMetaDescription(product) {
  const base =
    plain(product?.metaDescription) || plain(product?.description) || "Shop premium streetwear at Urban Aana.";
  const price = Number(product?.pricing?.sellingPrice ?? product?.price ?? 0);
  const mrp = Number(product?.pricing?.mrp ?? 0);
  if (!(price > 0)) return clip(base, DESCRIPTION_MAX);
  const suffix =
    mrp > price ? ` Now ${inr(price)} (MRP ${inr(mrp)}). Shop now.` : ` Now ${inr(price)}. Shop now.`;
  // Don't repeat the price if the admin already wrote one.
  if (/₹\s?\d/.test(base)) return clip(base, DESCRIPTION_MAX);
  const body = clip(base, DESCRIPTION_MAX - suffix.length - 1); // room for a closing "."
  return (/[.!?…]$/.test(body) ? body : `${body}.`) + suffix;
}
