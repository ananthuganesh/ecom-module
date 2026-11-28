# DTDC (Shipsy) Consignment Integration Design

**Date:** 2026-07-26  
**Status:** Approved (replace DTDC; manual create; all four APIs; origin from company/warehouse)

## Decisions

- **Replace** DTDC as the live fulfillment provider.
- Consignments are created **only when admin clicks Create shipment** (no auto-ship on COD/paid).
- v1 actions: **create (softdata)**, **track**, **label PDF**, **cancel**.
- Pickup/origin from **company profile + default warehouse**.

## Settings

Stored under `Setting` key `dtdc_settings`:

- `apiKey`, `customerCode`, `serviceTypeId`, `loadType` (default `NON-DOCUMENT`)
- Masked in admin GET; merge secrets on save

UI: Settings → Shipping (DTDC section) or Integrations → DTDC.

## Order fields

Reuse / extend:

- `awb` / reference number from DTDC
- `courier` = `"DTDC"`
- `shippingStatus` from track events
- `dtdcOrderId` deprecated; store Shipsy ref in `awb` + `transactionDetails.dtdc` or add `dtdcReference` / keep using `awb` as `reference_number`

## Admin order actions

| Action | API |
|--------|-----|
| Create shipment | `POST /api/shipping/dtdc/create/{order_id}` → softdata v2 |
| Refresh tracking | `GET /api/shipping/track/{order_id}` → Shipsy track |
| Download label | `GET /api/shipping/dtdc/label/{order_id}` → PDF stream |
| Cancel | `POST /api/shipping/dtdc/cancel/{order_id}` |

## Softdata mapping

- Destination = order `shippingAddress`
- Origin / return = company profile + default warehouse
- COD = `paymentMethod` cod / `pay_on_delivery` → `cod_amount` = finalPrice
- Invoice from order number / ERP invoice if present
- Weight/dims from shipping package defaults when product dims missing

## Remove from live path

- Calls to `process_full_order_flow` (DTDC) on checkout/pay/webhook — set status to awaiting shipment instead
- Admin retry shipping becomes DTDC create/retry

## Out of scope

- Cross-border intl softdata
- Multi-carrier routing
- Customer self-serve label download
