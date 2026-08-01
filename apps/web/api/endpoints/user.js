/**
 * API endpoints used by customer-facing (user) flows.
 */
const users = {
  login: "users/login",
  register: "users",
  profile: "users/profile",
  checkoutEmail: "users/checkout-email",
  setPassword: "users/set-password",
  logout: "users/logout",
};

const products = {
  base: "products",
  featured: "products/featured",
  byId: (id) => `products/${id}`,
};

const orders = {
  base: "orders",
  myOrders: "orders/myorders",
  byId: (id) => `orders/${id}`,
  pay: (id) => `orders/${id}/pay`,
  releaseReservation: (id) => `orders/${id}/release-reservation`,
};

const razorpay = {
  createOrder: "payments/create-order",
  verify: "payments/verify",
  webhook: "payments/webhook",
  config: "payments/config",
};

export const userEndpoints = { users, products, orders, razorpay };
