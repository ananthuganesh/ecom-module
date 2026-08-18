"use client";

import { useEffect, useState } from "react";
import { Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { adminErpService } from "@/api";
import AdminTopSheet from "@/components/admin/AdminTopSheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Field,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const emptyForm = () => ({
  name: "",
  email: "",
  password: "",
  roleId: "",
});

export default function UsersSettingsPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);

  const staff = users;
  const adminCount = staff.filter((u) => u.isAdmin).length;

  const roleLabel = (roleId) =>
    roles.find((r) => r._id === roleId)?.name || null;

  const canChangeRole = (user) => !(user.isAdmin && adminCount <= 1);

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        adminErpService.listStaffUsers(),
        adminErpService.roles.list().catch(() => []),
      ]);
      setUsers(Array.isArray(u) ? u : []);
      setRoles(
        (Array.isArray(r) ? r : []).filter((role) =>
          ["Admin", "Staff"].includes(role?.name)
        )
      );
    } catch (err) {
      console.error(err);
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (createOpen) setForm(emptyForm());
  }, [createOpen]);

  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const assign = async (userId, roleId) => {
    try {
      await adminErpService.assignRole(userId, roleId || null);
      toast.success("Role assigned");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Assign failed");
    }
  };

  const handleCreate = async () => {
    const name = form.name.trim();
    const email = form.email.trim().toLowerCase();
    if (!name) {
      toast.error("Name is required");
      return;
    }
    if (!email || !email.includes("@")) {
      toast.error("Valid email is required");
      return;
    }
    if (form.password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!form.roleId) {
      toast.error("Role is required");
      return;
    }
    setSaving(true);
    try {
      await adminErpService.createStaffUser({
        name,
        email,
        password: form.password,
        roleId: form.roleId,
      });
      toast.success("User created");
      setCreateOpen(false);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to create user");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
            Users
          </h1>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-[6px] bg-primary px-3.5 text-[13px] font-medium text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Add user
        </button>
      </div>

      <div className="admin-surface overflow-hidden rounded-xl bg-card text-card-foreground">
        {loading ? (
          <div className="flex justify-center py-16">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">
                  User
                </th>
                <th className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">
                  Role
                </th>
              </tr>
            </thead>
            <tbody>
              {staff.map((user) => (
                <tr key={user._id} className="border-b border-border hover:bg-muted/80">
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-medium text-foreground">
                      {(user.name || "User").toUpperCase()}
                    </div>
                    <div className="mt-0.5 text-[12px] text-muted-foreground">
                      {user.email}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {canChangeRole(user) ? (
                      <Select
                        value={
                          roles.some((r) => r._id === user.roleId)
                            ? user.roleId
                            : undefined
                        }
                        onValueChange={(value) => assign(user._id, value)}
                      >
                        <SelectTrigger className="h-8 w-40">
                          <SelectValue placeholder="Select role">
                            {roleLabel(user.roleId) || "Select role"}
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => (
                            <SelectItem key={r._id} value={String(r._id)}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="inline-flex h-8 items-center text-[13px] font-medium text-foreground">
                        {roleLabel(user.roleId) || "Admin"}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {staff.length === 0 ? (
                <tr>
                  <td
                    colSpan={2}
                    className="px-4 py-12 text-center text-[13px] text-muted-foreground"
                  >
                    No staff users yet.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>

      <AdminTopSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        footer={
          <Button
            type="button"
            size="lg"
            onClick={handleCreate}
            disabled={saving}
            className="h-8 min-w-[140px]"
          >
            {saving ? <Spinner className="size-3.5" /> : <Save className="size-3.5" />}
            Create user
          </Button>
        }
      >
        <div className="border-b border-border px-5 py-4">
          <h2 className="text-lg font-medium text-foreground">Add user</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Create an Admin or Staff account.
          </p>
        </div>

        <FieldGroup className="grid gap-4 px-5 py-4 sm:grid-cols-2">
          <Field>
            <FieldLabel>Name</FieldLabel>
            <Input
              value={form.name}
              onChange={(e) => setField("name", e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field>
            <FieldLabel>Email</FieldLabel>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setField("email", e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field>
            <FieldLabel>Password</FieldLabel>
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              autoComplete="new-password"
              placeholder="At least 8 characters"
            />
          </Field>
          <Field>
            <FieldLabel>Role</FieldLabel>
            <Select
              value={form.roleId || undefined}
              onValueChange={(value) => setField("roleId", value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r._id} value={r._id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </FieldGroup>
      </AdminTopSheet>
    </div>
  );
}
