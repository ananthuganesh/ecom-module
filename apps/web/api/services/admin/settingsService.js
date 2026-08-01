import client from "../../axios/client.js";

export const adminSettingsService = {
  getShippingSettings: () => client.get("/admin/shipping-settings").then((r) => r.data),
  saveShippingSettings: (data) => client.put("/admin/shipping-settings", data).then((r) => r.data),
  getDtdcSettings: () => client.get("/admin/dtdc/settings").then((r) => r.data),
  saveDtdcSettings: (data) => client.put("/admin/dtdc/settings", data).then((r) => r.data),
  getNotificationPrefs: () => client.get("/admin/notification-prefs").then((r) => r.data),
  saveNotificationPrefs: (data) => client.put("/admin/notification-prefs", data).then((r) => r.data),
};

export default adminSettingsService;
