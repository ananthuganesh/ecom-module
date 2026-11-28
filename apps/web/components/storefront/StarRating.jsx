import { starSlots } from "@/lib/reviews";

import { StarIcon as HugeStar } from "@hugeicons/core-free-icons";

// Hugeicons star outline, filled for ratings.
const STAR_PATH = HugeStar[0][1].d;

/** One star for pickers. */
export function StarIcon({ filled, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path d={STAR_PATH} fill={filled ? "currentColor" : "#e5e7eb"} />
    </svg>
  );
}

/** Read-only stars. Colour comes from `className` (text-*). */
export default function StarRating({ rating = 0, size = 14, className = "text-[#F5B301]", label }) {
  const slots = starSlots(rating);
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="img"
      aria-label={label || `${Number(rating || 0).toFixed(1)} out of 5 stars`}
    >
      {slots.map((slot, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          {slot === "half" ? (
            <defs>
              <clipPath id={`half-star-${i}`}>
                <rect x="0" y="0" width="12" height="24" />
              </clipPath>
            </defs>
          ) : null}
          <path d={STAR_PATH} fill="#e5e7eb" />
          {slot !== "empty" ? (
            <path
              d={STAR_PATH}
              fill="currentColor"
              clipPath={slot === "half" ? `url(#half-star-${i})` : undefined}
            />
          ) : null}
        </svg>
      ))}
    </span>
  );
}
