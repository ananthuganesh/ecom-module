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
  returnService,
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
  adminAiMediaService,
  adminReturnsService,
  adminStoreThemeService,
} from "./admin/index.js";
