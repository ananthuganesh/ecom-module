"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Search, Trash2 } from "lucide-react";
import { adminCollectionService } from "@/api";
import { userErrorMessage } from "@/lib/userMessage";
import { bustStorefrontCatalogCache } from "@/lib/bustStorefrontCatalogCache";
import { Package } from "@/components/admin/LocalIcons";
import {
  AdminHeaderButton,
  AdminListLayout,
  AdminViewMenu,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import { createCollectionColumns } from "./columns";

const VIEWS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "hidden", label: "Hidden" },
];

export default function AdminCollectionsPage() {
  const router = useRouter();
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [rowSelection, setRowSelection] = useState({});
  const [deleting, setDeleting] = useState(false);

  const columns = useMemo(() => createCollectionColumns(), []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminCollectionService.getAll();
      setCollections(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error(userErrorMessage(error, "Couldn’t load collections"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visible = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return collections.filter((c) => {
      if (view === "active" && !c.isActive) return false;
      if (view === "hidden" && c.isActive) return false;
      if (!q) return true;
      return `${c.name} ${c.slug}`.toLowerCase().includes(q);
    });
  }, [collections, view, searchTerm]);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const handleDeleteSelected = async () => {
    const count = selectedIds.length;
    if (
      !window.confirm(
        `Delete ${count} collection${count === 1 ? "" : "s"}? Products stay in your catalog; only the collections and their pages are removed.`
      )
    )
      return;
    setDeleting(true);
    let ok = 0;
    for (const id of selectedIds) {
      try {
        await adminCollectionService.delete(id);
        ok += 1;
      } catch (error) {
        toast.error(userErrorMessage(error, "Couldn’t delete a collection"));
      }
    }
    setDeleting(false);
    setRowSelection({});
    if (ok) {
      toast.success(`${ok} collection${ok === 1 ? "" : "s"} deleted`);
      bustStorefrontCatalogCache();
    }
    load();
  };

  return (
    <AdminListLayout
      fill={false}
      title="Collections"
      icon={Package}
      actions={
        <AdminHeaderButton
          variant="primary"
          onClick={() => router.push("/admin/products/collections/new")}
        >
          <Plus className="h-3.5 w-3.5" /> Create collection
        </AdminHeaderButton>
      }
    >
      <DataTable
        columns={columns}
        data={visible}
        loading={loading}
        getRowId={(row) => row._id}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        onRowClick={(row) => router.push(`/admin/products/collections/${row._id}`)}
        showSelectionCount={false}
        infiniteScroll
        rowHeightClass="h-12"
        emptyTitle="No collections found"
        emptyDescription="Create a collection to group products on the storefront."
        pageSize={50}
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
                  disabled={deleting}
                  onClick={handleDeleteSelected}
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </AdminHeaderButton>
              </div>
            </>
          ) : (
            <>
              <AdminViewMenu value={view} onChange={setView} options={VIEWS} />
              <form
                className="relative min-w-0 flex-1"
                onSubmit={(e) => e.preventDefault()}
              >
                <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search collections"
                  className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
                />
              </form>
            </>
          )
        }
      />
    </AdminListLayout>
  );
}
