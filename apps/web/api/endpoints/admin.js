/**
 * API endpoints used by admin flows. Matches backend routes and schema.
 */
const users = {
  base: "/admin/users",
  byId: (id) => `/admin/users/${id}`,
  orders: (id) => `/admin/users/${id}/orders`,
};

const products = {
  base: "/admin/products",
  byId: (id) => `/admin/products/${id}`,
  bulkUpdate: "/admin/products/bulk-update",
};

const orders = {
  base: "/admin/orders",
  counts: "/admin/orders/counts",
  /** Paid-order analytics (dashboard / analytics pages). Not the nav badge endpoint. */
  stats: "/orders/stats",
  byId: (id) => `/admin/orders/${id}`,
  status: (id) => `/admin/orders/${id}/status`,
  archive: (id) => `/admin/orders/${id}/archive`,
  bulkStatus: "/admin/orders/bulk-update",
  deliveryDate: (id) => `/admin/orders/${id}/delivery-date`,
  return: (id) => `/admin/orders/${id}/return`,
};

const categories = {
  base: "/admin/categories",
  byId: (id) => `/admin/categories/${id}`,
};

const productColors = {
  base: "/admin/product-colors",
};

const aisensy = {
  settings: "/admin/aisensy/settings",
  syncCustomers: "/admin/aisensy/sync-customers",
  syncCatalog: "/admin/aisensy/sync-catalog",
};

const ga4 = {
  report: "/admin/ga4/report",
};

const taxClasses = {
  base: "/admin/tax-classes",
  byId: (id) => `/admin/tax-classes/${id}`,
};

const companyProfile = {
  base: "/admin/company-profile",
};

const stock = {
  base: "/admin/stock",
  movements: "/admin/stock/movements",
  adjust: "/admin/stock/adjust",
  product: (id) => `/admin/stock/product/${id}`,
  backfill: "/admin/stock/backfill",
};

export const adminEndpoints = {
  users,
  products,
  orders,
  categories,
  productColors,
  aisensy,
  ga4,
  taxClasses,
  companyProfile,
  stock,
};
