/**
 * API endpoint paths and builders.
 * Base URL is set on the axios client; these are path segments only.
 * Split into user (customer-facing) and admin for readability.
 */

export { userEndpoints } from "./user.js";
export { adminEndpoints } from "./admin.js";
