import client from "../../axios/client.js";

export const contactService = {
  submit: (data) => client.post("/contact", data).then((res) => res.data),
  /** { turnstileSiteKey } — empty when the bot check is off. */
  getConfig: () => client.get("/contact/config").then((res) => res.data),
};

export default contactService;
