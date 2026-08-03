/**
 * Ask Next.js to drop ISR/fetch cache for home / catalog grids.
 * Safe to call from admin client after product mutations (no-op on failure).
 */
export async function bustStorefrontCatalogCache() {
  if (typeof window === "undefined") return;
  try {
    await fetch("/storefront/revalidate", {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  } catch (err) {
    console.warn("storefront catalog revalidate failed", err);
  }
}
