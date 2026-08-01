// User/customer-facing services
export {
  authService,
  productService,
  orderService,
  paymentService,
  shippingService,
  couponService,
  collectionService,
} from "./user/index.js";

// Admin services
export {
  adminUserService,
  adminProductService,
  adminOrderService,
  adminWalletService,
  adminBrandService,
  adminCategoryService,
  adminProductColorService,
  adminShippingService,
  adminRazorpayService,
  adminAiMediaService,
  adminAisensyService,
  adminGtmService,
  adminGa4Service,
  abandonedCheckoutService,
  adminCollectionService,
  adminCouponService,
  adminTaxClassService,
  adminCompanyProfileService,
  adminWarehouseService,
  adminStockService,
  adminErpService,
  adminSettingsService,
  adminMediaService,
} from "./admin/index.js";
