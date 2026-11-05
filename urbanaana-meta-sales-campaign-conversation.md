# Urban Aana – Meta Sales Campaign Setup: Full Conversation

Exported: 12 October 2026
Client: Urban Aana (https://urbanaana.com/)
Agency: Brid Network

---

## 1. User

i want to run sales campaign in meta ads for the client urbanaana. till now we specifically run awarness for last 3 mnths and now we want to start sales campaign now which is not an automatic one mannual one is planninng 2 statics and one reel is there and we run awarness campaigns in kerala, karnataka and tamilnadu so how can i start doing it

Website URL : https://urbanaana.com/

## 1. Claude

Here's how I'd set it up. One flag first, because everything else depends on it.

### 1. Fix tracking before you spend anything

A sales campaign optimises on Purchase events. If the pixel isn't firing correctly, Meta optimises blind and the money is wasted.

- **Check which storefront urbanaana.com actually runs on.** If checkout is native Shopify, install the Facebook & Instagram channel app with "Maximum" data sharing, which turns on the Conversions API. If the customer storefront is the custom Next.js build, the Shopify app won't cover those pages. In that case you need the pixel plus CAPI implemented in that codebase, firing ViewContent, AddToCart, InitiateCheckout and Purchase with value, currency and event_id for deduplication.
- **Verify the domain** in Business Settings and confirm the Purchase event is prioritised in Aggregated Event Measurement.
- **Place a real test order.** Confirm in Events Manager that Purchase fires once, with the correct value, and that the Event Match Quality is 6 or higher.

### 2. Build audiences from three months of awareness

This is the payoff of the awareness phase. Create these Custom Audiences:

- **Video viewers:** 50% or ThruPlay viewers, last 90 days.
- **Engagers:** Instagram and Facebook page engagers, last 90 and 180 days.
- **Website visitors:** all visitors in the last 30 days, plus people who added to cart in the last 14 days but didn't purchase.
- **Purchasers:** last 180 days, used for exclusion. Also build a 1% lookalike of purchasers if you have more than 100 of them; otherwise build it from engagers.

### 3. Campaign structure (manual)

**Campaign:** Sales objective, Manual sales campaign (Advantage+ off). Use ad set budgets (ABO) so you control the split between warm and cold.

**Ad set A, Retargeting (warm):** website visitors, ATC non-purchasers, video viewers and engagers. Exclude purchasers.
- Locations: Kerala, Karnataka, Tamil Nadu.
- Budget: about 40%.

**Ad set B, Prospecting (cold):** same three states, age 18–34 (adjust to your buyer data), all genders.
- Targeting: broad or light interests (streetwear, oversized t-shirts, Bewakoof/Souled Store-type interests), or the lookalike.
- Exclude purchasers and the warm audiences.
- Budget: about 60%.

**Common settings for both ad sets:**
- Conversion location: Website. Performance goal: Maximise conversions. Event: Purchase.
- Attribution: 7-day click, 1-day view.
- Placements: Advantage+ placements are fine, but make sure each creative has 4:5 and 9:16 versions.

**Ads:** put all three creatives (2 statics and the reel) in both ad sets.
- Link to product or collection pages, not the homepage.
- Use the Shop Now CTA.
- Add UTMs (`utm_source=meta&utm_medium=paid&utm_campaign=sales_south&utm_content=static1`) so Shopify or GA4 reports match up.

### 4. Budget, candidly

At the ₹100–200/day you ran for awareness, a sales campaign will barely exit the learning phase. Meta wants roughly 50 conversions per ad set per week.

- **Recommendation:** ₹800–1,500/day minimum across both ad sets.
- **If purchases are below about 10 a week after 7 days:** switch the prospecting ad set's optimisation event to AddToCart temporarily, then move back to Purchase once volume builds.
- **Work out your break-even CPA first:** AOV × gross margin. That number is your kill line.

### 5. Creative and offer

Three creatives are thin for sales. Expect fatigue within 2–3 weeks.

- **Give a reason to buy now:** a first-order code, free shipping, or a launch drop. Sales ads without an offer convert poorly for a young brand.
- **Primary text:** product name, price, the offer, and a delivery promise. Keep the hook in the first line.
- **Plan 2–3 fresh variations every two weeks.** Your retainer scope already covers 8 creative variations a month, so use them here.

### 6. Operating rhythm

- **Days 1–4:** don't touch it. Edits reset the learning phase.
- **Day 5–7:** pause any ad with link CTR below 0.8% or a CPA above 1.5× break-even.
- **Week 2:** shift budget toward whichever ad set has the better CPA. Scale winners by 20% every 2–3 days, not in big jumps.
- **Metrics to watch, in order:** CPA and ROAS, then ATC-to-purchase rate (a low rate points to a site or checkout problem, not the ads), then CTR and CPM.

Keep the awareness campaigns running at a low level alongside this. They feed the warm audience that converts cheapest.

---

## 2. User

we only have total of 250 per day

## 2. Claude

At ₹250/day, two ad sets would starve each other. Use one ad set and put all of it on the warm audience, because that's where a small budget converts.

### Setup

**Campaign:** Manual Sales, with the ₹250/day budget set at the campaign level.

**One ad set, warm only:**
- Audience: website visitors (30 days), add-to-cart non-purchasers (14 days), video viewers at 50% or ThruPlay (90 days), and IG/FB engagers (90 days). Exclude purchasers.
- Locations: Kerala, Karnataka, Tamil Nadu.
- Optimisation: Purchase. It will show as "Learning limited". That label is expected at this spend, so ignore it and judge on cost per purchase.
- Placements: Advantage+.

**Ads:** start with two, the reel and your stronger static. Three ads on ₹250 splits delivery too thin. Swap the third static in after 7–10 days, or when frequency climbs.

### What's dropped, and why

- **Cold prospecting.** You can't afford to find new buyers and convert them on this budget. Three months of awareness already built the pool, so harvest it.
- **Awareness.** If the ₹250 is your entire Meta budget, pause awareness for now. If awareness has a separate budget, keep it running at minimum, because it refills the warm audience.

### Expectations

- ₹250/day is about ₹7,500/month.
- At a ₹300–500 CPA, that's roughly 15–25 orders a month. It's a proof run, not a scale run.
- Compare CPA against your break-even (AOV × gross margin). If the warm audience converts below break-even, that's the case to the client for a bigger budget.

### Rules

- Don't edit for 5 days. Review weekly, not daily.
- If frequency goes above 3.5 per week, widen the audience: add 180-day engagers and 60-day visitors.
- If there are zero purchases after 10 days but add-to-carts are happening, the problem is the site or checkout (price, shipping cost, payment options), not the ads.
- Run an offer, such as a first-order code or free shipping. On a budget this small, the offer does more work than the targeting.

Once the warm campaign holds a CPA below break-even for 2–3 weeks, add a cold ad set with the extra budget it justifies.

---

## 3. User

okay now give step by step things i need to

## 3. Claude

Do these in order. Don't move on to the next phase until the current one checks out.

### Phase 1: Tracking (Day 0)

1. **Confirm the pixel is on the live site.** Install the Meta Pixel Helper Chrome extension, open urbanaana.com, and browse a product page. You should see PageView and ViewContent firing.
2. **Place one real test order.** In Events Manager, check that AddToCart, InitiateCheckout and Purchase each fire once, and that the Purchase event carries the correct value and INR as the currency. If Purchase doesn't fire, stop here and fix it.
3. **Check Event Match Quality** for Purchase in Events Manager. It should be 6 or higher. If it's lower, enable Conversions API (Shopify Meta app, "Maximum" data sharing).
4. **Verify the domain.** Go to Business Settings → Brand Safety → Domains and verify urbanaana.com.

### Phase 2: Audiences (Day 0)

Go to Ads Manager → Audiences → Create audience → Custom audience.

5. **Website:** all visitors, last 30 days. Name it "UA – Web 30d".
6. **Website, add-to-cart event:** last 14 days. Name it "UA – ATC 14d".
7. **Website, Purchase event:** last 180 days. Name it "UA – Purchasers 180d". This one is for exclusion.
8. **Video:** people who watched 50% or ThruPlay of your awareness videos, last 90 days. Name it "UA – Video 90d".
9. **Instagram account:** everyone who engaged, last 90 days. Name it "UA – IG Eng 90d".
10. **Facebook Page:** everyone who engaged, last 90 days. Name it "UA – FB Eng 90d".
11. **Check the combined size.** Wait about an hour for the audiences to populate. If the combined size is under 10,000, also create 180-day versions of the video and engager audiences and use those instead.

### Phase 3: Prepare assets (Day 0)

12. **Creatives:** the reel in 9:16 format, and the strongest static in both 4:5 and 9:16.
13. **Offer:** create a discount code in Shopify (for example, FIRST10), or switch on free shipping.
14. **Copy:** write the primary text with the hook, product, price, offer and delivery promise. Headline: product name plus the offer.
15. **Landing page:** the URL of the product or collection page each ad promotes.
16. **UTM:** `utm_source=meta&utm_medium=paid&utm_campaign=ua_sales_warm&utm_content={{ad.name}}`

### Phase 4: Build the campaign (Day 1)

17. **Create the campaign:** Ads Manager → Create → Sales → choose Manual sales campaign.
18. **Campaign settings:**
    - Name: "UA – Sales – Warm – South".
    - Budget: Advantage campaign budget, daily, ₹250.
    - Bid strategy: Highest volume.
19. **Ad set: conversion.**
    - Conversion location: Website.
    - Pixel: Urban Aana. Event: Purchase.
    - Performance goal: Maximise number of conversions.
20. **Ad set: attribution.** 7-day click, 1-day view.
21. **Ad set: audience.** This step is critical.
    - Choose "Use original audience options". Advantage+ audience would push spend outside your warm pool.
    - Include: Web 30d, ATC 14d, Video 90d, IG Eng 90d, FB Eng 90d.
    - Exclude: Purchasers 180d.
    - Locations: Kerala, Karnataka, Tamil Nadu.
    - Age: 18–40. Gender: all.
    - Make sure Advantage custom audience is OFF.
22. **Ad set: placements.** Advantage+ placements.
23. **Ad 1 (reel):** single video, primary text, headline, Shop Now CTA, landing URL plus the UTM. Name it "Reel_v1".
24. **Ad 2 (static):** single image with the 4:5 and 9:16 versions mapped to placements, same copy pattern. Name it "Static1_v1".
25. **Publish.** Keep the third static in reserve.

### Phase 5: Run and review

26. **Days 1–5:** change nothing. Check once a day only to confirm the ads are delivering.
27. **Day 7 review:** check spend, purchases, CPA, ATC count, CTR (link) and frequency.
    - If one ad has CTR below 0.8% and no ATCs, pause it and add Static 2.
    - If frequency is above 3.5, swap the 90-day audiences for the 180-day versions.
    - If there are ATCs but no purchases, check the checkout, shipping cost and COD availability.
28. **Weekly:** compare CPA with your break-even (AOV × gross margin), and add 1–2 fresh creatives every 2 weeks.
29. **After 2–3 weeks with CPA below break-even:** take the numbers to the client and ask for budget to add a cold prospecting ad set.

Send me the AOV and margin and I'll work out the break-even CPA for you.

---

## 4. User

*[Screenshot: urbanaana.com product page "Escape to Become" oversized T-shirt, ₹999 (MRP ₹1,499, 33% off), with the Meta Ads Data Advisor panel showing pixel ID 4086517521638648 and two test events, ViewContent and PageView, both "Event sent".]*

Check is this okay

## 4. Claude

Partly. The pixel is installed and PageView and ViewContent are firing on the product page, so the base setup works. Two events aren't enough for a sales campaign, though. Finish these checks before you launch.

**1. Check the ViewContent parameters.** Expand ViewContent in the panel. It should show:
- `content_ids`: the SKU or product ID, matching your catalogue IDs
- `content_type`: product
- `value`: 999
- `currency`: INR

If `value` or `currency` is missing, get the developer to add them.

**2. Test AddToCart.** Pick a size, click "Add to cart" and watch the panel. AddToCart should appear with the same parameters as ViewContent. Your cart already shows 1 item, but no AddToCart event is listed, so test it fresh.

**3. Test the checkout path.** Click "Buy now" or go to checkout. InitiateCheckout should fire.

**4. Test Purchase.** Place a real order (COD or a low-value one). Purchase must fire exactly once on the order confirmation page, with `value` equal to the order total and `currency` INR. Refresh the confirmation page afterwards: it must not fire a second time. Duplicate purchases will mislead Meta's optimisation.

**5. Check Conversions API in Events Manager.** This storefront looks like the custom build rather than a Shopify theme, which means the Shopify Meta app won't send server events from these pages. Go to Events Manager → your pixel → Overview, and check the connection method for each event:
- It should show "Browser • Server". If it shows only "Browser", CAPI isn't set up. Many iOS and ad-blocker users will be missed, and results will look worse than they are.
- If server events are present, confirm deduplication: a matching `event_id` on the browser and server versions of each event.

**Minimum to launch:** steps 2 and 4 must pass. Step 5 can follow within a week or two, but don't delay it longer, because on a ₹250/day budget every lost conversion signal hurts.

The product page itself is sales-ready. It has a clear price, the discount, the delivery date and trust lines, so a separate ad offer is optional here. Lead with the ₹999 (33% off) in the ad copy.

Send screenshots of steps 2 and 4 and I'll check them.

---

## 5. User

*[Screenshot: Meta Ads Data Advisor panel, pixel ID 4086517521638648. Test events: ViewContent (Event sent), PageView (Event sent), PageView on https://urbanaana.com/ (Event sent). No AddToCart.]*

## 5. Claude

This isn't ready yet. Only page-load events are showing: PageView on the homepage, and PageView plus ViewContent on the product page. There's no AddToCart.

**First, rule out a test slip.** Open the product page, select a size, click "Add to cart", and keep the panel open while you do it.

- **If AddToCart appears:** it's working. Expand it and check that `value`, `currency` and `content_ids` are present.
- **If nothing appears:** AddToCart isn't implemented. InitiateCheckout and Purchase are very likely missing too, since the custom storefront only fires the automatic page events.

**If the events are missing,** the developer needs to add them in the Next.js storefront. This is the minimum production-ready version.

`lib/metaPixel.ts`

```ts
type StandardEvent = 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';

declare global {
  interface Window {
    fbq?: (...args: unknown[]) => void;
  }
}

export interface PixelParams {
  content_ids: string[];
  content_type: 'product';
  value: number;        // in rupees, e.g. 999 (not paise)
  currency: 'INR';
  num_items?: number;
  contents?: { id: string; quantity: number; item_price: number }[];
}

export function trackPixel(event: StandardEvent, params: PixelParams, eventId?: string): void {
  if (typeof window === 'undefined' || typeof window.fbq !== 'function') return;
  if (!Number.isFinite(params.value) || params.value < 0 || params.content_ids.length === 0) {
    console.warn(`[MetaPixel] Invalid params for ${event}`, params);
    return;
  }
  try {
    window.fbq('track', event, params, eventId ? { eventID: eventId } : undefined);
  } catch (err) {
    console.error(`[MetaPixel] Failed to track ${event}`, err);
  }
}
```

**AddToCart.** Fire it only after the cart API call succeeds, not on the button click itself.

```ts
await addToCart(variantId, qty); // existing call
trackPixel('AddToCart', {
  content_ids: [sku],
  content_type: 'product',
  value: price * qty,
  currency: 'INR',
  contents: [{ id: sku, quantity: qty, item_price: price }],
}, `atc_${sku}_${Date.now()}`);
```

**InitiateCheckout.** Fire it once when the checkout page mounts, with the cart total and every item's SKU.

**Purchase.** Fire it on the order confirmation page only, and guard it so a refresh can't fire it again:

```ts
useEffect(() => {
  if (!order?.id) return;
  const key = `ua_purchase_tracked_${order.id}`;
  try {
    if (sessionStorage.getItem(key)) return;
    trackPixel('Purchase', {
      content_ids: order.items.map(i => i.sku),
      content_type: 'product',
      value: order.total,
      currency: 'INR',
      num_items: order.items.reduce((n, i) => n + i.quantity, 0),
      contents: order.items.map(i => ({ id: i.sku, quantity: i.quantity, item_price: i.price })),
    }, `purchase_${order.id}`);
    sessionStorage.setItem(key, '1');
  } catch {
    /* storage blocked — accept a rare duplicate rather than losing the event */
  }
}, [order?.id]);
```

Three details matter:

- **Use the same IDs as your catalogue.** `content_ids` must match the IDs in your Meta catalogue (SKU or variant ID), otherwise dynamic ads won't work later.
- **Reuse the event IDs for Conversions API.** When CAPI is added later, the server must send the same `event_id` (for example `purchase_${order.id}`), so Meta counts each event once instead of twice.
- **Fire Purchase from the confirmation page.** Use the confirmation page or the order-success callback, never the "Place order" button. Payment can still fail after that click.

After the deploy, re-test add to cart, then checkout, then a real order. Launch only once you see AddToCart, InitiateCheckout and Purchase in the panel with the correct values.

---

## 6. User

*[Screenshot: Shopping cart drawer with 2 items (Indian Elephant, XXXL, ₹1,199; Escape to Become, M, ₹999), total ₹2,198. Data Advisor shows AddToCart (Event received), SubscribedButtonClick (Event received), ViewContent, PageView, PageView (Event sent).]*

once i added the product to add to cart it shows like this

## 6. Claude

AddToCart is firing and Meta is receiving it. That's good.

**Check its parameters before moving on.** Expand AddToCart. It should show `value` equal to the price of the item you just added (999 if that was Escape to Become, not the cart total of 2,198), `currency` INR, and a `content_ids` value that matches that product's ID in your catalogue. If `value` or `currency` is missing, Meta can't optimise or report on value, so get the developer to fix it.

**SubscribedButtonClick is not a problem.** It's Meta's automatic button-click tracking, and it doesn't affect your Purchase optimisation, so leave it.

**Next test: checkout.** Click "Proceed to Checkout". InitiateCheckout should fire with `value` 2198, `currency` INR and `num_items` 2. If it doesn't appear, it's missing.

**Then the real test: Purchase.** Complete an order, COD if available. Purchase must fire once on the confirmation page with `value` equal to the order total. Refresh the page and confirm it doesn't fire a second time.

Send the screenshot after checkout and after the order is placed. Purchase is the event that decides whether you can launch.

---

## 7. User

*[Screenshot: Cart with 1 item (Indian Elephant, ₹1,199). AddToCart expanded in Data Advisor showing Event info: Setup method Manual, Pixel location (Show), Frame IFrame, URL called (Show). No value shown.]*

its not showing value

## 7. Claude

The value may just be further down the panel. Before concluding it's missing:

**1. Scroll down inside the expanded AddToCart event.** Below "URL called" there's usually a "Parameters" (or "Custom data") section.
- **If it lists `value: 1199` and `currency: INR`:** it's fine. Also check that `content_ids` is there.
- **If there's no Parameters section, or `value` and `currency` are missing:** the event is firing without data, and the developer needs to fix it.

**2. If it's missing, here's the fix.** "Setup method: Manual" means the event is coded into the site, so the fix goes in that same code. The current call is probably just `fbq('track', 'AddToCart')`. It needs to send the data too, along the lines of the snippet shared earlier:

```ts
fbq('track', 'AddToCart', {
  content_ids: [sku],
  content_type: 'product',
  value: 1199,        // item price × qty, as a number in rupees
  currency: 'INR',
});
```

Apply the same fix to ViewContent, InitiateCheckout and Purchase. Purchase is the critical one, because without a value Meta can't report ROAS.

Don't use the "Set up events" button (the no-code Event Setup Tool) to patch this. It can't reliably pull the price from a custom storefront, so do it in code.

**3. Check "Frame: IFrame".** It says this event fired from inside an iframe, which is unusual. Click "Show" under "URL called" and "Pixel location".
- **If the URL is urbanaana.com:** probably harmless.
- **If it's another domain (a cart or checkout widget, or a third-party script):** events from there can lose attribution and match quality. Tell the developer to fire the events from the main page instead.

Send a screenshot of the Parameters section and the "URL called" value and I'll confirm.

---

## 8. User

> Place one real test order. In Events Manager, check that AddToCart, InitiateCheckout and Purchase each fire once, and that the Purchase event carries the correct value and INR as the currency. If Purchase doesn't fire, stop here and fix it.

How to check

## 8. Claude

Use the Test Events tab in Events Manager. It shows each event live as you go through the order.

### Setup

1. Open business.facebook.com/events_manager and select the pixel with ID 4086517521638648.
2. Click the **Test events** tab.
3. Under "Confirm your website's events are set up correctly", choose **Website**, enter `https://urbanaana.com` and click **Open website**. Your site opens in a new tab that's linked to the test view, and that link is what makes your actions show up live.

### Place the order (in that new tab)

4. Open a product page, choose a size and click **Add to cart**.
5. Click **Proceed to Checkout**.
6. Complete the order. COD is best because it costs nothing. If COD isn't available, pay for the cheapest item online and refund it afterwards.
7. Wait on the order confirmation page for about 10 seconds, then refresh it once.

### Check (back in the Test events tab)

Events appear within a few seconds. Click each one to expand it.

| Event | Must show |
|---|---|
| AddToCart | value equal to the item price, currency INR, content_ids |
| InitiateCheckout | value equal to the cart total, currency INR, num_items |
| Purchase | value equal to the order total, currency INR, appearing once only |

**Pass:** all three appear, Purchase appears exactly once (even after you refreshed the confirmation page), and the value matches the order total.

**Fail, and the fix for each:**
- **Purchase is missing.** Most often this happens with online payment, when the payment gateway doesn't return the customer to your confirmation page or the event isn't coded. Tell the developer to fire Purchase on the confirmation page after the order is confirmed.
- **Purchase appears twice after the refresh.** The deduplication guard from the earlier code snippet is missing, so it needs adding.
- **There's no value or currency.** Add the parameters, as covered earlier.
- **Events show "Browser" only.** That's acceptable for launch, but Conversions API should be added next.

### After the test

8. Cancel the test order in your admin panel so it doesn't get shipped, and refund it if you paid online.
9. About 30 minutes later, open the **Overview** tab. Purchase should now appear in the events list with a recent timestamp, which confirms Meta has recorded it.

Send me screenshots of the Purchase event with its details expanded and I'll confirm whether you're ready to launch.

---

## 9. User

*[Screenshot: Events Manager Test events for urbanaana.com (test_event_code: TEST95397). Events received, all "Processed", from Browser, setup method Partner integration, no Event ID: Initiate checkout (expanded: URL https://urbanaana.com/, action source website, advanced matching parameters IP address and User agent only), SubscribedButtonClick (automatically logged), PageView (Custom event), Add to cart, SubscribedButtonClick, PageView (Custom event), View content, PageView (Custom event).]*

## 9. Claude

**Verdict:** events fire, but the data is thin. Don't launch until Purchase is confirmed.

### What's working

- ViewContent, AddToCart and InitiateCheckout all fire, in the right order and once each.
- They come through Partner integration, which means a platform app (most likely Shopify's Facebook & Instagram app) is sending them. That's the right foundation.

### What's wrong

**1. No value or currency.** The expanded InitiateCheckout shows only URL, action source and matching parameters. There's no `value`, `currency` or `content_ids`, which means Meta can't report revenue or ROAS. Expand Add to cart and View content to confirm, but they will likely be the same.

**2. Browser events only, with no Event ID.** Conversions API isn't active, so you'll lose conversions from iOS users and people with ad blockers.

**3. Weak matching.** Only IP address and user agent are being sent. With no email or phone, conversions are harder for Meta to attribute to the right people.

**4. PageView is flagged as a "Custom event".** It should be the standard PageView. This is minor, but it's a sign the integration isn't configured cleanly.

### Fix: one setting likely covers 1–3

1. **Shopify admin → Sales channels → Facebook & Instagram → Settings → Data sharing:** set it to **Maximum**. This turns on Conversions API, adds Event IDs for deduplication, and sends hashed email and phone at checkout.
2. **Same app:** confirm the pixel connected is the one with ID 4086517521638648, and that the catalogue is synced.
3. **Re-test.** Events should now show "Browser • Server", an Event ID, value and currency.

If urbanaana.com runs on the custom Next.js storefront rather than a Shopify theme, the app setting only fixes events on Shopify-hosted pages, such as checkout and the thank-you page. In that case the storefront events (ViewContent and AddToCart) need `value` and `currency` added in code, as covered earlier.

### Next

Complete the order and check that Purchase appears.

- **If Purchase fires once, you can launch.** Missing value only affects revenue and ROAS reporting, not delivery, because you're optimising for the number of purchases. Fix value within the first week.
- **If Purchase doesn't fire, don't launch.**

Send the Purchase screenshot when you have it.

---

## 10. User

our website is coded one so guide me to solve this issie

## 10. Claude

*(Delivered seven files: README.md, lib/meta/shared.ts, lib/meta/pixel.ts, components/MetaPixel.tsx, lib/meta/capi.server.ts, lib/meta/purchase.server.ts, app/api/meta/capi/route.ts. Full contents are in the Appendix.)*

These files go to your developer. Together they fix all four problems from the Events Manager test.

**Order of work:**

1. **Remove the current pixel source.** "Partner integration" means something else is loading the pixel right now: GTM, a plugin, or the Shopify app. If you leave it in, every event will double count. The README has a grep command to find it.
2. **Generate the Conversions API token.** Go to Events Manager → your pixel → Settings → Conversions API → Generate access token, and store it only as an environment variable.
3. **Add the files and environment variables.** Then add `<MetaPixel />` to `app/layout.tsx`.
4. **Wire the five events.** The README shows exactly where to add ViewContent, AddToCart, InitiateCheckout, order capture and Purchase.
5. **Test with your test code.** Every event should show a Browser row and a Server row with the same Event ID, plus value and INR. Then remove the test code and deploy.

**What the code handles:**

- Value, currency and catalogue IDs are sent on every event, with validation, so pricing bugs show up in development.
- Browser and server copies share an event ID, so Meta counts each event once.
- Purchase is sent server-side from your order or payment handler. That makes it reliable even when the customer closes the tab, and the public endpoint refuses Purchase events so nobody can inject fake ones.
- Email, phone and address are normalised to the Indian formats Meta expects and hashed, which raises match quality.
- Tracking failures never break checkout.

**One decision before the developer starts:** if checkout runs on Shopify, Purchase should come from the Shopify app (data sharing set to Maximum), not from this code. Use one source only, or purchases will be counted twice.

**Realistic timeline:** 1–2 days of developer work, then a test order. Launch the sales campaign only after Purchase shows Browser and Server rows with the correct value.

---

## 11. User

EXPORT THE FULL OCNVERSTION TO MD FILE

## 11. Claude

This file.

---

# Appendix: Code files delivered in message 10


## `README.md`

````markdown
# Urban Aana – Meta Pixel + Conversions API

Fixes found in Events Manager testing:

| Problem | Fix |
|---|---|
| No `value`, `currency` or `content_ids` | Every commerce event built via `buildCommerceParams()` |
| Browser only, no Event ID | Server copy via Conversions API, shared `event_id` for deduplication |
| Matching = IP + user agent only | Hashed email, phone, name, city, PIN code, `fbp`/`fbc` on Purchase |
| PageView logged as "Custom event" | Standard `fbq('track','PageView')`, including on SPA route changes |

Assumes Next.js App Router with `@/` path alias. For Pages Router, load `<MetaPixel />` in `_app.tsx`, replace `next/navigation` with `useRouter().events`, and move the route to `pages/api/meta/capi.ts`.

---

## Step 1 – Remove the existing pixel

Events currently show "Setup method: Partner integration", so something else is loading the pixel. Find and remove it, or every event will double count.

```bash
grep -rn "fbq\|4086517521638648\|connect.facebook.net\|react-facebook-pixel\|googletagmanager" \
  --include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.html . | grep -v node_modules
```

Also check:
- Google Tag Manager container: pause any Meta/Facebook Pixel tags.
- Any analytics or commerce plugin with a "Meta Pixel" setting.
- Shopify: if checkout runs on Shopify, set the Facebook & Instagram app's data sharing to **Maximum** and do **not** send Purchase from the storefront code as well. Choose one source for Purchase.

## Step 2 – Create the Conversions API token

Events Manager → pixel 4086517521638648 → **Settings** → Conversions API → **Generate access token**. Copy it once; Meta will not show it again.

## Step 3 – Environment variables

```env
NEXT_PUBLIC_META_PIXEL_ID=4086517521638648
META_CAPI_ACCESS_TOKEN=xxxxxxxx            # secret: server only, never commit
META_GRAPH_API_VERSION=v23.0               # use the current version from Meta's changelog
META_ALLOWED_HOSTS=urbanaana.com,www.urbanaana.com
META_TEST_EVENT_CODE=TESTxxxxx             # ONLY while testing; remove before launch
```

Set these in the hosting dashboard (Vercel → Settings → Environment Variables), not in a committed file.

## Step 4 – Install and add files

```bash
npm i server-only
```

Copy into the project:

```
components/MetaPixel.tsx
lib/meta/shared.ts
lib/meta/pixel.ts
lib/meta/capi.server.ts
lib/meta/purchase.server.ts
app/api/meta/capi/route.ts
```

In `app/layout.tsx`:

```tsx
import MetaPixel from '@/components/MetaPixel';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <MetaPixel />
      </body>
    </html>
  );
}
```

## Step 5 – Wire the events

All prices are numbers in rupees (`1199`), never strings (`"₹1,199"`) or paise. `id` must match the catalogue ID.

**ViewContent – product page (client component)**

```tsx
'use client';
import { useEffect } from 'react';
import { trackCommerceEvent } from '@/lib/meta/pixel';
import { buildCommerceParams } from '@/lib/meta/shared';

export function ProductViewTracker({ sku, price }: { sku: string; price: number }) {
  useEffect(() => {
    try {
      trackCommerceEvent('ViewContent', buildCommerceParams([{ id: sku, quantity: 1, item_price: price }]));
    } catch (err) {
      console.error(err);
    }
  }, [sku, price]);
  return null;
}
```

**AddToCart – after the cart API succeeds**

```ts
const res = await addToCart(variantId, qty);          // existing call
if (res.ok) {
  try {
    trackCommerceEvent('AddToCart', buildCommerceParams([{ id: sku, quantity: qty, item_price: price }]));
  } catch (err) {
    console.error(err);
  }
}
```

**InitiateCheckout – when "Proceed to Checkout" succeeds / checkout page mounts (once)**

```ts
trackCommerceEvent(
  'InitiateCheckout',
  buildCommerceParams(cart.items.map((i) => ({ id: i.sku, quantity: i.qty, item_price: i.price }))),
);
```

Use a `useRef` guard if the checkout page can re-render or remount.

**Order creation API – capture tracking context and store it on the order**

```ts
import { extractTrackingContext } from '@/lib/meta/capi.server';

// inside POST /api/orders
const tracking = extractTrackingContext(req, req.headers.get('referer') ?? undefined);
await db.order.create({ data: { ...orderData, metaTracking: tracking } }); // JSON column
```

Payment webhooks come from the gateway's servers, so the customer's IP, user agent and cookies must be captured here, not later.

**Purchase – server (primary)**

```ts
import { sendPurchaseToMeta } from '@/lib/meta/purchase.server';

// COD: right after the order is confirmed.
// Prepaid: in the verified payment-success webhook.
if (!order.metaPurchaseSentAt) {
  const ok = await sendPurchaseToMeta({
    id: order.id,
    items: order.items.map((i) => ({ id: i.sku, quantity: i.qty, item_price: i.price })),
    total: order.total,
    confirmedAt: order.confirmedAt,
    customer: {
      email: order.email,
      phone: order.phone,
      firstName: order.shipping.firstName,
      lastName: order.shipping.lastName,
      city: order.shipping.city,
      state: order.shipping.state,
      zip: order.shipping.pincode,
      customerId: order.customerId,
    },
    tracking: order.metaTracking,
  });
  if (ok) await db.order.update({ where: { id: order.id }, data: { metaPurchaseSentAt: new Date() } });
}
```

Run it in the background (queue, `after()` from `next/server`, or `waitUntil`) so it never slows the confirmation response.

**Purchase – browser (confirmation page, same event_id)**

```tsx
'use client';
import { useEffect } from 'react';
import { trackPurchaseInBrowser } from '@/lib/meta/pixel';
import { buildCommerceParams } from '@/lib/meta/shared';

export function PurchaseTracker({ order }: { order: { id: string; total: number; items: { sku: string; qty: number; price: number }[] } }) {
  useEffect(() => {
    try {
      trackPurchaseInBrowser(
        order.id,
        buildCommerceParams(
          order.items.map((i) => ({ id: i.sku, quantity: i.qty, item_price: i.price })),
          { value: order.total, orderId: order.id },
        ),
      );
    } catch (err) {
      console.error(err);
    }
  }, [order]);
  return null;
}
```

Render it only after the order is confirmed (status paid / COD confirmed), never on the "Place order" click.

## Step 6 – Test

1. Set `META_TEST_EVENT_CODE` to the code shown in Events Manager → **Test events**, and deploy.
2. Open the site from the Test events tab, then view a product, add to cart, start checkout and place a COD order.
3. Expected for every commerce event:
   - Two rows: **Browser** and **Server**, with the **same Event ID**, marked deduplicated.
   - Expanded details show `value`, `currency: INR`, `content_ids`.
   - Purchase value = order total; refreshing the confirmation page adds nothing.
   - PageView shows as a standard event, not "Custom event".
4. Remove `META_TEST_EVENT_CODE` and redeploy. Leaving it in routes live events to the test view only.
5. After 24–48 hours: Overview → Purchase → **Event Match Quality** should be 6 or higher.

## Step 7 – Compliance

Update the privacy policy to disclose Meta Pixel and Conversions API usage, including that hashed contact details are shared with Meta for ad measurement (DPDP Act, 2023).

````

## `lib/meta/shared.ts`

````ts
/**
 * Shared types and helpers for Meta Pixel + Conversions API.
 * Safe to import from both client and server code (no Node or browser APIs).
 */

export type CommerceEvent = 'ViewContent' | 'AddToCart' | 'InitiateCheckout' | 'Purchase';

export interface ContentItem {
  /** Must match the product ID in your Meta catalogue (SKU or variant ID). */
  id: string;
  quantity: number;
  /** Selling price per unit in rupees, as a number: 999, not "₹999" or 99900 paise. */
  item_price: number;
}

export interface CommerceParams {
  content_ids: string[];
  content_type: 'product';
  contents: ContentItem[];
  value: number;
  currency: 'INR';
  num_items: number;
  order_id?: string;
}

const MAX_ITEMS = 50;
const MAX_VALUE = 1_000_000;
const MAX_ID_LENGTH = 100;

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Deterministic Purchase event ID. Browser and server MUST use the same value for deduplication. */
export function purchaseEventId(orderId: string): string {
  return `purchase_${orderId}`;
}

/**
 * Builds validated event parameters from cart/order items.
 * Throws on bad input so pricing bugs surface in development instead of silently corrupting ad data.
 */
export function buildCommerceParams(
  items: ContentItem[],
  options: { value?: number; orderId?: string } = {},
): CommerceParams {
  if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) {
    throw new Error(`[Meta] items must contain between 1 and ${MAX_ITEMS} entries`);
  }

  for (const item of items) {
    if (typeof item.id !== 'string' || item.id.length === 0 || item.id.length > MAX_ID_LENGTH) {
      throw new Error('[Meta] item.id must be a non-empty string');
    }
    if (!Number.isInteger(item.quantity) || item.quantity < 1) {
      throw new Error(`[Meta] Invalid quantity for ${item.id}`);
    }
    if (!Number.isFinite(item.item_price) || item.item_price < 0) {
      throw new Error(`[Meta] Invalid price for ${item.id}`);
    }
  }

  const computed = items.reduce((sum, i) => sum + i.item_price * i.quantity, 0);
  const value = roundMoney(options.value ?? computed);
  if (!Number.isFinite(value) || value < 0 || value > MAX_VALUE) {
    throw new Error('[Meta] Invalid event value');
  }

  return {
    content_ids: [...new Set(items.map((i) => i.id))],
    content_type: 'product',
    contents: items.map((i) => ({ id: i.id, quantity: i.quantity, item_price: roundMoney(i.item_price) })),
    value,
    currency: 'INR',
    num_items: items.reduce((n, i) => n + i.quantity, 0),
    ...(options.orderId ? { order_id: options.orderId } : {}),
  };
}

/** Runtime validation for params arriving from the browser (never trust client input). */
export function isValidCommerceParams(input: unknown): input is CommerceParams {
  if (!input || typeof input !== 'object') return false;
  const p = input as Record<string, unknown>;

  if (p.currency !== 'INR' || p.content_type !== 'product') return false;
  if (typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value < 0 || p.value > MAX_VALUE) return false;
  if (typeof p.num_items !== 'number' || !Number.isInteger(p.num_items) || p.num_items < 1) return false;

  if (!Array.isArray(p.content_ids) || p.content_ids.length === 0 || p.content_ids.length > MAX_ITEMS) return false;
  if (!p.content_ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= MAX_ID_LENGTH)) {
    return false;
  }

  if (!Array.isArray(p.contents) || p.contents.length === 0 || p.contents.length > MAX_ITEMS) return false;
  return p.contents.every((c) => {
    if (!c || typeof c !== 'object') return false;
    const item = c as Record<string, unknown>;
    return (
      typeof item.id === 'string' &&
      item.id.length > 0 &&
      item.id.length <= MAX_ID_LENGTH &&
      typeof item.quantity === 'number' &&
      Number.isInteger(item.quantity) &&
      item.quantity >= 1 &&
      typeof item.item_price === 'number' &&
      Number.isFinite(item.item_price) &&
      item.item_price >= 0
    );
  });
}

````

## `lib/meta/pixel.ts`

````ts
/**
 * Browser-side Meta Pixel helpers. Import only from client components.
 *
 * - Every event gets an event_id so Meta can deduplicate browser + server copies.
 * - ViewContent / AddToCart / InitiateCheckout are mirrored to /api/meta/capi.
 * - Purchase is sent server-side from the order/payment handler (see purchase.server.ts),
 *   and also fired here on the confirmation page with the SAME event_id.
 */
import { type CommerceEvent, type CommerceParams, purchaseEventId } from './shared';

type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    fbq?: Fbq;
  }
}

const READY_POLL_MS = 100;
const READY_MAX_TRIES = 50; // about 5 seconds

/** Waits briefly for the pixel script to initialise, so early events (e.g. ViewContent on first load) are not lost. */
function withFbq(fn: (fbq: Fbq) => void, tries = 0): void {
  if (typeof window === 'undefined') return;

  if (typeof window.fbq === 'function') {
    try {
      fn(window.fbq);
    } catch (err) {
      console.error('[MetaPixel] Tracking call failed', err);
    }
    return;
  }

  if (tries >= READY_MAX_TRIES) {
    // Usually an ad blocker. The server-side copy still reaches Meta.
    console.warn('[MetaPixel] fbq unavailable; browser event dropped');
    return;
  }
  window.setTimeout(() => withFbq(fn, tries + 1), READY_POLL_MS);
}

function newEventId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;
  return `${prefix}_${random}`;
}

