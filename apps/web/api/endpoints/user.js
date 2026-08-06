/**
 * API endpoints used by customer-facing (user) flows.
 */
const users = {
  login: "users/login",
  adminLogin: "users/admin/login",
  otpRequest: "users/otp/request",
  otpVerify: "users/otp/verify",
  register: "users",
  profile: "users/profile",
  adminProfile: "users/admin/profile",
  checkoutEmail: "users/checkout-email",
  addresses: "users/addresses",
  addressById: (id) => `users/addresses/${id}`,
  addressDefault: (id) => `users/addresses/${id}/default`,
  setPassword: "users/set-password",
  logout: "users/logout",
  adminLogout: "users/admin/logout",
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
