import client from "../../axios/client.js";

export const contactService = {
  submit: (data) => client.post("/contact", data).then((res) => res.data),
};

export default contactService;
