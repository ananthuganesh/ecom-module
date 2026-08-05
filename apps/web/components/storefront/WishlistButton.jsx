"use client";

import { useEffect, useState } from "react";
import { Heart } from "lucide-react";
import { toast } from "sonner";
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
    const added = toggle(product);
    toast.success(added ? "Added to wishlist" : "Removed from wishlist");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={wishlisted}
      aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
      className={className}
    >
      <Heart
        size={iconSize}
        className={
          wishlisted
            ? "fill-[#DF1721] text-[#DF1721]"
            : "fill-transparent text-current"
        }
        strokeWidth={wishlisted ? 1.75 : 2}
      />
      {showLabel ? (
        <span>{wishlisted ? "Wishlisted" : "Wishlist"}</span>
      ) : null}
    </button>
  );
}
