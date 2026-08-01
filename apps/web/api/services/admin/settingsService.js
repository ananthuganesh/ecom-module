import client from "../../axios/client.js";

export const adminSettingsService = {
  getCompanyProfile: () => client.get("/admin/company-profile").then((r) => r.data),
  saveCompanyProfile: (data) => client.put("/admin/company-profile", data).then((r) => r.data),
  getShippingSettings: () => client.get("/admin/shipping-settings").then((r) => r.data),
  saveShippingSettings: (data) => client.put("/admin/shipping-settings", data).then((r) => r.data),
  getTaxSettings: () => client.get("/admin/tax-settings").then((r) => r.data),
  saveTaxSettings: (data) => client.put("/admin/tax-settings", data).then((r) => r.data),
  getDtdcSettings: () => client.get("/admin/dtdc/settings").then((r) => r.data),
  saveDtdcSettings: (data) => client.put("/admin/dtdc/settings", data).then((r) => r.data),
  getPaymentMethods: () => client.get("/admin/payment-methods").then((r) => r.data),
  savePaymentMethods: (data) => client.put("/admin/payment-methods", data).then((r) => r.data),
  getNotificationPrefs: () => client.get("/admin/notification-prefs").then((r) => r.data),
  saveNotificationPrefs: (data) => client.put("/admin/notification-prefs", data).then((r) => r.data),
};

export default adminSettingsService;
