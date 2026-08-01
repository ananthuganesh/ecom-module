"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { adminErpService } from "@/api";
import { ErpPage, ErpTable } from "@/components/admin/ErpUI";

export default function AuditLogsPage() {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        setRows(await adminErpService.auditLogs());
      } catch {
        toast.error("Failed to load audit logs");
      }
    })();
  }, []);

  return (
    <ErpPage title="Audit logs" subtitle="Recent admin actions across ERP modules">
      <ErpTable
        headers={["When", "Actor", "Action", "Entity", "ID"]}
        rows={rows.map((r) => (
          <tr key={r._id} className="border-b border-border">
            <td className="px-4 py-2 text-[13px] font-medium text-muted-foreground whitespace-nowrap">
              {r.createdAt ? new Date(r.createdAt).toLocaleString() : ""}
            </td>
            <td className="px-4 py-2 text-[13px] font-medium">{r.actorEmail || r.actorId || ""}</td>
            <td className="px-4 py-2 text-[13px] font-medium">{r.action}</td>
            <td className="px-4 py-2 text-[13px] font-medium text-muted-foreground">{r.entityType || ""}</td>
            <td className="px-4 py-2 text-[13px] font-medium text-muted-foreground">{r.entityId?.toString?.().slice(-8) || ""}</td>
          </tr>
        ))}
      />
    </ErpPage>
  );
}
