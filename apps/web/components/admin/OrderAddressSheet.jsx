"use client";

import { useEffect, useState } from "react";
import { Save } from "@/components/icons";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userMessage";
import { formToAddressBody } from "@/lib/customerAddressForm";
import {
  orderAddressToForm,
  sameState,
  validateOrderAddressForm,
} from "@/lib/orderAddressEdit";
import { adminOrderService } from "@/api";
import AdminSideSheet from "@/components/admin/AdminSideSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

/** Staff edit of an order's delivery address (before the courier is booked). */
export default function OrderAddressSheet({ open, onClose, order, onSaved }) {
  const original = order?.shippingAddress || {};
  const [form, setForm] = useState(() => orderAddressToForm(original));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(orderAddressToForm(order?.shippingAddress || {}));
    // Reset only when the sheet opens.
  }, [open]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));
  const stateMoves = !sameState(original.state, form.state);

  const handleSave = async () => {
    const problem = validateOrderAddressForm(form);
    if (problem) {
      toast.error(problem);
      return;
    }
    setSaving(true);
    try {
      const updated = await adminOrderService.updateShippingAddress(
        order._id,
        formToAddressBody(form)
      );
      const result = updated?.addressResult || {};
      if (!result.changed) toast.message("Address is unchanged");
      else if (result.invoiceUpdated) toast.success("Address updated · invoice GST switched to the new state");
      else toast.success("Address updated");
      onSaved?.(updated);
      onClose?.();
    } catch (error) {
      toast.error(userErrorMessage(error, "Couldn’t update the address"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminSideSheet
      open={open}
      onClose={onClose}
      footer={
        <Button
          type="button"
          size="lg"
          onClick={handleSave}
          disabled={saving}
          className="h-8 min-w-[120px]"
        >
          {saving ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
          Save address
        </Button>
      }
    >
      <div className="shrink-0 border-b border-border px-5 py-4">
        <h2 className="text-lg font-medium text-foreground">Edit shipping address</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Only this order changes; the customer’s saved addresses stay as they are. The
          delivery fee already paid isn’t changed.
        </p>
      </div>

      <FieldGroup className="space-y-4 px-5 py-4">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>Recipient</FieldLabel>
            <Input value={form.name} onChange={(e) => setField("name", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>Phone</FieldLabel>
            <Input
              type="tel"
              value={form.phone}
              placeholder="10-digit mobile"
              onChange={(e) => setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))}
            />
          </Field>
        </div>
        <Field>
          <FieldLabel>Address</FieldLabel>
          <Textarea
            rows={3}
            value={form.house}
            placeholder="House / flat, street, area"
            onChange={(e) => setField("house", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          <Field>
            <FieldLabel>City</FieldLabel>
            <Input value={form.city} onChange={(e) => setField("city", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>State</FieldLabel>
            <Input value={form.state} onChange={(e) => setField("state", e.target.value)} />
          </Field>
          <Field>
            <FieldLabel>PIN code</FieldLabel>
            <Input
              inputMode="numeric"
              value={form.pincode}
              onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
            />
          </Field>
        </div>
        {stateMoves ? (
          <p className="rounded-md border border-(--p-color-border-caution) bg-(--p-color-bg-surface-caution) px-3 py-2 text-[12px] leading-5 text-(--p-color-text)">
            Moving from {original.state || "the old state"} to {form.state}. The order’s GST
            invoice keeps its number but switches between CGST + SGST and IGST. Check with
            your accountant if that month’s GST return is already filed.
          </p>
        ) : null}
      </FieldGroup>
    </AdminSideSheet>
  );
}