function mirrorToServer(event: CommerceEvent, eventId: string, params: CommerceParams): void {
  try {
    void fetch('/api/meta/capi', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      keepalive: true, // survives page navigation (e.g. add-to-cart then redirect)
      body: JSON.stringify({
        event_name: event,
        event_id: eventId,
        event_source_url: window.location.href,
        custom_data: params,
      }),
    }).catch(() => {
      /* Non-blocking: tracking must never break the shopping flow. */
    });
  } catch {
    /* ignore */
  }
}

/**
 * Track ViewContent, AddToCart or InitiateCheckout.
 * Call AFTER the underlying action succeeds (e.g. after the add-to-cart API returns OK).
 */
export function trackCommerceEvent(
  event: Exclude<CommerceEvent, 'Purchase'>,
  params: CommerceParams,
): void {
  if (typeof window === 'undefined') return;
  const eventId = newEventId(event.toLowerCase());
  withFbq((fbq) => fbq('track', event, params, { eventID: eventId }));
  mirrorToServer(event, eventId, params);
}

/**
 * Fire Purchase in the browser on the order confirmation page.
 * Guarded so refreshes and back-navigation do not double count.
 * The server copy (purchase.server.ts) uses the same event_id, so Meta keeps one.
 */
export function trackPurchaseInBrowser(orderId: string, params: CommerceParams): void {
  if (typeof window === 'undefined' || !orderId) return;

  const storageKey = `ua_meta_purchase_${orderId}`;
  try {
    if (window.localStorage.getItem(storageKey)) return;
  } catch {
    /* Storage blocked: fall back to Meta's event_id deduplication. */
  }

  withFbq((fbq) => {
    fbq('track', 'Purchase', params, { eventID: purchaseEventId(orderId) });
    try {
      window.localStorage.setItem(storageKey, '1');
    } catch {
      /* ignore */
    }
  });
}

