import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addressToForm,
  emptyAddressForm,
  formToAddressBody,
  sortAddresses,
  tenDigitPhone,
  validateAddressForm,
} from "./customerAddressForm.js";

const good = {
  name: "Asha",
  phone: "9876543210",
  house: "12 MG Road",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560038",
};

describe("tenDigitPhone", () => {
  it("drops +91 and leading 0 like the API", () => {
    assert.equal(tenDigitPhone("+91 98765 43210"), "9876543210");
    assert.equal(tenDigitPhone("09876543210"), "9876543210");
    assert.equal(tenDigitPhone(""), "");
  });
});

describe("validateAddressForm", () => {
  it("accepts a complete address", () => {
    assert.equal(validateAddressForm(good), "");
  });

  it("allows an empty phone (API falls back to the customer's)", () => {
    assert.equal(validateAddressForm({ ...good, phone: "" }), "");
  });

  it("reports the same problems the API rejects", () => {
    assert.match(validateAddressForm({ ...good, house: "x" }), /street address/);
    assert.match(validateAddressForm({ ...good, city: " " }), /City and state/);
    assert.match(validateAddressForm({ ...good, pincode: "5600" }), /PIN code/);
    assert.match(validateAddressForm({ ...good, pincode: "56003a" }), /PIN code/);
    assert.match(validateAddressForm({ ...good, phone: "98765" }), /10-digit/);
  });
});

describe("addressToForm / formToAddressBody", () => {
  it("reads legacy aliases and round-trips trimmed values", () => {
    const form = addressToForm({
      fullName: " Asha ",
      street: " 12 MG Road ",
      zipCode: "560038",
      contact: "+919876543210",
      city: "Bengaluru",
      state: "Karnataka",
      isDefault: 1,
    });
    assert.equal(form.name, "Asha");
    assert.equal(form.house, "12 MG Road");
    assert.equal(form.pincode, "560038");
    assert.equal(form.phone, "9876543210");
    assert.equal(form.country, "India");
    assert.equal(form.isDefault, true);
    assert.deepEqual(formToAddressBody({ ...form, label: " Home " }), {
      label: "Home",
      name: "Asha",
      phone: "9876543210",
      house: "12 MG Road",
      city: "Bengaluru",
      state: "Karnataka",
      pincode: "560038",
      country: "India",
      isDefault: true,
    });
  });

  it("prefills a new address from the customer", () => {
    const form = emptyAddressForm({ name: "Asha Rao", phone: "+91 98765 43210" });
    assert.equal(form.name, "Asha Rao");
    assert.equal(form.phone, "9876543210");
    assert.equal(form.house, "");
  });
});

describe("sortAddresses", () => {
  it("puts the default first and keeps the rest in order", () => {
    const list = [{ id: "a" }, { id: "b", isDefault: true }, { id: "c" }];
    assert.deepEqual(sortAddresses(list).map((a) => a.id), ["b", "a", "c"]);
    assert.deepEqual(sortAddresses(null), []);
  });
});
