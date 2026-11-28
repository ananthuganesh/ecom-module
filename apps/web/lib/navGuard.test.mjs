import { test } from "node:test";
import assert from "node:assert/strict";

import { shouldBlockNavigation } from "./navGuard.js";

const here = "https://urbanaana.com/admin/products/123?tab=media";

test("blocks a plain click to another admin page", () => {
  assert.equal(shouldBlockNavigation({ href: "/admin/orders" }, { button: 0 }, here), true);
  assert.equal(
    shouldBlockNavigation({ href: "https://urbanaana.com/admin/products/123" }, {}, here),
    true,
    "same path, different query is a different page"
  );
});

test("lets new-tab, download, external and hash links through", () => {
  assert.equal(shouldBlockNavigation({ href: "/admin/orders" }, { metaKey: true }, here), false);
  assert.equal(shouldBlockNavigation({ href: "/admin/orders" }, { ctrlKey: true }, here), false);
  assert.equal(shouldBlockNavigation({ href: "/admin/orders" }, { button: 1 }, here), false);
  assert.equal(shouldBlockNavigation({ href: "/admin/orders", target: "_blank" }, {}, here), false);
  assert.equal(shouldBlockNavigation({ href: "/file.csv", hasDownload: true }, {}, here), false);
  assert.equal(shouldBlockNavigation({ href: "https://shopify.com/" }, {}, here), false);
  assert.equal(shouldBlockNavigation({ href: "mailto:a@b.com" }, {}, here), false);
  assert.equal(shouldBlockNavigation({ href: "#variants" }, {}, here), false);
  assert.equal(shouldBlockNavigation({}, {}, here), false);
});