````

## `components/MetaPixel.tsx`

````tsx
'use client';

/**
 * Loads the Meta Pixel once and tracks a standard PageView on every client-side route change.
 * Add <MetaPixel /> inside <body> in app/layout.tsx. Remove every other pixel snippet,
 * GTM Meta tag or pixel plugin first, or events will double count.
 */
import Script from 'next/script';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef } from 'react';

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? '';
const IS_VALID_PIXEL_ID = /^\d{10,20}$/.test(PIXEL_ID);

function RouteChangeTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastUrl = useRef<string | null>(null);

  useEffect(() => {
    const url = `${pathname}?${searchParams?.toString() ?? ''}`;
    // First render: PageView is already sent by the init snippet below.
    // Same-URL re-runs (React Strict Mode in dev) are ignored.
    if (lastUrl.current === null || lastUrl.current === url) {
      lastUrl.current = url;
      return;
    }
    lastUrl.current = url;
    try {
      window.fbq?.('track', 'PageView');
    } catch (err) {
      console.error('[MetaPixel] PageView failed', err);
    }
  }, [pathname, searchParams]);

  return null;
}

export default function MetaPixel() {
  if (!IS_VALID_PIXEL_ID) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[MetaPixel] NEXT_PUBLIC_META_PIXEL_ID is missing or invalid; pixel disabled');
    }
    return null;
  }

  return (
    <>
      <Script
        id="meta-pixel"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${PIXEL_ID}');fbq('track','PageView');`,
        }}
      />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: 'none' }}
          alt=""
          src={`https://www.facebook.com/tr?id=${PIXEL_ID}&ev=PageView&noscript=1`}
        />
      </noscript>
      <Suspense fallback={null}>
        <RouteChangeTracker />
      </Suspense>
    </>
  );
}

