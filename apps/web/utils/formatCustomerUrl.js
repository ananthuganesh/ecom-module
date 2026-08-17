/** Admin URL path key: 12-digit customerUrlId (falls back to Mongo id). */
export function customerUrlKey(customer) {
  const urlId =
    customer?.customerUrlId != null ? String(customer.customerUrlId).trim() : "";
  if (urlId) return urlId;
  return customer?._id != null ? String(customer._id) : "";
}

export function adminCustomerHref(customer) {
  const key = customerUrlKey(customer);
  return key ? `/admin/customers/${encodeURIComponent(key)}` : "/admin/customers";
}
