"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Plus, Search, Trash2, X } from "lucide-react";
import { adminCollectionService, adminProductService } from "@/api";
import { userErrorMessage } from "@/lib/userMessage";
import { bustStorefrontCatalogCache } from "@/lib/bustStorefrontCatalogCache";
import {
  collectionSlug,
  pickableProducts,
  productDisplayName,
} from "@/lib/collectionForm";
import { adminProductHref } from "@/utils/formatProductUrl";
import { Package } from "@/components/admin/LocalIcons";
import { AdminHeaderButton, AdminStatusText } from "@/components/admin/list";
import AdminSideSheet from "@/components/admin/AdminSideSheet";
import ProductSeoCard from "@/components/admin/ProductSeoCard";
import SafeImage from "@/components/SafeImage";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/ui/data-table";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { createMemberColumns } from "../columns";

const EMPTY_FORM = {
  name: "",
  slug: "",
  description: "",
  isActive: true,
  metaTitle: "",
  metaDescription: "",
};

const ACTIVE_PILL =
  "bg-[#95FFB9] text-[#004D41] hover:bg-[#95FFB9] [&_svg]:text-[#004D41] [&_svg]:opacity-100";

/** Admin product rows → the summary shape the collection API returns. */
function toMember(product) {
  return {
    _id: product._id,
    productUrlId: product.productUrlId,
    name: productDisplayName(product),
    image: product.thumbnails?.[0] || product.variants?.[0]?.images?.[0] || null,
    status: product.status,
    price: product.pricing?.sellingPrice ?? product.price ?? null,
  };
}

