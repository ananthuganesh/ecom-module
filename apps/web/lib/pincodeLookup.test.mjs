import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { lookupPincode } from "./pincodeLookup.js";

const reply = (body) => async () => ({ json: async () => body });

describe("lookupPincode", () => {
  it("reads district and state from India Post", async () => {
    const hit = await lookupPincode(
      "560038",
      reply([{ Status: "Success", PostOffice: [{ District: "Bangalore", State: "Karnataka" }] }])
    );
    assert.deepEqual(hit, { city: "Bangalore", state: "Karnataka" });
  });

  it("returns null for bad input, misses and network errors without fetching junk", async () => {
    let called = false;
    assert.equal(await lookupPincode("5600", async () => { called = true; }), null);
    assert.equal(called, false);
    assert.equal(await lookupPincode("999999", reply([{ Status: "Error" }])), null);
    assert.equal(await lookupPincode("560038", async () => { throw new Error("offline"); }), null);
  });
});
