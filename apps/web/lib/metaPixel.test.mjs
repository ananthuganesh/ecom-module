import { beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";

globalThis.window = globalThis.window || {};
globalThis.sessionStorage = globalThis.sessionStorage || {
  _s: new Map(),
  getItem(k) {
    return this._s.has(k) ? this._s.get(k) : null;
  },
  setItem(k, v) {
    this._s.set(k, String(v));
  },
  removeItem(k) {
    this._s.delete(k);
  },
};

const {
  metaEventFor,
  metaPixelBootstrap,
  normalizeMetaPixelId,
  setMetaServerMirror,
  trackMetaEvent,
} = await import("./metaPixel.js");
const { trackAddToCart, trackPurchase, trackViewItem, trackSearch } = await import("./tracking.js");

const tee = { _id: "p1", productName: "Escape to Become", price: 999 };
const elephant = { _id: "p2", productName: "Indian Elephant", price: 1199 };

let fbqCalls;
let mirrored;

beforeEach(() => {
  fbqCalls = [];
  mirrored = [];
  window.dataLayer = [];
  window.__uaMetaPixelId = "4086517521638648";
  window.location = { href: "https://urbanaana.com/product/escape-to-become" };
  window.fbq = (...args) => fbqCalls.push(args);
  setMetaServerMirror((body) => {
    mirrored.push(body);
    return Promise.resolve();
  });
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("metaEventFor", () => {
  it("maps add_to_cart with value, currency and catalogue ids", () => {
    const ev = metaEventFor("add_to_cart", {
      value: 1998,
      items: [{ item_id: "p1", price: 999, quantity: 2 }],
    });
    assert.deepEqual(ev, {
      name: "AddToCart",
      params: {
        currency: "INR",
        value: 1998,
        content_type: "product",
        content_ids: ["p1"],
        contents: [{ id: "p1", quantity: 2, item_price: 999 }],
      },
    });
  });

  it("adds num_items to checkout and purchase", () => {
    const items = [
      { item_id: "p1", price: 999, quantity: 2 },
      { item_id: "p2", price: 1199, quantity: 1 },
    ];
    assert.equal(metaEventFor("begin_checkout", { value: 3197, items }).params.num_items, 3);
    assert.equal(metaEventFor("purchase", { value: 3197, items }).params.num_items, 3);
    assert.equal(metaEventFor("begin_checkout", { value: 3197, items }).name, "InitiateCheckout");
  });

  it("names the product on ViewContent", () => {
    const ev = metaEventFor("view_item", { value: 999, items: [{ item_id: "p1", item_name: "Tee", price: 999 }] });
    assert.equal(ev.name, "ViewContent");
    assert.equal(ev.params.content_name, "Tee");
  });

  it("skips product events without product ids, and unmapped events", () => {
    assert.equal(metaEventFor("add_to_cart", { value: 1, items: [] }), null);
    assert.equal(metaEventFor("add_to_cart", { value: 1, items: [{ price: 1 }] }), null);
    assert.equal(metaEventFor("view_item_list", { items: [{ item_id: "p1" }] }), null);
  });

  it("maps search without products", () => {
    const ev = metaEventFor("search", { value: 0, items: [], search_term: "oversized" });
    assert.equal(ev.name, "Search");
    assert.equal(ev.params.search_string, "oversized");
    assert.equal(ev.params.content_ids, undefined);
  });

  it("never sends a negative or non-numeric value", () => {
    assert.equal(metaEventFor("add_to_cart", { value: "abc", items: [{ item_id: "p1" }] }).params.value, 0);
    assert.equal(metaEventFor("add_to_cart", { value: -5, items: [{ item_id: "p1" }] }).params.value, 0);
  });
});

describe("storefront events reach the pixel", () => {
  it("AddToCart fires with a fresh event id and is mirrored with the same id", async () => {
    trackAddToCart(tee, 1);
    await flush();
    assert.equal(fbqCalls.length, 1);
    const [cmd, name, params, opts] = fbqCalls[0];
    assert.equal(cmd, "track");
    assert.equal(name, "AddToCart");
    assert.equal(params.value, 999);
    assert.equal(params.currency, "INR");
    assert.deepEqual(params.content_ids, ["p1"]);
    assert.match(opts.eventID, /^addtocart_/);

    assert.equal(mirrored.length, 1);
    assert.equal(mirrored[0].event_name, "AddToCart");
    assert.equal(mirrored[0].event_id, opts.eventID);
    assert.equal(mirrored[0].event_source_url, "https://urbanaana.com/product/escape-to-become");
    assert.equal(mirrored[0].custom_data.value, 999);
  });

  it("ViewContent is mirrored too", async () => {
    trackViewItem(tee);
    await flush();
    assert.equal(fbqCalls[0][1], "ViewContent");
    assert.equal(mirrored[0].event_name, "ViewContent");
  });

  it("Purchase uses the order id the server also sends, and is not mirrored", async () => {
    trackPurchase({ transactionId: "665f1c0aa1b2c3d4e5f60718", value: 2198, items: [tee, elephant] });
    await flush();
    const [, name, params, opts] = fbqCalls[0];
    assert.equal(name, "Purchase");
    assert.equal(params.value, 2198);
    assert.equal(params.num_items, 2);
    assert.deepEqual(params.content_ids, ["p1", "p2"]);
    assert.equal(opts.eventID, "665f1c0aa1b2c3d4e5f60718");
    assert.equal(mirrored.length, 0);
  });

  it("Search fires with the term", () => {
    trackSearch("oversized tee", []);
    assert.equal(fbqCalls[0][1], "Search");
    assert.equal(fbqCalls[0][2].search_string, "oversized tee");
  });

  it("does nothing when the pixel is not configured", async () => {
    delete window.__uaMetaPixelId;
    trackAddToCart(tee, 1);
    await flush();
    assert.equal(fbqCalls.length, 0);
    assert.equal(mirrored.length, 0);
    // GA4 still gets its dataLayer event.
    assert.ok(window.dataLayer.some((e) => e.event === "add_to_cart"));
  });

  it("a throwing fbq or mirror never breaks the caller", async () => {
    window.fbq = () => {
      throw new Error("blocked");
    };
    setMetaServerMirror(() => Promise.reject(new Error("offline")));
    assert.doesNotThrow(() => trackMetaEvent("add_to_cart", { value: 1, items: [{ item_id: "p1" }] }));
    await flush();
  });
});

describe("bootstrap", () => {
  it("accepts only numeric pixel ids", () => {
    assert.equal(normalizeMetaPixelId(" 4086517521638648 "), "4086517521638648");
    assert.equal(normalizeMetaPixelId("abc"), "");
    assert.equal(normalizeMetaPixelId('1";alert(1);"'), "");
    assert.equal(metaPixelBootstrap("nope"), "");
  });

  it("queues init and PageView, and skips admin pages", () => {
    const run = (pathname) => {
      const w = { location: { pathname } };
      new Function("window", metaPixelBootstrap("4086517521638648"))(w);
      return w;
    };
    const store = run("/product/1");
    assert.equal(store.__uaMetaPixelId, "4086517521638648");
    assert.deepEqual(
      store.fbq.queue.map((args) => [...args]),
      [
        ["init", "4086517521638648"],
        ["track", "PageView"],
      ]
    );
    assert.equal(run("/admin/orders").fbq, undefined);
  });
});
