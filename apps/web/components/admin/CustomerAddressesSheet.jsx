"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Save, Trash2 } from "@/components/icons";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userMessage";
import {
  addressToForm,
  emptyAddressForm,
  formToAddressBody,
  sortAddresses,
  validateAddressForm,
} from "@/lib/customerAddressForm";
import { adminUserService } from "@/api";
import AdminSideSheet from "@/components/admin/AdminSideSheet";
import { AdminStatusText } from "@/components/admin/list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { formatPhone } from "@/utils/formatPhone";

/**
 * Edit a customer's saved addresses from the admin customer page.
 * `initialEditId`: open straight into the form for that address ("new" = add).
 * `onSaved(customer)` receives the refreshed admin customer payload.
 */
export default function CustomerAddressesSheet({
  open,
  onClose,
  customer,
  initialEditId = null,
  onSaved,
}) {
  const customerKey = customer?._id;
  const addresses = useMemo(() => sortAddresses(customer?.addresses), [customer]);
  const [editing, setEditing] = useState(null); // null = list, "new", or address id
  const [form, setForm] = useState(() => emptyAddressForm(customer));
  const [busy, setBusy] = useState("");

  const startEdit = (id) => {
    setEditing(id);
    if (id === "new") {
      setForm({ ...emptyAddressForm(customer), isDefault: addresses.length === 0 });
    } else {
      const addr = addresses.find((a) => a.id === id);
      setForm(addressToForm(addr || {}));
    }
  };

  useEffect(() => {
    if (!open) return;
    if (initialEditId) startEdit(initialEditId);
    else setEditing(null);
    setBusy("");
    // Re-init only when the sheet opens.
  }, [open]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const run = async (key, action, success) => {
    setBusy(key);
    try {
      const updated = await action();
      toast.success(success);
      onSaved?.(updated);
      return true;
    } catch (error) {
      toast.error(userErrorMessage(error, "Couldn’t update that address"));
      return false;
    } finally {
      setBusy("");
    }
  };

  const handleSave = async () => {
    const problem = validateAddressForm(form);
    if (problem) {
      toast.error(problem);
      return;
    }
    const body = formToAddressBody(form);
    const isNew = editing === "new";
    const ok = await run(
      "save",
      () =>
        isNew
          ? adminUserService.addAddress(customerKey, body)
          : adminUserService.updateAddress(customerKey, editing, body),
      isNew ? "Address added" : "Address updated"
    );
    if (ok) setEditing(null);
  };

  const handleDelete = async (addr) => {
    if (!window.confirm("Delete this address? Past orders keep their own copy.")) return;
    await run(
      `delete:${addr.id}`,
      () => adminUserService.deleteAddress(customerKey, addr.id),
      "Address deleted"
    );
  };

  const handleDefault = (addr) =>
    run(
      `default:${addr.id}`,
      () => adminUserService.setDefaultAddress(customerKey, addr.id),
      "Default address updated"
    );

  const inForm = editing !== null;

  return (
    <AdminSideSheet
      open={open}
      onClose={inForm && !initialEditId ? () => setEditing(null) : onClose}
      cancelLabel={inForm && !initialEditId ? "Back" : inForm ? "Cancel" : "Close"}
      footer={
        inForm ? (
          <Button
            type="button"
            size="lg"
            onClick={handleSave}
            disabled={busy === "save"}
            className="h-8 min-w-[120px]"
          >
            {busy === "save" ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
            Save address
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={() => startEdit("new")} className="h-8">
            <Plus className="size-3.5" />
            Add address
          </Button>
        )
      }
    >
      <div className="shrink-0 border-b border-border px-5 py-4">
        <h2 className="text-lg font-medium text-foreground">
          {editing === "new" ? "Add address" : inForm ? "Edit address" : "Addresses"}
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          Saved addresses for {customer?.name || "this customer"}. Changes don’t affect
          orders already placed.
        </p>
      </div>

      {inForm ? (
        <FieldGroup className="space-y-4 px-5 py-4">
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>Name</FieldLabel>
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
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>City</FieldLabel>
              <Input value={form.city} onChange={(e) => setField("city", e.target.value)} />
            </Field>
            <Field>
              <FieldLabel>State</FieldLabel>
              <Input value={form.state} onChange={(e) => setField("state", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field>
              <FieldLabel>PIN code</FieldLabel>
              <Input
                inputMode="numeric"
                value={form.pincode}
                onChange={(e) => setField("pincode", e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </Field>
            <Field>
              <FieldLabel>Label (optional)</FieldLabel>
              <Input
                value={form.label}
                placeholder="Home, Office…"
                maxLength={40}
                onChange={(e) => setField("label", e.target.value)}
              />
            </Field>
          </div>
          <Field orientation="horizontal" className="items-center gap-2">
            <Checkbox
              checked={form.isDefault}
              onCheckedChange={(on) => setField("isDefault", !!on)}
            />
            <FieldLabel className="font-medium text-foreground">Default address</FieldLabel>
          </Field>
        </FieldGroup>
      ) : (
        <div className="flex flex-col gap-3 px-5 py-4">
          {addresses.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">No saved addresses yet.</p>
          ) : null}
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className="rounded-lg border border-border bg-card p-3 text-[13px] leading-5"
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate font-medium text-foreground">
                  {addr.label || addr.name || "Address"}
                </span>
                {addr.isDefault ? <AdminStatusText tone="success">Default</AdminStatusText> : null}
              </div>
              <div className="text-muted-foreground">
                {addr.label && addr.name ? <p>{addr.name}</p> : null}
                <p>{addr.house}</p>
                <p>{[addr.city, addr.state, addr.pincode].filter(Boolean).join(", ")}</p>
                {addr.phone ? <p>{formatPhone(addr.phone)}</p> : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  className="font-medium text-(--p-color-text-link) hover:underline"
                  onClick={() => startEdit(addr.id)}
                >
                  Edit
                </button>
                {!addr.isDefault ? (
                  <button
                    type="button"
                    disabled={!!busy}
                    className="font-medium text-(--p-color-text-link) hover:underline disabled:opacity-50"
                    onClick={() => handleDefault(addr)}
                  >
                    {busy === `default:${addr.id}` ? "Saving…" : "Make default"}
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={!!busy}
                  className="ml-auto inline-flex items-center gap-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  onClick={() => handleDelete(addr)}
                >
                  <Trash2 className="size-3.5" />
                  {busy === `delete:${addr.id}` ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminSideSheet>
  );
}
