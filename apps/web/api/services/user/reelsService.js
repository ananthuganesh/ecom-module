import client from "../../axios/client.js";

export const reelsService = {
  list: () => client.get("/reels").then((res) => res.data),
};

export default reelsService;
