"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { adminUserService } from "@/api";
import { Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  AdminListLayout,
  AdminHeaderButton,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import CreateCustomerSheet from "@/components/admin/CreateCustomerSheet";
import { adminCustomerHref } from "@/utils/formatCustomerUrl";
import {
  createCustomerColumns,
  customerName,
  customerPhone,
  isCustomer,
} from "./columns";

export default function AdminCustomersPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [rowSelection, setRowSelection] = useState({});
  const [createOpen, setCreateOpen] = useState(false);

  const columns = useMemo(() => createCustomerColumns(), []);

  const fetchCustomers = useCallback(async () => {
    try {
      // Paginate through admin users API (max 200/page) instead of a single unbounded dump.
      const pageSize = 200;
      let page = 1;
      const all = [];
      for (;;) {
        const data = await adminUserService.getUsers({ page, limit: pageSize });
        const batch = Array.isArray(data) ? data : [];
        all.push(...batch.filter(isCustomer));
        if (batch.length < pageSize) break;
        page += 1;
        if (page > 50) break; // hard safety cap
      }
      setCustomers(all);
    } catch (error) {
      console.error("Error fetching customers:", error);
      setCustomers([]);
      toast.error(
        error.response?.status === 401
          ? "Admin login required"
          : "Failed to load customers"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  const filteredCustomers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((customer) => {
      const name = customerName(customer).toLowerCase();
      const email = String(customer.email || "").toLowerCase();
      const phone = customerPhone(customer);
      return (
        name.includes(q) ||
        email.includes(q) ||
        phone.includes(searchTerm.trim())
      );
    });
  }, [customers, searchTerm]);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const selectedCustomers = useMemo(
    () => customers.filter((c) => selectedIds.includes(c._id)),
    [customers, selectedIds]
  );

  const deletableSelected = useMemo(
    () => selectedCustomers.filter((c) => Number(c.ordersCount || 0) === 0),
    [selectedCustomers]
  );

  useEffect(() => {
    const ids = new Set(filteredCustomers.map((c) => c._id));
    setRowSelection((prev) => {
      let changed = false;
      const next = {};
      for (const [key, value] of Object.entries(prev)) {
        if (value && ids.has(key)) next[key] = true;
        else if (value) changed = true;
      }
      return changed || Object.keys(next).length !== Object.keys(prev).length
        ? next
        : prev;
    });
  }, [filteredCustomers]);

  const handleDeleteSelected = async () => {
    if (!selectedIds.length || bulkLoading) return;

    const blocked = selectedCustomers.length - deletableSelected.length;
    if (!deletableSelected.length) {
      toast.error("Customers with orders can’t be deleted.");
      return;
    }

    const n = deletableSelected.length;
    const confirmMsg =
      blocked > 0
        ? `Delete ${n} customer${n === 1 ? "" : "s"} with no orders? ${blocked} with orders will be skipped.`
        : `Delete ${n} customer${n === 1 ? "" : "s"}? This cannot be undone.`;
    if (!window.confirm(confirmMsg)) return;

    setBulkLoading(true);
    try {
      let failed = 0;
      for (const customer of deletableSelected) {
        try {
          await adminUserService.deleteUser(customer._id);
        } catch {
          failed += 1;
        }
      }
      await fetchCustomers();
      setRowSelection({});
      if (failed) {
        toast.error(`Deleted with ${failed} failure${failed === 1 ? "" : "s"}`);
      } else if (blocked > 0) {
        toast.success(
          `Deleted ${n} customer${n === 1 ? "" : "s"}; skipped ${blocked} with orders`
        );
      } else {
        toast.success(`Deleted ${n} customer${n === 1 ? "" : "s"}`);
      }
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <>
      <AdminListLayout
        fill={false}
        title="Customers"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <AdminHeaderButton
              onClick={() => toast("Export coming soon")}
            >
              Export
            </AdminHeaderButton>
            <AdminHeaderButton
              onClick={() => toast("Import coming soon")}
            >
              Import
            </AdminHeaderButton>
            <AdminHeaderButton variant="primary" onClick={() => setCreateOpen(true)}>
              Add customer
            </AdminHeaderButton>
          </div>
        }
      >
        <DataTable
          columns={columns}
          data={filteredCustomers}
          loading={loading}
          getRowId={(row) => row._id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          showSelectionCount={false}
          infiniteScroll
          rowHeightClass="h-8"
          tableClassName="min-w-[1372px]"
          emptyTitle="No customers found"
          emptyDescription="Add a customer to get started."
          pageSize={25}
          onRowClick={(customer) => router.push(adminCustomerHref(customer))}
          toolbar={
            selectedIds.length > 0 ? (
              <>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[13px] font-medium text-foreground">
                    {selectedIds.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => setRowSelection({})}
                    className="text-[13px] font-[550] text-[#005bd3] hover:underline"
                  >
                    Clear
                  </button>
                </div>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  <AdminHeaderButton
                    variant="outline"
                    disabled={bulkLoading || deletableSelected.length === 0}
                    onClick={handleDeleteSelected}
                    title={
                      deletableSelected.length === 0
                        ? "Customers with orders can’t be deleted"
                        : undefined
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                    {deletableSelected.length > 0 &&
                    deletableSelected.length !== selectedIds.length
                      ? ` (${deletableSelected.length})`
                      : ""}
                  </AdminHeaderButton>
                </div>
              </>
            ) : (
              <form
                className="relative min-w-0 flex-1"
                onSubmit={(e) => e.preventDefault()}
              >
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search customers"
                  className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
                />
              </form>
            )
          }
        />
      </AdminListLayout>

      <CreateCustomerSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={(created) => {
          fetchCustomers();
          if (created) router.push(adminCustomerHref(created));
        }}
      />
    </>
  );
}