````

## `lib/meta/capi.server.ts`

````ts
/**
 * Meta Conversions API (server-side). Never import this from client code.
 * Requires: npm i server-only
 */
import 'server-only';
import { createHash } from 'node:crypto';
import type { CommerceEvent, CommerceParams } from './shared';

const PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const ACCESS_TOKEN = process.env.META_CAPI_ACCESS_TOKEN;
/** Set to the current version listed in Meta's Graph API changelog, e.g. "v23.0". */
const GRAPH_VERSION = process.env.META_GRAPH_API_VERSION;
/** Only set while testing in Events Manager > Test events. Remove before going live. */
const TEST_EVENT_CODE = process.env.META_TEST_EVENT_CODE;

const REQUEST_TIMEOUT_MS = 5000;
const MAX_ATTEMPTS = 2;
const MAX_EVENT_AGE_SECONDS = 7 * 24 * 60 * 60; // Meta rejects events older than 7 days

export interface RawUserData {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  state?: string;
  zip?: string;
  externalId?: string;
  clientIp?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
}

export interface ServerEvent {
  event_name: CommerceEvent;
  event_id: string;
  event_time?: number; // unix seconds; defaults to now
  event_source_url: string;
  custom_data: CommerceParams;
  user: RawUserData;
}

export interface TrackingContext {
  clientIp?: string;
  userAgent?: string;
  fbp?: string;
  fbc?: string;
  sourceUrl?: string;
}

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

