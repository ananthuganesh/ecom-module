/**
 * Meta Pixel, fired from code rather than GTM.
 *
 * Every storefront ecommerce event already goes through lib/tracking.js as a
 * GA4-style dataLayer push. This maps the same payload to Meta's standard
 * events with value, currency and content_ids, and gives each one an event_id:
 *
 * - Purchase uses the order's database id, which the server also sends to the
 *   Conversions API from the payment path (apps/api services/conversions.py).
 * - ViewContent / AddToCart / InitiateCheckout get a fresh id, and the same
 *   event is posted to /api/tracking/meta so the server sends a copy.
 *
 * Meta keeps one of each browser/server pair. The pixel must not also be
 * loaded by a GTM tag, or every event is counted twice.
 */

const GA_TO_META = {
  view_item: "ViewContent",
  add_to_cart: "AddToCart",
  begin_checkout: "InitiateCheckout",
  add_payment_info: "AddPaymentInfo",
  add_to_wishlist: "AddToWishlist",
  purchase: "Purchase",
  search: "Search",
};

/** Events the server mirrors; Purchase is sent from the payment path instead. */
export const SERVER_MIRRORED_EVENTS = new Set(["ViewContent", "AddToCart", "InitiateCheckout"]);

const WITH_NUM_ITEMS = new Set(["InitiateCheckout", "Purchase"]);

function money(n) {
  const value = Number(n);
  return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) / 100 : 0;
}

/**
 * GA4 ecommerce payload → Meta standard event, or null when there is nothing
 * worth sending (an unmapped event, or a product event with no product ids).
 *
 * @param {string} gaEvent
 * @param {{ value?: number, items?: object[], search_term?: string }} ecommerce
 * @returns {{ name: string, params: object } | null}
 */
export function metaEventFor(gaEvent, ecommerce = {}) {
  const name = GA_TO_META[gaEvent];
  if (!name) return null;

  const contents = (ecommerce.items || [])
    .map((item) => ({
      id: String(item?.item_id || ""),
      quantity: Math.max(1, Math.floor(Number(item?.quantity) || 1)),
      item_price: money(item?.price),
    }))
    .filter((c) => c.id);

  const params = { currency: "INR", value: money(ecommerce.value) };

  if (name === "Search") {
    const term = String(ecommerce.search_term || "").trim();
    if (!term) return null;
    params.search_string = term;
  } else if (!contents.length) {
    return null;
  }

  if (contents.length) {
    params.content_type = "product";
    params.content_ids = [...new Set(contents.map((c) => c.id))];
    params.contents = contents;
  }
  if (WITH_NUM_ITEMS.has(name)) {
    params.num_items = contents.reduce((n, c) => n + c.quantity, 0);
  }
  if (name === "ViewContent" && ecommerce.items?.[0]?.item_name) {
    params.content_name = String(ecommerce.items[0].item_name).slice(0, 200);
  }
  return { name, params };
}

export function newMetaEventId(name) {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}${Math.random().toString(36).slice(2, 12)}`;
  return `${String(name).toLowerCase()}_${random}`;
}

/** Set by components/MetaPixel.jsx; keeps this module free of the axios layer. */
let mirror = null;

export function setMetaServerMirror(fn) {
  mirror = typeof fn === "function" ? fn : null;
}

function pixelReady() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.__uaMetaPixelId) &&
    typeof window.fbq === "function"
  );
}

/**
 * Fire the Meta equivalent of a GA4 ecommerce event. Never throws: tracking
 * must not break the shopping flow.
 *
 * @param {string} gaEvent
 * @param {object} ecommerce
 * @param {string} [eventId] reuse an id the server also sends (Purchase)
 */
export function trackMetaEvent(gaEvent, ecommerce, eventId) {
  if (!pixelReady()) return;
  const mapped = metaEventFor(gaEvent, ecommerce);
  if (!mapped) return;
  const id = eventId ? String(eventId) : newMetaEventId(mapped.name);
  try {
    window.fbq("track", mapped.name, mapped.params, { eventID: id });
  } catch {
    /* ignore */
  }
  if (mirror && SERVER_MIRRORED_EVENTS.has(mapped.name)) {
    const { content_ids, contents, value, num_items, content_name } = mapped.params;
    const customData = { content_ids, contents, value, num_items, content_name };
    Promise.resolve()
      .then(() =>
        mirror({
          event_name: mapped.name,
          event_id: id,
          event_source_url: window.location.href,
          custom_data: customData,
        })
      )
      .catch(() => {
        /* ignore */
      });
  }
}

export function normalizeMetaPixelId(value) {
  const id = String(value || "").trim();
  return /^\d{10,20}$/.test(id) ? id : "";
}

/**
 * Inline <head> script: defines the fbq queue, init and the first PageView
 * before React hydrates, so events fired on first render are queued rather
 * than lost. components/MetaPixel.jsx loads fbevents.js, which drains it.
 * Admin pages are skipped.
 */
export function metaPixelBootstrap(pixelId) {
  const id = normalizeMetaPixelId(pixelId);
  if (!id) return "";
  return (
    "(function(w,id){if(w.fbq||w.location.pathname.indexOf('/admin')===0)return;" +
    "var n=w.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};" +
    "if(!w._fbq)w._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];" +
    `w.__uaMetaPixelId=id;n('init',id);n('track','PageView');})(window,"${id}");`
  );
}
