"use client";

import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { AdminStatusText } from "@/components/admin/list";
import DateTimePicker from "@/components/admin/DateTimePicker";
import { parseLocalValue } from "@/lib/dateTimeValue";
import { percentOff, saleStatus } from "@/lib/saleSchedule";

const STATUS_COPY = {
  live: { label: "Live", tone: "success" },
  scheduled: { label: "Scheduled", tone: "info" },
  ended: { label: "Ended", tone: "neutral" },
};

const EMPTY_SALE = { price: "", startsAt: "", endsAt: "" };

const inr = (n) => `₹${Number(n).toLocaleString("en-IN")}`;

/**
 * Scheduled sale price. The API swaps it in at the start time and restores the
 * regular price at the end time; the storefront shows a "Sale" badge meanwhile.
 */
export default function ProductSaleCard({ form, updateForm, savedSale }) {
  const sale = { ...EMPTY_SALE, ...form.sale };
  const setSale = (patch) => updateForm({ sale: { ...sale, ...patch } });

  const salePrice = Number(sale.price) || 0;
  const regular = Number(form.pricing?.sellingPrice) || 0;
  const mrp = Number(form.pricing?.mrp) || 0;
  const offMrp = percentOff(mrp, salePrice);
  const offRegular = percentOff(regular, salePrice);
  const notLower = salePrice > 0 && regular > 0 && salePrice >= regular;
  const badEnd =
    sale.startsAt && sale.endsAt && new Date(sale.endsAt) <= new Date(sale.startsAt);
  const status = STATUS_COPY[saleStatus(savedSale)];

  return (
    <Card className="@container/card">
      <CardHeader>
        <CardTitle>Sale</CardTitle>
        {status ? (
          <CardAction>
            <AdminStatusText tone={status.tone} dot>
              {status.label}
            </AdminStatusText>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 @md/card:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_minmax(0,1fr)]">
          <Field>
            <FieldLabel>Sale price</FieldLabel>
            <div className="relative">
              <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[13px] text-[#616161]">
                ₹
              </span>
              <Input
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={sale.price}
                onChange={(e) => setSale({ price: e.target.value.replace(/[^\d.]/g, "") })}
                placeholder="0.00"
                className="pl-6"
              />
            </div>
          </Field>
          <Field>
            <FieldLabel>Starts</FieldLabel>
            <DateTimePicker
              value={sale.startsAt}
              onChange={(startsAt) => setSale({ startsAt })}
              placeholder="As soon as you save"
              ariaLabel="Sale starts"
            />
          </Field>
          <Field>
            <FieldLabel>Ends</FieldLabel>
            <DateTimePicker
              value={sale.endsAt}
              onChange={(endsAt) => setSale({ endsAt })}
              placeholder="No end date"
              minDate={parseLocalValue(sale.startsAt)?.date}
              align="end"
              ariaLabel="Sale ends"
            />
          </Field>
        </div>

        {salePrice > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] leading-5">
            {notLower ? (
              <p className="font-medium text-[#8e1f0b]">
                Sale price must be below the regular price ({inr(regular)}), or it won’t start.
              </p>
            ) : badEnd ? (
              <p className="font-medium text-[#8e1f0b]">The end must be after the start.</p>
            ) : (
              <p className="text-[#616161]">
                Shows as{" "}
                <span className="font-semibold text-[#303030]">
                  {inr(salePrice)}
                  {offMrp ? ` · ${offMrp}% off` : ""}
                </span>
                {mrp > 0 ? ` (MRP ${inr(mrp)})` : ""}
                {offRegular ? ` — ${offRegular}% below the regular ${inr(regular)}` : ""}.{" "}
                {sale.startsAt ? "" : "Starts as soon as you save. "}
                {sale.endsAt ? "" : "Runs until you remove it."}
              </p>
            )}
            <button
              type="button"
              onClick={() => updateForm({ sale: { ...EMPTY_SALE } })}
              className="text-[12px] font-[550] text-[#005bd3] hover:underline"
            >
              Remove sale
            </button>
          </div>
        ) : (
          <p className="text-[12px] leading-5 text-[#616161]">
            Set a sale price and dates. It goes live on time, shows a “Sale” badge and
            countdown, and the price returns to {regular ? inr(regular) : "the regular price"} on
            its own.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
