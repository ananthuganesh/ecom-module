"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { adminProductService, adminCategoryService } from "@/api";
import { ChevronDown, Download, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { userErrorMessage } from "@/lib/userMessage";
import { Package } from "@/components/admin/LocalIcons";
import {
  AdminListLayout,
  AdminMetricRow,
  AdminViewMenu,
  AdminHeaderButton,
} from "@/components/admin/list";
import { DataTable } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { adminProductHref } from "@/utils/formatProductUrl";
import { downloadCsv, rowsToCsv } from "@/utils/downloadCsv";
import { bustStorefrontCatalogCache } from "@/lib/bustStorefrontCatalogCache";
import {
  createProductColumns,
  productStatus,
  resolveCategoryName,
} from "./columns";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "draft", label: "Draft" },
];

export default function AdminProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [rowSelection, setRowSelection] = useState({});
  const [bulkLoading, setBulkLoading] = useState(false);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const selectedProducts = useMemo(
    () => products.filter((p) => selectedIds.includes(p._id)),
    [products, selectedIds]
  );

  const fetchProducts = useCallback(async () => {
    try {
      const data = await adminProductService.getAllProducts();
      setProducts(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching admin products:", error);
      setProducts([]);
      toast.error(
        error.response?.status === 401
          ? "Admin login required"
          : "Failed to load products"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
    adminCategoryService
      .getAll()
      .then((data) => setCategories(Array.isArray(data) ? data : []))
      .catch(() => setCategories([]));
  }, [fetchProducts]);

  const handleAddProduct = useCallback(() => {
    router.push("/admin/products/new");
  }, [router]);

  useEffect(() => {
    if (searchParams.get("new") !== "1") return;
    router.replace("/admin/products/new");
  }, [searchParams, router]);

  const metrics = useMemo(() => {
    const volume = products.reduce(
      (sum, p) => sum + Number(p.totalStock ?? p.countInStock ?? 0),
      0
    );
    const value = products.reduce((sum, p) => {
      const stock = Number(p.totalStock ?? p.countInStock ?? 0);
      const price = Number(
        p.pricing?.sellingPrice ?? p.price ?? 0
      );
      return sum + stock * price;
    }, 0);
    const active = products.filter((p) => productStatus(p) === "active").length;
    const turnover = products.length ? (active / products.length) * 10 : 0;
    return {
      volume,
      value,
      turnover: turnover.toFixed(2),
      products: products.length,
    };
  }, [products]);

  const filteredProducts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return products.filter((p) => {
      const status = productStatus(p);
      if (statusTab === "active" && status !== "active") return false;
      if (statusTab === "draft" && status !== "draft") return false;
      if (
        statusTab === "archived" &&
        status !== "archived" &&
        status !== "out_of_stock"
      ) {
        return false;
      }
      if (!q) return true;
      const name = String(p.productName || p.name || "").toLowerCase();
      const categoryName = resolveCategoryName(categories, p.category).toLowerCase();
      const typeName = resolveCategoryName(
        categories,
        p.type || p.subcategory
      ).toLowerCase();
      const sku = String(p.variants?.[0]?.sku || p.sku || "").toLowerCase();
      return (
        name.includes(q) ||
        categoryName.includes(q) ||
        typeName.includes(q) ||
        sku.includes(q)
      );
    });
  }, [products, statusTab, searchTerm, categories]);

  useEffect(() => {
    const ids = new Set(filteredProducts.map((p) => p._id));
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
  }, [filteredProducts]);

  const columns = useMemo(
    () => createProductColumns({ categories }),
    [categories]
  );

  const handleExportSelected = () => {
    if (!selectedProducts.length) {
      toast.error("No rows to export");
      return;
    }
    const headers = [
      "Title",
      "Status",
      "Category",
      "Type",
      "SKU",
      "Price",
      "Stock",
      "Slug",
    ];
    const rows = selectedProducts.map((p) => ({
      Title: p.productName || p.name || "",
      Status: productStatus(p),
      Category: resolveCategoryName(categories, p.category),
      Type: resolveCategoryName(categories, p.type || p.subcategory),
      SKU: p.variants?.[0]?.sku || p.sku || "",
      Price: Number(
        p.pricing?.sellingPrice ?? p.price ?? 0
      ).toFixed(2),
      Stock: Number(p.totalStock ?? p.countInStock ?? 0),
      Slug: p.slug || "",
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`products-${stamp}.csv`, rowsToCsv(headers, rows));
    toast.success(
      `Exported ${rows.length} product${rows.length === 1 ? "" : "s"}`
    );
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length || bulkLoading) return;
    const n = selectedIds.length;
    if (
      !window.confirm(
        `Delete ${n} product${n === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return;
    }
    setBulkLoading(true);
    try {
      let failed = 0;
      for (const id of selectedIds) {
        try {
          await adminProductService.delete(id);
        } catch {
          failed += 1;
        }
      }
      await fetchProducts();
      setRowSelection({});
      await bustStorefrontCatalogCache();
      if (failed) {
        toast.error(`Deleted with ${failed} failure${failed === 1 ? "" : "s"}`);
      } else {
        toast.success(`Deleted ${n} product${n === 1 ? "" : "s"}`);
      }
    } finally {
      setBulkLoading(false);
    }
  };

  const handleStatusUpdate = async (status) => {
    if (!selectedIds.length || bulkLoading) return;
    setBulkLoading(true);
    try {
      await adminProductService.bulkUpdate({
        ids: selectedIds,
        updates: { status },
      });
      await fetchProducts();
      setRowSelection({});
      await bustStorefrontCatalogCache();
      const label =
        STATUS_OPTIONS.find((o) => o.value === status)?.label || status;
      toast.success(`Updated status to ${label}`);
    } catch (err) {
      toast.error(userErrorMessage(err, "Couldn’t update product status"));
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <>
      <AdminListLayout
        fill={false}
        title="Products"
        icon={Package}
        actions={
          <AdminHeaderButton variant="primary" onClick={handleAddProduct}>
            Add product
          </AdminHeaderButton>
        }
        metrics={
          <AdminMetricRow
            items={[
              {
                value: metrics.volume.toLocaleString("en-IN"),
                label: "Total inventory volume",
                detail: "Units currently on hand",
                hint: "Sum of stock across all products",
              },
              {
                value:
                  metrics.value >= 1000000
                    ? `₹${(metrics.value / 1000000).toFixed(1)}M`
                    : `₹${metrics.value.toLocaleString("en-IN")}`,
                label: "Inventory value",
                detail: "At selling price",
                hint: "Stock × selling price",
              },
              {
                value: metrics.turnover,
                label: "Inventory turnover",
                detail: "Active product ratio",
                hint: "Based on active vs total products",
              },
              {
                value: metrics.products.toLocaleString("en-IN"),
                label: "Total products",
                detail: "Products in catalogue",
                hint: "Includes draft and archived",
              },
            ]}
          />
        }
      >
        <DataTable
          columns={columns}
          data={filteredProducts}
          loading={loading}
          getRowId={(row) => row._id}
          rowSelection={rowSelection}
          onRowSelectionChange={setRowSelection}
          onRowClick={(product) => router.push(adminProductHref(product))}
          showSelectionCount={false}
          infiniteScroll
          rowHeightClass="h-12"
          emptyTitle="No products found"
          emptyDescription="Add a product to get started."
          pageSize={25}
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
                    disabled={bulkLoading}
                    onClick={handleExportSelected}
                  >
                    <Download className="w-3.5 h-3.5" /> Export
                  </AdminHeaderButton>
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      disabled={bulkLoading}
                      render={
                        <Button
                          type="button"
                          variant="secondary"
                          size="lg"
                          disabled={bulkLoading}
                          className="h-8 min-h-8 gap-1.5 rounded-lg border-transparent bg-[#e3e3e3] px-3 text-[0.8125rem] font-[550] leading-5 text-[#303030] shadow-none hover:bg-[#d4d4d4] active:bg-[#ccc] aria-expanded:bg-[#d4d4d4]"
                        />
                      }
                    >
                      Status
                      <ChevronDown className="size-3.5 opacity-70" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[10rem]">
                      {STATUS_OPTIONS.map((opt) => (
                        <DropdownMenuItem
                          key={opt.value}
                          className="text-[0.8125rem]"
                          disabled={bulkLoading}
                          onClick={() => handleStatusUpdate(opt.value)}
                        >
                          {opt.label}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <AdminHeaderButton
                    variant="outline"
                    disabled={bulkLoading}
                    onClick={handleDeleteSelected}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </AdminHeaderButton>
                </div>
              </>
            ) : (
              <>
                <AdminViewMenu
                  value={statusTab}
                  onChange={setStatusTab}
                  options={[
                    { value: "all", label: "All" },
                    { value: "active", label: "Active" },
                    { value: "draft", label: "Draft" },
                    { value: "archived", label: "Archived" },
                  ]}
                />
                <form
                  className="relative min-w-0 flex-1"
                  onSubmit={(e) => e.preventDefault()}
                >
                  <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search and filter"
                    className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
                  />
                </form>
              </>
            )
          }
        />
      </AdminListLayout>
    </>
  );
}
