import { starSlots } from "@/lib/reviews";

const STAR_PATH =
  "M10 1.5l2.6 5.3 5.9.9-4.25 4.1 1 5.8L10 14.9l-5.25 2.75 1-5.8L1.5 7.7l5.9-.9L10 1.5z";

/** One star for pickers. */
export function StarIcon({ filled, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden>
      <path d={STAR_PATH} fill={filled ? "currentColor" : "#e5e7eb"} />
    </svg>
  );
}

/** Read-only stars. Colour comes from `className` (text-*). */
export default function StarRating({ rating = 0, size = 14, className = "text-black", label }) {
  const slots = starSlots(rating);
  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role="img"
      aria-label={label || `${Number(rating || 0).toFixed(1)} out of 5 stars`}
    >
      {slots.map((slot, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 20 20" aria-hidden>
          {slot === "half" ? (
            <defs>
              <clipPath id={`half-star-${i}`}>
                <rect x="0" y="0" width="10" height="20" />
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
