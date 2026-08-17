// User/customer-facing services
export {
  authService,
  productService,
  orderService,
  paymentService,
  shippingService,
  couponService,
  reelsService,
  contactService,
} from "./user/index.js";

// Admin services
export {
  adminUserService,
  adminProductService,
  adminOrderService,
  adminCategoryService,
  adminProductColorService,
  adminShippingService,
  adminAisensyService,
  abandonedCheckoutService,
  adminCouponService,
  adminTaxClassService,
  adminCompanyProfileService,
  adminStockService,
  adminErpService,
  adminSettingsService,
  adminMediaService,
} from "./admin/index.js";
