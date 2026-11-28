/** City / state for an Indian PIN code from India Post's public API, or null. */
export async function lookupPincode(code, fetchImpl = globalThis.fetch) {
  if (!/^\d{6}$/.test(String(code || ""))) return null;
  try {
    const response = await fetchImpl(`https://api.postalpincode.in/pincode/${code}`);
    const data = await response.json();
    const result = Array.isArray(data) ? data[0] : null;
    const office = result?.Status === "Success" ? result.PostOffice?.[0] : null;
    if (!office) return null;
    return {
      city: office.District || office.Block || office.Name || "",
      state: office.State || "",
    };
  } catch {
    return null;
  }
}
