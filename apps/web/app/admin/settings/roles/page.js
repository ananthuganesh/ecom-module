"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminErpService, adminUserService } from "@/api";
import { ErpPage, ErpTable } from "@/components/admin/ErpUI";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function RolesPage() {
  const [roles, setRoles] = useState([]);
  const [users, setUsers] = useState([]);

  const load = async () => {
    try {
      const [r, u] = await Promise.all([
        adminErpService.roles.list(),
        adminUserService.getUsers(),
      ]);
      setRoles(r || []);
      setUsers(Array.isArray(u) ? u.filter((x) => x.isAdmin) : []);
    } catch {
      toast.error("Failed to load roles");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const assign = async (userId, roleId) => {
    try {
      await adminErpService.assignRole(userId, roleId || null);
      toast.success("Role assigned");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Assign failed");
    }
  };

  return (
    <ErpPage title="Roles" subtitle="Role-based access templates and staff assignment">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ErpTable
          headers={["Role", "Permissions"]}
          rows={roles.map((r) => (
            <tr key={r._id} className="border-b border-border">
              <td className="px-4 py-2 text-[13px] font-medium">
                {r.name}
                {r.isSystem ? <span className="text-muted-foreground"> · system</span> : null}
              </td>
              <td className="px-4 py-2 text-[13px] font-medium text-muted-foreground">
                {(r.permissions || []).join(", ") || ""}
              </td>
            </tr>
          ))}
        />
        <ErpTable
          headers={["Staff user", "Assign role"]}
          rows={users.map((u) => (
            <tr key={u._id} className="border-b border-border">
              <td className="px-4 py-2 text-[13px] font-medium">{u.name || u.email}</td>
              <td className="px-4 py-2">
                <Select
                  value={u.roleId || "__none__"}
                  onValueChange={(value) => assign(u._id, value === "__none__" ? "" : value)}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="No role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">No role</SelectItem>
                    {roles.map((r) => (
                      <SelectItem key={r._id} value={r._id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </td>
            </tr>
          ))}
          empty="No admin users"
        />
      </div>
    </ErpPage>
  );
}
