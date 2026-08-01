"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { adminErpService, adminUserService } from "@/api";

export default function UsersSettingsPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState({});

  const roleMap = useMemo(() => {
    const map = {};
    for (const r of roles) map[r._id] = r.name;
    return map;
  }, [roles]);

  const staff = useMemo(
    () => users.filter((u) => u.isAdmin || u.roleId),
    [users]
  );

  const load = async () => {
    setLoading(true);
    try {
      const [u, r] = await Promise.all([
        adminUserService.getUsers(),
        adminErpService.roles.list().catch(() => []),
      ]);
      setUsers(Array.isArray(u) ? u : []);
      setRoles(Array.isArray(r) ? r : []);
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

  const allSelected = staff.length > 0 && staff.every((u) => selected[u._id]);
  const toggleAll = () => {
    if (allSelected) {
      setSelected({});
      return;
    }
    const next = {};
    for (const u of staff) next[u._id] = true;
    setSelected(next);
  };

  const roleLabel = (user) => {
    if (user.roleId && roleMap[user.roleId]) return roleMap[user.roleId];
    if (user.isAdmin) return "Store owner";
    return "Staff";
  };

  return (
    <div className="w-full">
      <div className="mb-6">
        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Users</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">People who can sign in and manage this store</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="size-4 accent-primary"
                    aria-label="Select all users"
                  />
                </th>
                <th className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">User</th>
                <th className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">Role</th>
              </tr>
            </thead>
            <tbody>
              {staff.map((user) => (
                  <tr key={user._id} className="border-b border-border hover:bg-muted/80">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={!!selected[user._id]}
                        onChange={() =>
                          setSelected((prev) => ({ ...prev, [user._id]: !prev[user._id] }))
                        }
                        aria-label={`Select ${user.name || user.email}`}
                        className="size-4 accent-primary"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[13px] font-medium text-foreground">
                        {(user.name || "User").toUpperCase()}
                      </div>
                      <div className="text-[12px] text-muted-foreground mt-0.5">{user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-[13px] font-medium text-muted-foreground">{roleLabel(user)}</td>
                  </tr>
              ))}
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-12 text-center text-[13px] text-muted-foreground">
                    No staff users yet. Assign a role under Settings → Roles.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
