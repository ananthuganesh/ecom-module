// User/customer-facing services
export {
  authService,
  productService,
  orderService,
  paymentService,
  shippingService,
  couponService,
  collectionService,
  reelsService,
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
  adminGa4Service,
  abandonedCheckoutService,
  adminCollectionService,
  adminCouponService,
  adminTaxClassService,
  adminCompanyProfileService,
  adminStockService,
  adminErpService,
  adminSettingsService,
  adminMediaService,
} from "./admin/index.js";
