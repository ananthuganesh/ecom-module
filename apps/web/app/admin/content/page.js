"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminMediaService } from "@/api";
import { useAdminAuthStore } from "@/store/useAdminAuthStore";
import {
  AdminListLayout,
  AdminHeaderButton,
} from "@/components/admin/list";
import { Folder } from "@/components/admin/LocalIcons";
import { DataTable } from "@/components/ui/data-table";
import { createMediaColumns } from "./columns";
import { mediaFileKey } from "./mediaUtils";

export default function MediaLibrary() {
  const userInfo = useAdminAuthStore((s) => s.userInfo);
  const authed = Boolean(
    userInfo?.authenticated || userInfo?.token || userInfo?._id
  );
  const folder = "all";
  const [searchTerm, setSearchTerm] = useState("");
  const [files, setFiles] = useState([]);
  const [rowSelection, setRowSelection] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [editingAltKey, setEditingAltKey] = useState(null);
  const [altDraft, setAltDraft] = useState("");
  const [savingAltKey, setSavingAltKey] = useState(null);
  const inputRef = useRef(null);

  const selectedIds = useMemo(
    () => Object.keys(rowSelection).filter((id) => rowSelection[id]),
    [rowSelection]
  );

  const loadFiles = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await adminMediaService.list(folder);
      setFiles(Array.isArray(data) ? data : []);
      setRowSelection({});
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not load media files");
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadFiles();
  }, [authed, loadFiles]);

  const filteredFiles = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        (f.name || "").toLowerCase().includes(q) ||
        (f.altText || "").toLowerCase().includes(q) ||
        (f.folder || "").toLowerCase().includes(q)
    );
  }, [files, searchTerm]);

  useEffect(() => {
    const ids = new Set(filteredFiles.map(mediaFileKey));
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
  }, [filteredFiles]);

  const startEditAlt = useCallback((file) => {
    setEditingAltKey(mediaFileKey(file));
    setAltDraft(file.altText || "");
  }, []);

  const cancelEditAlt = useCallback(() => {
    setEditingAltKey(null);
    setAltDraft("");
  }, []);

  const saveAlt = useCallback(
    async (file) => {
      const key = mediaFileKey(file);
      const next = (altDraft || "").trim();
      if (next === (file.altText || "").trim()) {
        cancelEditAlt();
        return;
      }
      setSavingAltKey(key);
      try {
        await adminMediaService.updateAlt({
          folder: file.folder,
          name: file.name,
          altText: next,
        });
        setFiles((prev) =>
          prev.map((f) =>
            mediaFileKey(f) === key ? { ...f, altText: next } : f
          )
        );
        cancelEditAlt();
      } catch (err) {
        toast.error(err.response?.data?.detail || "Could not save alt text");
      } finally {
        setSavingAltKey(null);
      }
    },
    [altDraft, cancelEditAlt]
  );

  const columns = useMemo(
    () =>
      createMediaColumns({
        kind: "image",
        editingAltKey,
        altDraft,
        savingAltKey,
        onStartEditAlt: startEditAlt,
        onAltDraftChange: setAltDraft,
        onSaveAlt: saveAlt,
        onCancelEditAlt: cancelEditAlt,
      }),
    [editingAltKey, altDraft, savingAltKey, startEditAlt, saveAlt, cancelEditAlt]
  );

  const uploadFiles = async (event) => {
    const list = Array.from(event.target.files || []);
    if (!list.length) return;
    const maxBytes = 25 * 1024 * 1024;
    const tooBig = list.find(
      (f) => f.type.startsWith("image/") && f.size > maxBytes
    );
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over 25 MB`);
      event.target.value = "";
      return;
    }
    setIsUploading(true);
    let ok = 0;
    const targetFolder = folder === "ai" ? "ai" : "products";
    try {
      for (const file of list) {
        if (!file.type.startsWith("image/")) {
          toast.error(
            `"${file.name}" skipped — images only (optimised to WebP)`
          );
          continue;
        }
        await adminMediaService.upload(file, targetFolder);
        ok += 1;
      }
      if (ok) {
        toast.success(
          ok === 1
            ? "Uploaded & optimised to WebP"
            : `${ok} files uploaded as WebP`
        );
      }
      await loadFiles();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not upload file(s)");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || bulkLoading) return;
    if (
      !window.confirm(
        `Delete ${selectedIds.length} file${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return;
    }
    setBulkLoading(true);
    try {
      for (const key of selectedIds) {
        const [folderName, ...rest] = key.split("/");
        const name = rest.join("/");
        await adminMediaService.delete({ folder: folderName, name });
      }
      toast.success("Deleted");
      await loadFiles();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not delete file(s)");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <AdminListLayout
      fill={false}
      title="Files"
      icon={Folder}
      actions={
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={uploadFiles}
          />
          <AdminHeaderButton
            variant="primary"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : null}
            {isUploading ? "Uploading…" : "Upload files"}
          </AdminHeaderButton>
        </>
      }
    >
      <DataTable
        columns={columns}
        data={filteredFiles}
        loading={isLoading}
        getRowId={(row) => mediaFileKey(row)}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        showSelectionCount={false}
        showColumnsMenu={false}
        infiniteScroll
        rowHeightClass="h-14"
        emptyTitle="No files found"
        emptyDescription="Upload files to get started."
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
                  disabled={bulkLoading}
                  onClick={deleteSelected}
                >
                  {bulkLoading ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
                  ) : (
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                  )}
                  {bulkLoading ? "Deleting…" : "Delete"}
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
                placeholder="Search files"
                className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
              />
            </form>
          )
        }
      />
    </AdminListLayout>
  );
}
