/**
 * Admin customer address editor — form state ↔ API body, with the same checks the
 * API applies (apps/api/app/services/customer_addresses.py) so staff see the
 * problem before saving.
 */

export function emptyAddressForm(customer = {}) {
  return {
    label: "",
    name: String(customer?.name || "").trim(),
    phone: tenDigitPhone(customer?.phone),
    house: "",
    city: "",
    state: "",
    pincode: "",
    country: "India",
    isDefault: false,
  };
}

/** Saved address (any legacy shape) → form fields. */
export function addressToForm(addr = {}) {
  return {
    label: String(addr.label || ""),
    name: String(addr.name || addr.fullName || "").trim(),
    phone: tenDigitPhone(addr.phone || addr.contact || addr.mobile),
    house: String(addr.house || addr.address || addr.street || "").trim(),
    city: String(addr.city || "").trim(),
    state: String(addr.state || "").trim(),
    pincode: String(addr.pincode || addr.postalCode || addr.zipCode || "").trim(),
    country: String(addr.country || "India").trim() || "India",
    isDefault: Boolean(addr.isDefault),
  };
}

/** Last 10 digits of an Indian mobile (+91 / 0 prefixes dropped). */
export function tenDigitPhone(value) {
  let digits = String(value || "").replace(/\D/g, "");
  if (digits.startsWith("91") && digits.length >= 12) digits = digits.slice(-10);
  else if (digits.startsWith("0") && digits.length === 11) digits = digits.slice(1);
  return digits.slice(0, 10);
}

/** First problem with the form, or "" when it can be saved. */
export function validateAddressForm(form) {
  if (String(form?.house || "").trim().length < 5) return "Enter a complete street address.";
  if (!String(form?.city || "").trim() || !String(form?.state || "").trim()) {
    return "City and state are required.";
  }
  if (!/^\d{6}$/.test(String(form?.pincode || "").trim())) return "Enter a valid 6-digit PIN code.";
  const phone = String(form?.phone || "").trim();
  if (phone && !/^\d{10}$/.test(phone)) return "Phone must be a 10-digit mobile number.";
  return "";
}

export function formToAddressBody(form) {
  return {
    label: String(form.label || "").trim(),
    name: String(form.name || "").trim(),
    phone: String(form.phone || "").trim(),
    house: String(form.house || "").trim(),
    city: String(form.city || "").trim(),
    state: String(form.state || "").trim(),
    pincode: String(form.pincode || "").trim(),
    country: String(form.country || "India").trim() || "India",
    isDefault: Boolean(form.isDefault),
  };
}

/** Default address first, then the rest in saved order. */
export function sortAddresses(addresses) {
  const list = Array.isArray(addresses) ? addresses.filter(Boolean) : [];
  return [...list.filter((a) => a.isDefault), ...list.filter((a) => !a.isDefault)];
}