/* ---------- Normalisation (Meta requires normalise-then-hash) ---------- */

const normalise = {
  email(v: string): string | undefined {
    const s = v.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : undefined;
  },
  /** Indian numbers: returns 91XXXXXXXXXX. */
  phone(v: string): string | undefined {
    let digits = v.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    if (digits.length === 10) return `91${digits}`;
    if (digits.length === 12 && digits.startsWith('91')) return digits;
    return undefined;
  },
  name(v: string): string | undefined {
    const s = v.trim().toLowerCase();
    return s.length > 0 ? s : undefined;
  },
  lettersOnly(v: string): string | undefined {
    const s = v.toLowerCase().replace(/[^a-z]/g, '');
    return s.length > 0 ? s : undefined;
  },
  zip(v: string): string | undefined {
    const digits = v.replace(/\D/g, '');
    return /^\d{6}$/.test(digits) ? digits : undefined;
  },
  externalId(v: string): string | undefined {
    const s = v.trim();
    return s.length > 0 ? s : undefined;
  },
};

function hashed(value: string | undefined, fn: (v: string) => string | undefined): string[] | undefined {
  if (!value) return undefined;
  const n = fn(value);
  return n ? [sha256(n)] : undefined;
}

function buildUserData(u: RawUserData): Record<string, unknown> {
  const data: Record<string, unknown> = {
    em: hashed(u.email, normalise.email),
    ph: hashed(u.phone, normalise.phone),
    fn: hashed(u.firstName, normalise.name),
    ln: hashed(u.lastName, normalise.name),
    ct: hashed(u.city, normalise.lettersOnly),
    st: hashed(u.state, normalise.lettersOnly),
    zp: hashed(u.zip, normalise.zip),
    country: [sha256('in')],
    external_id: hashed(u.externalId, normalise.externalId),
    client_ip_address: u.clientIp,
    client_user_agent: u.userAgent,
    fbp: u.fbp,
    fbc: u.fbc,
  };
  // Strip undefined keys so Meta does not reject the payload.
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

/* ---------- Request context helpers ---------- */

function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const raw = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(raw);
    } catch {
      out[key] = raw;
    }
  }
  return out;
}

