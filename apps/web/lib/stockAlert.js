const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function isValidAlertEmail(value) {
  const email = String(value || "").trim();
  return email.length <= 254 && EMAIL.test(email);
}

/** Sizes a shopper can ask to be told about — the sold-out ones. */
export function soldOutSizes(sizes = []) {
  return sizes
    .filter((size) => Number(size?.stock ?? size?.quantity ?? 0) <= 0)
    .map((size) => size.size)
    .filter(Boolean);
}

/** Turn the API reply into the line shown under the form. */
export function stockAlertMessage(result, size) {
  const label = size ? `size ${size}` : "this product";
  if (result?.inStock) {
    return { tone: "info", text: `Good news — ${label} is in stock now.` };
  }
  if (result?.alreadyWaiting) {
    return { tone: "success", text: `You're already on the list for ${label}.` };
  }
  if (result?.subscribed) {
    return { tone: "success", text: `Done. We'll email you once when ${label} is back.` };
  }
  return { tone: "error", text: "Couldn't save that. Please try again." };
}
