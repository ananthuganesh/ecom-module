/**
 * Store policies that structured data describes to search engines.
 * Keep these in step with the live rules, or Google shows shoppers wrong info:
 * - RETURN_WINDOW_DAYS matches RETURN_WINDOW_DAYS in apps/api/app/services/returns.py
 * - SHIPPING_RATE_INR matches the first India zone in Settings → Shipping (currently free)
 * - handling/transit match the "Packed within 24 hours" and 3–6 day delivery copy
 */
export const RETURN_WINDOW_DAYS = 3;

export const SHIPPING_COUNTRY = "IN";
export const SHIPPING_RATE_INR = 0;
export const HANDLING_DAYS = { min: 0, max: 1 };
export const TRANSIT_DAYS = { min: 3, max: 6 };

export const STORE_SOCIAL_PROFILES = [
  "https://www.instagram.com/urbanaana.in",
  "https://www.facebook.com/share/18vF3ZB3BJ/",
];
