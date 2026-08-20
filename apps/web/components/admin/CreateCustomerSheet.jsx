"use client";

import { useState, useEffect } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userMessage";
import { adminUserService } from "@/api";
import AdminSideSheet from "@/components/admin/AdminSideSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

const emptyForm = () => ({
  name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  pincode: "",
  emailSubscribed: true,
  whatsappSubscribed: true,
});

export default function CreateCustomerSheet({ open, onClose, onSuccess }) {
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(emptyForm());
  }, [open]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (!/^\d{10}$/.test(form.phone.trim())) {
      toast.error("Enter a valid 10-digit phone number");
      return;
    }
    setSaving(true);
    try {
      const created = await adminUserService.createCustomer({
        name,
        phone: form.phone.trim(),
        email: form.email.trim() || undefined,
        address: form.address.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        emailSubscribed: form.emailSubscribed,
        whatsappSubscribed: form.whatsappSubscribed,
      });
      toast.success("Customer created");
      onSuccess?.(created);
      onClose?.();
    } catch (error) {
      toast.error(userErrorMessage(error, "Couldn’t create that customer"));
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
          onClick={handleSubmit}
          disabled={saving}
          className="h-8 min-w-[140px]"
        >
          {saving ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
          Create customer
        </Button>
      }
    >
      <div className="shrink-0 border-b border-border px-5 py-4">
        <h2 className="text-lg font-medium text-foreground">Add customer</h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Customers are created here, then assigned on orders.
        </p>
      </div>

      <FieldGroup className="space-y-4 px-5 py-4">
        <Field>
          <FieldLabel>Name</FieldLabel>
          <Input
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>Phone</FieldLabel>
          <Input
            type="tel"
            value={form.phone}
            onChange={(e) =>
              setField("phone", e.target.value.replace(/\D/g, "").slice(0, 10))
            }
            placeholder="10-digit mobile"
          />
        </Field>
        <Field>
          <FieldLabel>Email (optional)</FieldLabel>
          <Input
            type="email"
            value={form.email}
            onChange={(e) => setField("email", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>Address (optional)</FieldLabel>
          <Textarea
            rows={3}
            value={form.address}
            onChange={(e) => setField("address", e.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel>City</FieldLabel>
          <Input
            value={form.city}
            onChange={(e) => setField("city", e.target.value)}
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel>State</FieldLabel>
            <Input
              value={form.state}
              onChange={(e) => setField("state", e.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel>Postal code</FieldLabel>
            <Input
              value={form.pincode}
              onChange={(e) =>
                setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))
              }
            />
          </Field>
        </div>
        <Field orientation="horizontal" className="items-center gap-2">
          <Checkbox
            checked={form.emailSubscribed && form.whatsappSubscribed}
            onCheckedChange={(on) => {
              setForm((prev) => ({
                ...prev,
                emailSubscribed: !!on,
                whatsappSubscribed: !!on,
              }));
            }}
          />
          <FieldLabel className="font-medium text-foreground">Subscribed</FieldLabel>
        </Field>
      </FieldGroup>
    </AdminSideSheet>
  );
}
