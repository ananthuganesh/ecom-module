import client from "../../axios/client.js";

export const trackingService = {
  /** Server copy of a Meta pixel event, for the Conversions API. */
  metaEvent: (data) => client.post("/tracking/meta", data).then((res) => res.data),
};

export default trackingService;
