import client from "../../axios/client.js";
import { userEndpoints } from "../../endpoints/user.js";

const { users: e } = userEndpoints;

export const authService = {
  login: (email, password) =>
    client.post(e.login, { email, password }).then((res) => res.data),

  requestOtp: (email) =>
    client.post(e.otpRequest, { email }).then((res) => res.data),

  verifyOtp: (email, code) =>
    client.post(e.otpVerify, { email, code }).then((res) => res.data),

  adminLogin: (email, password) =>
    client.post(e.adminLogin, { email, password }).then((res) => res.data),

  register: (name, email, password) =>
    client.post(e.register, { name, email, password }).then((res) => res.data),

  getProfile: () =>
    client.get(e.profile).then((res) => res.data),

  getAdminProfile: () =>
    client.get(e.adminProfile).then((res) => res.data),

  updateProfile: (data) =>
    client.put(e.profile, data).then((res) => res.data),

  checkoutEmail: (email, name, prefs = {}) =>
    client
      .post(e.checkoutEmail, {
        email,
        ...(name ? { name } : {}),
        ...(prefs.emailSubscribed !== undefined
          ? { emailSubscribed: !!prefs.emailSubscribed }
          : {}),
        ...(prefs.whatsappSubscribed !== undefined
          ? { whatsappSubscribed: !!prefs.whatsappSubscribed }
          : {}),
      })
      .then((res) => res.data),

  setPassword: (password) =>
    client.post(e.setPassword, { password }).then((res) => res.data),

  logout: () => client.post(e.logout).then((res) => res.data),

  adminLogout: () => client.post(e.adminLogout).then((res) => res.data),
};

export default authService;
