"use client";

import { useState, useEffect, useMemo } from "react";
import { adminCollectionService } from "@/api";
import { Plus, Grid2X2, Eye, Search, Pencil, Trash2 } from "lucide-react";
import CollectionModal from "@/components/admin/CollectionModal";
import CollectionViewModal from "@/components/admin/CollectionViewModal";
import SafeImage from "@/components/SafeImage";
import { toast } from "sonner";
import {
  AdminListLayout,
  AdminDataTable,
  AdminMetricRow,
  AdminStatusTabs,
  AdminStatusText,
  AdminHeaderButton,
} from "@/components/admin/list";

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function productCount(collection) {
  return Array.isArray(collection?.products) ? collection.products.length : 0;
}

function collectionStatus(collection) {
  const count = productCount(collection);
  if (count <= 0) return { label: "Empty", tone: "neutral" };
  if (!collection?.slug) return { label: "Draft", tone: "warning" };
  return { label: "Active", tone: "success" };
}

function storefrontHref(collection) {
  if (collection?.slug) return `/collections/${collection.slug}`;
  return null;
}

export default function AdminCollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusTab, setStatusTab] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [viewCollection, setViewCollection] = useState(null);
  const [activeId, setActiveId] = useState(null);

  const fetchCollections = async () => {
    try {
      const data = await adminCollectionService.getCollections();
      setCollections(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Error fetching collections:", error);
      toast.error("Failed to load collections");
      setCollections([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCollections();
  }, []);

  const metrics = useMemo(() => {
    const totalProducts = collections.reduce((sum, c) => sum + productCount(c), 0);
    const empty = collections.filter((c) => productCount(c) === 0).length;
    const active = collections.filter((c) => productCount(c) > 0 && c.slug).length;
    const avg = collections.length ? (totalProducts / collections.length).toFixed(1) : "0";
    return {
      collections: collections.length,
      totalProducts,
      empty,
      active,
      avg,
    };
  }, [collections]);

  const filteredCollections = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return collections.filter((c) => {
      const count = productCount(c);
      if (statusTab === "active" && !(count > 0 && c.slug)) return false;
      if (statusTab === "empty" && count > 0) return false;
      if (!q) return true;
      const title = String(c.title || "").toLowerCase();
      const slug = String(c.slug || "").toLowerCase();
      const summary = String(c.summary || "").toLowerCase();
      return title.includes(q) || slug.includes(q) || summary.includes(q);
    });
  }, [collections, statusTab, searchTerm]);

  const handleDelete = async (id, e) => {
    e?.stopPropagation?.();
    if (
      !window.confirm(
        "Are you sure you want to delete this collection? Products won't be deleted."
      )
    ) {
      return;
    }
    try {
      await adminCollectionService.delete(id);
      toast.success("Collection deleted");
      if (activeId === id) setActiveId(null);
      fetchCollections();
    } catch {
      toast.error("Failed to delete collection");
    }
  };

  const handleEdit = (col, e) => {
    e?.stopPropagation?.();
    setSelectedCollection(col);
    setIsModalOpen(true);
  };

  const handleView = (col, e) => {
    e?.stopPropagation?.();
    setViewCollection(col);
    setIsViewOpen(true);
  };

  const handleAddNew = () => {
    setSelectedCollection(null);
    setIsModalOpen(true);
  };

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <>
      <AdminListLayout
        title="Collections"
        actions={
          <AdminHeaderButton variant="primary" onClick={handleAddNew}>
            <Plus className="w-3.5 h-3.5" /> Add collection
          </AdminHeaderButton>
        }
        metrics={
          <AdminMetricRow
            items={[
              {
                value: metrics.collections.toLocaleString(),
                label: "Total collections",
                tone: "violet",
              },
              {
                value: metrics.totalProducts.toLocaleString(),
                label: "Products linked",
                tone: "blue",
              },
              {
                value: metrics.active.toLocaleString(),
                label: "Active collections",
                tone: "emerald",
              },
              {
                value: metrics.avg,
                label: "Avg products / collection",
                tone: "amber",
              },
            ]}
          />
        }
      >
        <AdminDataTable
          toolbar={
            <>
              <AdminStatusTabs
                value={statusTab}
                onChange={setStatusTab}
                tabs={[
                  { value: "all", label: "All" },
                  { value: "active", label: "Active" },
                  { value: "empty", label: "Empty" },
                ]}
              />
              <div className="relative w-full max-w-[220px] shrink-0 ml-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search collections"
                  className="w-full h-8 pl-9 pr-3 rounded-lg border border-border bg-card text-[13px] font-normal text-foreground placeholder-gray-400 focus:outline-none focus:border-border"
                />
              </div>
            </>
          }
          headers={[
            { label: "", className: "w-12" },
            { label: "Collection", className: "w-[220px]" },
            { label: "Status", className: "w-[120px]" },
            { label: "Products", className: "w-[100px]" },
            { label: "Summary", className: "w-[220px]" },
            { label: "Created", className: "w-[120px]" },
            { label: "", className: "w-24" },
          ]}
          empty={
            filteredCollections.length === 0 ? (
              <div className="py-16 text-center">
                <Grid2X2 className="w-8 h-8 text-muted-foreground/40 mx-auto mb-3" />
                <p className="text-[13px] font-medium text-muted-foreground">No collections found</p>
                <button
                  type="button"
                  onClick={handleAddNew}
                  className="mt-4 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Add collection
                </button>
              </div>
            ) : null
          }
        >
          {filteredCollections.map((c) => {
            const count = productCount(c);
            const status = collectionStatus(c);
            const open = activeId === c._id;
            const href = storefrontHref(c);
            const ink = "text-foreground";
            const inkSoft = "text-muted-foreground";
            const wt = "font-[500]";

            return (
              <tr
                key={c._id}
                className={`group transition-colors cursor-pointer ${
                  open ? "!bg-muted" : "bg-card hover:bg-muted"
                }`}
                onClick={() => setActiveId(c._id)}
              >
                <td className="!h-12 px-3 py-0 border-b border-border align-middle">
                  <div className="relative w-7 h-7 rounded bg-muted overflow-hidden border border-border shrink-0">
                    <SafeImage src={c.image} alt={c.title} fill className="object-cover" />
                  </div>
                </td>
                <td className="!h-12 px-3 py-0 border-b border-border align-middle">
                  <span className={`block text-[13px] ${wt} truncate ${ink}`}>{c.title}</span>
                  {c.slug ? (
                    <span className={`block text-[12px] truncate ${inkSoft}`}>/{c.slug}</span>
                  ) : null}
                </td>
                <td className="!h-12 px-3 py-0 border-b border-border align-middle">
                  <AdminStatusText tone={status.tone}>{status.label}</AdminStatusText>
                </td>
                <td className="!h-12 px-3 py-0 border-b border-border align-middle">
                  <span className={`text-[13px] ${wt} ${inkSoft}`}>{count}</span>
                </td>
                <td className="!h-12 px-3 py-0 border-b border-border align-middle">
                  <span className={`block text-[13px] ${wt} truncate ${inkSoft}`}>
                    {c.summary || ""}
                  </span>
                </td>
                <td className="!h-12 px-3 py-0 border-b border-border align-middle">
                  <span className={`text-[13px] ${wt} ${inkSoft}`}>
                    {formatDate(c.createdAt)}
                  </span>
                </td>
                <td
                  className="!h-12 px-3 py-0 border-b border-border align-middle text-right"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="inline-flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={(e) => handleView(c, e)}
                      aria-label="Preview collection"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/[0.04] cursor-pointer"
                      title="Preview"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleEdit(c, e)}
                      aria-label="Edit collection"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/[0.04] cursor-pointer"
                      title="Edit"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    {href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noreferrer"
                        aria-label="View on store"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-black/[0.04] cursor-pointer"
                        title="View on store"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Grid2X2 className="w-3.5 h-3.5" />
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={(e) => handleDelete(c._id, e)}
                      aria-label="Delete collection"
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-red-600 hover:bg-red-50 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </AdminDataTable>
      </AdminListLayout>

      <CollectionModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        collection={selectedCollection}
        onSuccess={fetchCollections}
      />
      <CollectionViewModal
        isOpen={isViewOpen}
        onClose={() => setIsViewOpen(false)}
        collection={viewCollection}
      />
    </>
  );
}
