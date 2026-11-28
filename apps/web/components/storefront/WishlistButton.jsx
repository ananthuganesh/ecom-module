"use client";

import { useEffect, useState } from "react";
import { Heart } from "@/components/icons";
import { useWishlistStore } from "@/store/useWishlistStore";

/**
 * Toggle product on the local wishlist (persisted). Fires Meta add_to_wishlist on add.
 * Renders a neutral (not wishlisted) state until persist hydrates to avoid SSR mismatch.
 */
export default function WishlistButton({
  product,
  className = "",
  iconSize = 18,
  showLabel = false,
}) {
  const [hydrated, setHydrated] = useState(false);
  // Bumped on each click so the CSS animation restarts; `kind` picks add vs remove.
  const [pulse, setPulse] = useState({ n: 0, kind: "" });
  const wishlistedFromStore = useWishlistStore((s) =>
    product ? s.has(product) : false
  );
  const toggle = useWishlistStore((s) => s.toggle);

  useEffect(() => {
    const store = useWishlistStore;
    if (store.persist?.hasHydrated?.()) {
      setHydrated(true);
      return;
    }
    const unsub = store.persist?.onFinishHydration?.(() => setHydrated(true));
    // Fallback if persist API is unavailable.
    if (!unsub) setHydrated(true);
    return unsub;
  }, []);

  if (!product) return null;

  const wishlisted = hydrated ? wishlistedFromStore : false;

  const onClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    // No toast: the filled heart and the navbar count already show the result.
    setPulse((p) => ({ n: p.n + 1, kind: wishlisted ? "remove" : "add" }));
    toggle(product);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={wishlisted}
      aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
      className={className}
    >
      <span
        key={pulse.n}
        className={`wishlist-heart relative inline-flex ${
          pulse.kind === "add" ? "wishlist-heart--add" : pulse.kind === "remove" ? "wishlist-heart--remove" : ""
        }`}
      >
        <Heart
          size={iconSize}
          className={`transition-colors duration-200 ${
            wishlisted
              ? "fill-[#DF1721] text-[#DF1721]"
              : "fill-transparent text-current"
          }`}
          strokeWidth={wishlisted ? 1.75 : 2}
        />
        {pulse.kind === "add" ? (
          <span aria-hidden className="wishlist-burst">
            <span className="wishlist-burst__ring" />
            {[0, 60, 120, 180, 240, 300].map((deg) => (
              <span key={deg} className="wishlist-burst__dot" style={{ "--a": `${deg}deg` }} />
            ))}
          </span>
        ) : null}
      </span>
      {showLabel ? (
        <span>{wishlisted ? "Wishlisted" : "Wishlist"}</span>
      ) : null}
    </button>
  );
}
