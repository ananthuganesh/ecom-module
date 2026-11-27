/** Canonical storefront contact details */
export const STORE_EMAIL = "info@urbanaana.com";
export const STORE_PHONE = "+91 62384 82408";
export const STORE_PHONE_TEL = "+916238482408";
export const STORE_LEGAL_NAME = "Urban Aana";
export const STORE_WEBSITE = "https://urbanaana.com";
export const STORE_JURISDICTION = "India";

/** Consumer Protection (E-Commerce) Rules, 2020 — named grievance officer */
export const STORE_GRIEVANCE_OFFICER_NAME = "Amal V";
export const STORE_GRIEVANCE_OFFICER_DESIGNATION = "Grievance Officer, Urban Aana";

/** WhatsApp support chat (digits only, with country code) */
export const STORE_WHATSAPP = "916238482408";
export const STORE_WHATSAPP_SUPPORT_MESSAGE =
  "Hi Urban Aana! I need some help with my order.";

export function whatsappChatUrl(message = STORE_WHATSAPP_SUPPORT_MESSAGE) {
  const text = String(message || "").trim();
  return `https://wa.me/${STORE_WHATSAPP}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}
