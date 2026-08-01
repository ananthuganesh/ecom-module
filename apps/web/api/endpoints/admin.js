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
  pricing: (id) => `/admin/products/${id}/pricing`,
  stock: (id) => `/admin/products/${id}/stock`,
  variant: (id) => `/admin/products/${id}/variant`,
  bulkUpdate: "/admin/products/bulk-update",
};

const orders = {
  base: "/admin/orders",
  stats: "/admin/orders/counts",
  counts: "/admin/orders/counts",
  byId: (id) => `/admin/orders/${id}`,
  status: (id) => `/admin/orders/${id}/status`,
  archive: (id) => `/admin/orders/${id}/archive`,
  bulkStatus: "/admin/orders/bulk-update",
  deliveryDate: (id) => `/admin/orders/${id}/delivery-date`,
  return: (id) => `/admin/orders/${id}/return`,
};

const wallet = {
  refund: "/admin/wallet/refund",
  byUserId: (userId) => `/admin/wallet/${userId}`,
  transactions: (userId) => `/admin/wallet/${userId}/transactions`,
};

const brands = {
  base: "/admin/brands",
  byId: (id) => `/admin/brands/${id}`,
};

const categories = {
  base: "/admin/categories",
  byId: (id) => `/admin/categories/${id}`,
};

const productColors = {
  base: "/admin/product-colors",
};

const razorpay = {
  settings: "/admin/razorpay/settings",
  disconnect: "/admin/razorpay/disconnect",
};

const aisensy = {
  settings: "/admin/aisensy/settings",
  disconnect: "/admin/aisensy/disconnect",
  syncCustomers: "/admin/aisensy/sync-customers",
  syncCatalog: "/admin/aisensy/sync-catalog",
  sendAbandonedRecovery: (id) => `/admin/abandoned-checkouts/${id}/send-recovery`,
};

const gtm = {
  settings: "/admin/gtm/settings",
};

const ga4 = {
  settings: "/admin/ga4/settings",
  report: "/admin/ga4/report",
};

const aiMedia = {
  generate: "/admin/ai-media/generate",
  jobs: "/admin/ai-media/jobs",
  job: (id) => `/admin/ai-media/jobs/${id}`,
  approve: (id) => `/admin/ai-media/jobs/${id}/approve`,
  attachProduct: (id) => `/admin/ai-media/jobs/${id}/attach-product`,
  status: "/admin/ai-media/status",
};

const collections = {
  base: "/admin/collections",
  byId: (id) => `/admin/collections/${id}`,
};

const taxClasses = {
  base: "/admin/tax-classes",
  byId: (id) => `/admin/tax-classes/${id}`,
};

const companyProfile = {
  base: "/admin/company-profile",
};

const warehouses = {
  base: "/admin/warehouses",
  byId: (id) => `/admin/warehouses/${id}`,
};

const stock = {
  base: "/admin/stock",
  movements: "/admin/stock/movements",
  adjust: "/admin/stock/adjust",
  transfer: "/admin/stock/transfer",
  product: (id) => `/admin/stock/product/${id}`,
  backfill: "/admin/stock/backfill",
};

export const adminEndpoints = {
  users,
  products,
  orders,
  wallet,
  brands,
  categories,
  productColors,
  razorpay,
  aisensy,
  gtm,
  ga4,
  aiMedia,
  collections,
  taxClasses,
  companyProfile,
  warehouses,
  stock,
};
