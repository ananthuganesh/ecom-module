/**
 * Homepage hero art sizes. Desktop banners are landscape; phones get a
 * separate portrait image when every slide has one.
 */
export const HERO_DESKTOP_SIZE = { width: 1920, height: 800 };
export const HERO_MOBILE_SIZE = { width: 1080, height: 1620 };

/** Breakpoint matches Tailwind `md` (768px). */
export const HERO_DESKTOP_MEDIA = "(min-width: 768px)";
export const HERO_MOBILE_MEDIA = "(max-width: 767px)";

/**
 * Portrait layout on phones only when every slide has mobile art, so the box
 * never changes shape between slides and no desktop banner gets cropped to a
 * narrow sliver.
 */
export function heroUsesMobileArt(slides) {
  return Array.isArray(slides) && slides.length > 0 && slides.every((s) => Boolean(s?.mobileSrc));
}
