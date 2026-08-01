"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { adminUserService } from "@/api";
import { Search } from "lucide-react";
import { toast } from "sonner";
import {
  AdminListLayout,
  AdminHeaderButton,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import CreateCustomerSheet from "@/components/admin/CreateCustomerSheet";
import {
  createCustomerColumns,
  customerName,
  customerPhone,
  isCustomer,
} from "./columns";

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
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
          tableClassName="min-w-[1480px]"
          emptyTitle="No customers found"
          emptyDescription="Add a customer to get started."
          pageSize={25}
          toolbar={
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
          }
        />
      </AdminListLayout>

      <CreateCustomerSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSuccess={() => fetchCustomers()}
      />
    </>
  );
}