/** Uses the _fbc cookie, or builds one from ?fbclid= on the landing URL. */
export function deriveFbc(cookieValue: string | undefined, pageUrl: string | undefined): string | undefined {
  if (cookieValue && /^fb\.\d\.\d+\.\S+$/.test(cookieValue)) return cookieValue;
  if (!pageUrl) return undefined;
  try {
    const fbclid = new URL(pageUrl).searchParams.get('fbclid');
    return fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Extracts IP, user agent and Meta cookies from an incoming request.
 * Call this when the order is CREATED and store the result on the order,
 * because payment webhooks arrive from the gateway's servers, not the customer's browser.
 *
 * x-forwarded-for is trusted here; make sure your host (Vercel, Cloudflare, Nginx) sets it.
 */
export function extractTrackingContext(req: Request, sourceUrl?: string): TrackingContext {
  const h = req.headers;
  const cookies = parseCookies(h.get('cookie'));
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || undefined;
  return {
    clientIp: ip,
    userAgent: h.get('user-agent') ?? undefined,
    fbp: cookies._fbp,
    fbc: deriveFbc(cookies._fbc, sourceUrl),
    sourceUrl,
  };
}

/* ---------- Sender ---------- */

/**
 * Sends events to Meta. Never throws: returns true on success, false otherwise,
 * so tracking failures never break checkout.
 */
export async function sendToMeta(events: ServerEvent[]): Promise<boolean> {
  if (!PIXEL_ID || !ACCESS_TOKEN || !GRAPH_VERSION) {
    console.error('[MetaCAPI] Missing NEXT_PUBLIC_META_PIXEL_ID, META_CAPI_ACCESS_TOKEN or META_GRAPH_API_VERSION');
    return false;
  }
  if (events.length === 0) return true;

  const now = Math.floor(Date.now() / 1000);
  const data = events
    .map((e) => ({
      event_name: e.event_name,
      event_time: e.event_time ?? now,
      event_id: e.event_id,
      event_source_url: e.event_source_url,
      action_source: 'website',
      user_data: buildUserData(e.user),
      custom_data: e.custom_data,
    }))
    .filter((e) => {
      const fresh = now - e.event_time <= MAX_EVENT_AGE_SECONDS;
      if (!fresh) console.warn(`[MetaCAPI] Skipping ${e.event_name} ${e.event_id}: older than 7 days`);
      return fresh;
    });

  if (data.length === 0) return false;

  const body = JSON.stringify({
    data,
    access_token: ACCESS_TOKEN, // in the body, not the URL, so it never lands in access logs
    ...(TEST_EVENT_CODE ? { test_event_code: TEST_EVENT_CODE } : {}),
  });
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${PIXEL_ID}/events`;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
        cache: 'no-store',
      });
      if (res.ok) return true;

      const detail = (await res.text()).slice(0, 500);
      const retryable = res.status >= 500 || res.status === 429;
      if (!retryable) {
        console.error(`[MetaCAPI] Rejected (${res.status}): ${detail}`);
        return false;
      }
      console.warn(`[MetaCAPI] Attempt ${attempt} failed (${res.status}): ${detail}`);
    } catch (err) {
      console.warn(`[MetaCAPI] Attempt ${attempt} network error`, err instanceof Error ? err.message : err);
    } finally {
      clearTimeout(timer);
    }
    if (attempt < MAX_ATTEMPTS) await new Promise((r) => setTimeout(r, 500 * attempt));
  }
  return false;
}

````

## `lib/meta/purchase.server.ts`

````ts
/**
 * Server-side Purchase event. Call from:
 *  - COD: the order-creation handler, once the order is confirmed.
 *  - Prepaid: the payment gateway's success webhook (e.g. Razorpay payment.captured / order.paid),
 *    AFTER verifying the webhook signature.
 *
 * Make it idempotent: gateways retry webhooks. Check a flag such as order.metaPurchaseSentAt
 * before calling, and set it only when this function returns true.
 */
import 'server-only';
import { sendToMeta, type TrackingContext } from './capi.server';
import { buildCommerceParams, purchaseEventId, type ContentItem } from './shared';

const DEFAULT_SOURCE_URL = 'https://urbanaana.com/';

export interface OrderForMeta {
  id: string;
  items: ContentItem[];
  /** Amount the customer actually pays, after discounts. Keep the definition consistent (with or without shipping). */
  total: number;
  confirmedAt?: Date;
  customer: {
    email?: string;
    phone?: string;
    firstName?: string;
    lastName?: string;
    city?: string;
    state?: string;
    zip?: string;
    customerId?: string;
  };
  /** Captured with extractTrackingContext() when the order was created, and stored on the order. */
  tracking?: TrackingContext;
}

export async function sendPurchaseToMeta(order: OrderForMeta): Promise<boolean> {
  if (!order?.id) {
    console.error('[MetaCAPI] sendPurchaseToMeta called without an order id');
    return false;
  }

  let params;
  try {
    params = buildCommerceParams(order.items, { value: order.total, orderId: order.id });
  } catch (err) {
    console.error(`[MetaCAPI] Invalid order ${order.id} for Purchase`, err);
    return false;
  }

  return sendToMeta([
    {
      event_name: 'Purchase',
      event_id: purchaseEventId(order.id), // must match the browser Purchase event_id
      event_time: Math.floor((order.confirmedAt ?? new Date()).getTime() / 1000),
      event_source_url: order.tracking?.sourceUrl ?? DEFAULT_SOURCE_URL,
      custom_data: params,
      user: {
        email: order.customer.email,
        phone: order.customer.phone,
        firstName: order.customer.firstName,
        lastName: order.customer.lastName,
        city: order.customer.city,
        state: order.customer.state,
        zip: order.customer.zip,
        externalId: order.customer.customerId,
        clientIp: order.tracking?.clientIp,
        userAgent: order.tracking?.userAgent,
        fbp: order.tracking?.fbp,
        fbc: order.tracking?.fbc,
      },
    },
  ]);
}

````

## `app/api/meta/capi/route.ts`

````ts
/**
 * POST /api/meta/capi
 * Server mirror for ViewContent, AddToCart and InitiateCheckout.
 * Purchase is deliberately NOT accepted here: it is sent from trusted server code
 * (purchase.server.ts) so nobody can inject fake purchases through this endpoint.
 *
 * Add rate limiting at the edge (Vercel Firewall / Cloudflare), e.g. 60 requests per minute per IP.
 */
import { NextResponse } from 'next/server';
import { extractTrackingContext, sendToMeta } from '@/lib/meta/capi.server';
import { isValidCommerceParams, type CommerceEvent } from '@/lib/meta/shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_EVENTS = new Set<CommerceEvent>(['ViewContent', 'AddToCart', 'InitiateCheckout']);

const ALLOWED_HOSTS = new Set(
  (process.env.META_ALLOWED_HOSTS ?? 'urbanaana.com,www.urbanaana.com')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
    .concat(process.env.NODE_ENV === 'production' ? [] : ['localhost:3000']),
);

const EVENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,120}$/;
const MAX_BODY_BYTES = 16 * 1024;

function hostAllowed(value: string | null): boolean {
  if (!value) return false;
  try {
    return ALLOWED_HOSTS.has(new URL(value).host.toLowerCase());
  } catch {
    return false;
  }
}

export async function POST(req: Request) {
  // Only accept calls from our own storefront.
  if (!hostAllowed(req.headers.get('origin'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const contentLength = Number(req.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await req.json();
    if (!parsed || typeof parsed !== 'object') throw new Error('Body must be an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event_name, event_id, event_source_url, custom_data } = body;

  if (typeof event_name !== 'string' || !ALLOWED_EVENTS.has(event_name as CommerceEvent)) {
    return NextResponse.json({ error: 'Unsupported event' }, { status: 400 });
  }
  if (typeof event_id !== 'string' || !EVENT_ID_PATTERN.test(event_id)) {
    return NextResponse.json({ error: 'Invalid event_id' }, { status: 400 });
  }
  if (typeof event_source_url !== 'string' || !hostAllowed(event_source_url)) {
    return NextResponse.json({ error: 'Invalid event_source_url' }, { status: 400 });
  }
  if (!isValidCommerceParams(custom_data)) {
    return NextResponse.json({ error: 'Invalid custom_data' }, { status: 400 });
  }

  const ctx = extractTrackingContext(req, event_source_url);

  // Optional: if the shopper is logged in, add hashed email/phone here from your session
  // (e.g. user: { ...ctx, email: session.user.email }). This raises Event Match Quality.
  const ok = await sendToMeta([
    {
      event_name: event_name as CommerceEvent,
      event_id,
      event_source_url,
      custom_data,
      user: {
        clientIp: ctx.clientIp,
        userAgent: ctx.userAgent,
        fbp: ctx.fbp,
        fbc: ctx.fbc,
      },
    },
  ]);

  // Always 204/202 to the browser: tracking failures are logged server-side, never surfaced to shoppers.
  return new NextResponse(null, { status: ok ? 204 : 202 });
}

````
