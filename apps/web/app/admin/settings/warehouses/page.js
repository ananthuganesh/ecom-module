"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { adminWarehouseService } from "@/api";

const empty = {
  name: "",
  code: "",
  city: "",
  stateCode: "",
  isDefault: false,
  isActive: true,
};

export default function WarehousesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState(empty);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await adminWarehouseService.getAll());
    } catch (e) {
      toast.error("Failed to load warehouses");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    try {
      if (creating) {
        await adminWarehouseService.create(draft);
        toast.success("Warehouse created");
      } else {
        await adminWarehouseService.update(editingId, draft);
        toast.success("Warehouse updated");
      }
      setCreating(false);
      setEditingId(null);
      setDraft(empty);
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Save failed");
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this warehouse?")) return;
    try {
      await adminWarehouseService.delete(id);
      toast.success("Deleted");
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Delete failed");
    }
  };

  const input =
    "h-8 px-3 border border-border rounded-[6px] text-[13px] font-medium w-full focus:outline-none";

  return (
    <div className="w-full">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Warehouses</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Locations for multi-warehouse stock</p>
        </div>
        {!creating && !editingId ? (
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setDraft(empty);
            }}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-[6px] bg-primary text-primary-foreground text-[13px] font-medium cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add warehouse
          </button>
        ) : null}
      </div>

      {(creating || editingId) && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4 text-card-foreground space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input className={input} placeholder="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input className={input} placeholder="Code" value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value.toUpperCase() })} />
            <input className={input} placeholder="City" value={draft.city} onChange={(e) => setDraft({ ...draft, city: e.target.value })} />
            <input className={input} placeholder="State code" value={draft.stateCode} onChange={(e) => setDraft({ ...draft, stateCode: e.target.value })} />
          </div>
          <div className="flex items-center gap-4 text-[13px] font-medium">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={draft.isDefault} onChange={(e) => setDraft({ ...draft, isDefault: e.target.checked })} />
              Default
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
              Active
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={save} className="h-8 px-3.5 rounded-[6px] bg-primary text-primary-foreground text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer">
              <Save className="w-3.5 h-3.5" /> Save
            </button>
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                setEditingId(null);
              }}
              className="h-8 px-3.5 rounded-[6px] border border-border text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
        {loading ? (
          <div className="py-16 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">Name</th>
                <th className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">Code</th>
                <th className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">City</th>
                <th className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">Flags</th>
                <th className="px-4 py-2.5 w-24" />
              </tr>
            </thead>
            <tbody>
              {rows.map((w) => (
                <tr key={w._id} className="border-b border-border">
                  <td className="px-4 py-2.5 text-[13px] font-medium">{w.name}</td>
                  <td className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">{w.code}</td>
                  <td className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">{w.city || ""}</td>
                  <td className="px-4 py-2.5 text-[13px] font-medium text-muted-foreground">
                    {[w.isDefault ? "Default" : null, w.isActive === false ? "Inactive" : null].filter(Boolean).join(" · ") || ""}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      className="p-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
                      onClick={() => {
                        setEditingId(w._id);
                        setCreating(false);
                        setDraft({
                          name: w.name || "",
                          code: w.code || "",
                          city: w.city || "",
                          stateCode: w.stateCode || "",
                          isDefault: !!w.isDefault,
                          isActive: w.isActive !== false,
                        });
                      }}
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button type="button" className="p-1.5 text-muted-foreground hover:text-red-600 cursor-pointer" onClick={() => remove(w._id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
