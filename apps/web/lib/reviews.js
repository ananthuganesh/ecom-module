export const REVIEW_TITLE_MAX = 120;
export const REVIEW_BODY_MAX = 2000;

/** Rating summary a product carries, or null when it has no reviews. */
export function productRating(product) {
  const count = Number(product?.ratingCount);
  const average = Number(product?.ratingAverage);
  if (!Number.isFinite(count) || count < 1) return null;
  if (!Number.isFinite(average) || average < 1 || average > 5) return null;
  return { average: Math.round(average * 10) / 10, count: Math.floor(count) };
}

/** Five slots, each "full" | "half" | "empty", for drawing stars. */
export function starSlots(rating) {
  const value = Math.max(0, Math.min(5, Number(rating) || 0));
  return Array.from({ length: 5 }, (_, i) => {
    const remaining = value - i;
    if (remaining >= 0.75) return "full";
    if (remaining >= 0.25) return "half";
    return "empty";
  });
}

/** Share of reviews at each star, 5 down to 1, as whole percentages. */
export function ratingBreakdown(distribution = {}, count = 0) {
  return [5, 4, 3, 2, 1].map((star) => {
    const n = Number(distribution?.[star] ?? distribution?.[String(star)] ?? 0) || 0;
    return { star, count: n, percent: count > 0 ? Math.round((n / count) * 100) : 0 };
  });
}

export function reviewCountLabel(count) {
  const n = Number(count) || 0;
  return `${n.toLocaleString("en-IN")} review${n === 1 ? "" : "s"}`;
}

/** Client-side check matching the API's rules; returns an error string or null. */
export function reviewDraftError({ rating, title = "", body = "" } = {}) {
  const stars = Number(rating);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return "Choose a star rating.";
  if (String(title).trim().length > REVIEW_TITLE_MAX)
    return `Title can be at most ${REVIEW_TITLE_MAX} characters.`;
  if (String(body).trim().length > REVIEW_BODY_MAX)
    return `Review can be at most ${REVIEW_BODY_MAX} characters.`;
  return null;
}

export function formatReviewDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