export default function AdminCollectionEditPage() {
  const { id } = useParams();
  const router = useRouter();
  const isNew = id === "new";

  const [form, setForm] = useState(EMPTY_FORM);
  const [savedForm, setSavedForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [rowSelection, setRowSelection] = useState({});

  const [catalog, setCatalog] = useState(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQuery, setPickerQuery] = useState("");
  const [picked, setPicked] = useState(() => new Set());
  const [adding, setAdding] = useState(false);

  const columns = useMemo(() => createMemberColumns(), []);

  useEffect(() => {
    if (isNew) return;
    let cancelled = false;
    // After "Create" the same page instance moves from /new to /<id>.
    setLoading(true);
    adminCollectionService
      .getById(id)
      .then((data) => {
        if (cancelled) return;
        const loaded = {
          name: data.name || "",
          slug: data.slug || "",
          description: data.description || "",
          isActive: data.isActive !== false,
          metaTitle: data.metaTitle || "",
          metaDescription: data.metaDescription || "",
        };
        setForm(loaded);
        setSavedForm(loaded);
        setSlugTouched(true);
        setMembers(data.products || []);
      })
      .catch((error) => {
        if (cancelled) return;
        toast.error(userErrorMessage(error, "Couldn’t load this collection"));
        router.replace("/admin/products/collections");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id, isNew, router]);

  useEffect(() => {
    if (!pickerOpen || catalog) return;
    adminProductService
      .getAllProducts()
      .then((rows) => setCatalog(Array.isArray(rows) ? rows : []))
      .catch((error) => {
        toast.error(userErrorMessage(error, "Couldn’t load products"));
        setCatalog([]);
      });
  }, [pickerOpen, catalog]);

  const memberIds = useMemo(() => members.map((m) => m._id), [members]);
  const pickerResults = useMemo(
    () =>
      pickableProducts(catalog || [], {
        query: pickerQuery,
        excludeIds: memberIds,
        limit: 200,
      }),
    [catalog, pickerQuery, memberIds]
  );
  const visibleMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    return q ? members.filter((m) => String(m.name || "").toLowerCase().includes(q)) : members;
  }, [members, memberSearch]);
  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((key) => rowSelection[key]),
    [rowSelection]
  );

  const slugPreview = collectionSlug(form.slug || form.name);
  const dirty = isNew || JSON.stringify(form) !== JSON.stringify(savedForm);

  const updateForm = ({ slugManual, ...patch }) => {
    if (slugManual) setSlugTouched(true);
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const handleNameChange = (name) => {
    updateForm(slugTouched ? { name } : { name, slug: collectionSlug(name) });
  };

  const openPicker = () => {
    setPicked(new Set());
    setPickerQuery("");
    setPickerOpen(true);
  };

  const togglePicked = (productId) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });

  const handleAddPicked = async () => {
    const ids = [...picked];
    if (!ids.length) return;
    if (isNew) {
      const chosen = (catalog || []).filter((p) => picked.has(p._id)).map(toMember);
      setMembers((prev) => [...prev, ...chosen]);
      setPickerOpen(false);
      return;
    }
    setAdding(true);
    try {
      const data = await adminCollectionService.addProducts(id, ids);
      setMembers(data.products || []);
      toast.success(`${ids.length} product${ids.length === 1 ? "" : "s"} added`);
      bustStorefrontCatalogCache();
      setPickerOpen(false);
    } catch (error) {
      toast.error(userErrorMessage(error, "Couldn’t add products"));
    } finally {
      setAdding(false);
    }
  };

  const handleRemoveSelected = async () => {
    const ids = selectedIds;
    if (!ids.length) return;
    if (isNew) {
      setMembers((prev) => prev.filter((m) => !ids.includes(m._id)));
      setRowSelection({});
      return;
    }
    setRemoving(true);
    try {
      const data = await adminCollectionService.removeProducts(id, ids);
      setMembers(data.products || []);
      setRowSelection({});
      toast.success(`${ids.length} product${ids.length === 1 ? "" : "s"} removed`);
      bustStorefrontCatalogCache();
    } catch (error) {
      toast.error(userErrorMessage(error, "Couldn’t remove products"));
    } finally {
      setRemoving(false);
    }
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error("Give the collection a name.");
      return;
    }
    setSaving(true);
    try {
      const payload = { ...form, slug: slugPreview };
      if (isNew) {
        const created = await adminCollectionService.create(payload);
        if (memberIds.length) {
          try {
            await adminCollectionService.addProducts(created._id, memberIds);
          } catch (error) {
            // The collection exists now — open it rather than retrying a duplicate create.
            toast.error(
              userErrorMessage(error, "Collection created, but the products weren’t added. Add them again.")
            );
            router.replace(`/admin/products/collections/${created._id}`);
            return;
          }
        }
        toast.success("Collection created");
        bustStorefrontCatalogCache();
        router.replace(`/admin/products/collections/${created._id}`);
        return;
      }
      const saved = await adminCollectionService.update(id, payload);
      const next = { ...form, slug: saved.slug };
      setForm(next);
      setSavedForm(next);
      toast.success("Collection saved");
      bustStorefrontCatalogCache();
    } catch (error) {
      toast.error(userErrorMessage(error, "Couldn’t save the collection"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Delete “${form.name}”? Its products stay in your catalog; only the collection and its page are removed.`
      )
    )
      return;
    try {
      await adminCollectionService.delete(id);
      toast.success("Collection deleted");
      bustStorefrontCatalogCache();
      router.replace("/admin/products/collections");
    } catch (error) {
      toast.error(userErrorMessage(error, "Couldn’t delete the collection"));
    }
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-20">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      <main className="admin-product-form mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 bg-background md:gap-6">
        <header className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-2">
            <Link
              href="/admin/products/collections"
              className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[#4a4a4a] hover:bg-black/[0.06]"
              aria-label="Back to collections"
            >
              <ArrowLeft className="size-4" />
            </Link>
            <Package active className="size-[18px] shrink-0 text-[#303030]" />
            <h2 className="admin-page-title m-0 truncate text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
              {isNew ? form.name || "Create collection" : form.name || "Untitled collection"}
            </h2>
            {!isNew ? (
              savedForm.isActive ? (
                <AdminStatusText tone="success" className={ACTIVE_PILL}>
                  Active
                </AdminStatusText>
              ) : (
                <AdminStatusText tone="neutral">Hidden</AdminStatusText>
              )
            ) : null}
            {!isNew && dirty ? (
              <span className="text-xs font-medium text-muted-foreground">Unsaved</span>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!isNew && savedForm.isActive && savedForm.slug ? (
              <AdminHeaderButton
                onClick={() => window.open(`/collections/${savedForm.slug}`, "_blank", "noopener")}
              >
                <ExternalLink className="h-3.5 w-3.5" /> View
              </AdminHeaderButton>
            ) : null}
            {!isNew ? (
              <AdminHeaderButton onClick={handleDelete} disabled={saving}>
                <Trash2 className="h-3.5 w-3.5" /> Delete
              </AdminHeaderButton>
            ) : null}
            <AdminHeaderButton
              variant="primary"
              onClick={handleSave}
              disabled={saving || !dirty}
            >
              {saving ? <Spinner className="size-3.5" /> : null}
              {isNew ? "Create" : "Save"}
            </AdminHeaderButton>
          </div>
        </header>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-4">
            <Card className="@container/card">
              <CardContent className="flex flex-col gap-4">
                <Field>
                  <FieldLabel htmlFor="collection-name">Title</FieldLabel>
                  <Input
                    id="collection-name"
                    value={form.name}
                    onChange={(e) => handleNameChange(e.target.value)}
                    placeholder="e.g. Kerala Prints"
                    autoFocus={isNew}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="collection-description">Description</FieldLabel>
                  <Textarea
                    id="collection-description"
                    value={form.description}
                    onChange={(e) => updateForm({ description: e.target.value })}
                    placeholder="Shown under the title on the collection page."
                    rows={4}
                  />
                </Field>
              </CardContent>
            </Card>

            <Card className="@container/card gap-0 pb-0">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <CardTitle>Products</CardTitle>
                <AdminHeaderButton variant="outline" onClick={openPicker}>
                  <Plus className="h-3.5 w-3.5" /> Add products
                </AdminHeaderButton>
              </CardHeader>
              <CardContent className="px-0">
                <DataTable
                  columns={columns}
                  data={visibleMembers}
                  getRowId={(row) => row._id}
                  rowSelection={rowSelection}
                  onRowSelectionChange={setRowSelection}
                  onRowClick={
                    isNew ? undefined : (row) => router.push(adminProductHref(row))
                  }
                  showSelectionCount={false}
                  showColumnsMenu={false}
                  infiniteScroll
                  rowHeightClass="h-12"
                  pageSize={50}
                  emptyTitle={memberSearch ? "No matching products" : "No products yet"}
                  emptyDescription={
                    memberSearch
                      ? "Try a different search."
                      : "Use “Add products” to put products in this collection."
                  }
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
                        <div className="ml-auto flex items-center gap-2">
                          <AdminHeaderButton
                            variant="outline"
                            disabled={removing}
                            onClick={handleRemoveSelected}
                          >
                            {removing ? (
                              <Spinner className="size-3.5" />
                            ) : (
                              <X className="h-3.5 w-3.5" />
                            )}
                            Remove from collection
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
                          value={memberSearch}
                          onChange={(e) => setMemberSearch(e.target.value)}
                          placeholder={`Search ${members.length} product${members.length === 1 ? "" : "s"}`}
                          className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
                        />
                      </form>
                    )
                  }
                />
              </CardContent>
            </Card>

            <ProductSeoCard
              form={form}
              updateForm={updateForm}
              pathPrefix="collections"
              breadcrumbSection="collections"
            />
          </div>

          <aside className="flex flex-col gap-4">
            <Card className="@container/card">
              <CardHeader>
                <CardTitle>Visibility</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <label className="flex cursor-pointer items-center justify-between gap-3 text-[13px] font-medium text-foreground">
                  Show on storefront
                  <Switch
                    checked={form.isActive}
                    onCheckedChange={(isActive) => updateForm({ isActive })}
                  />
                </label>
                <p className="text-[12px] leading-5 text-muted-foreground">
                  Hidden collections keep their products, but their page shows “not found”.
                </p>
              </CardContent>
            </Card>
          </aside>
        </div>
      </main>

      <AdminSideSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        footer={
          <Button
            type="button"
            size="lg"
            onClick={handleAddPicked}
            disabled={adding || picked.size === 0}
            className="h-8 min-w-[140px]"
          >
            {adding ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
            {picked.size ? `Add ${picked.size} product${picked.size === 1 ? "" : "s"}` : "Add products"}
          </Button>
        }
      >
        <div className="admin-product-form shrink-0 border-b border-border px-5 py-4">
          <h2 className="text-lg font-medium text-foreground">Add products</h2>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            Pick products to add to {form.name || "this collection"}.
          </p>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={pickerQuery}
              onChange={(e) => setPickerQuery(e.target.value)}
              placeholder="Search products"
              className="h-9 rounded-lg border-[#c9cccf] bg-white pl-9"
              autoFocus
            />
          </div>
        </div>
        <div className="flex flex-col">
          {catalog === null ? (
            <div className="flex justify-center py-10">
              <Spinner />
            </div>
          ) : pickerResults.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted-foreground">
              {pickerQuery
                ? "No matching products."
                : "Every product is already in this collection."}
            </p>
          ) : (
            pickerResults.map((product) => {
              const member = toMember(product);
              const checked = picked.has(product._id);
              return (
                <label
                  key={product._id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border px-5 py-2.5 hover:bg-muted"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => togglePicked(product._id)}
                    aria-label={`Select ${member.name}`}
                  />
                  <div className="relative size-9 shrink-0 overflow-hidden rounded border border-border bg-muted">
                    {member.image ? (
                      <SafeImage
                        src={member.image}
                        alt={member.name}
                        fill
                        className="object-cover"
                        sizes="36px"
                      />
                    ) : null}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {member.name || "Untitled product"}
                    </span>
                    <span className="text-[12px] text-muted-foreground">
                      {member.status === "draft" ? "Draft · " : ""}
                      {member.price != null
                        ? `₹${Number(member.price).toLocaleString("en-IN")}`
                        : ""}
                    </span>
                  </div>
                </label>
              );
            })
          )}
        </div>
      </AdminSideSheet>
    </>
  );
}
