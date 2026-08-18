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
import { Film } from "@/components/admin/LocalIcons";
import { DataTable } from "@/components/ui/data-table";
import { createMediaColumns } from "../columns";
import { mediaFileKey } from "../mediaUtils";

export default function AdminReelsPage() {
  const userInfo = useAdminAuthStore((s) => s.userInfo);
  const authed = Boolean(
    userInfo?.authenticated || userInfo?.token || userInfo?._id
  );
  const folder = "reels";
  const [searchTerm, setSearchTerm] = useState("");
  const [files, setFiles] = useState([]);
  const [rowSelection, setRowSelection] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [editingAltKey, setEditingAltKey] = useState(null);
  const [altDraft, setAltDraft] = useState("");
  const [savingAltKey, setSavingAltKey] = useState(null);
  const [savingVisibleKey, setSavingVisibleKey] = useState(null);
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
      toast.error(err.response?.data?.detail || "Could not load reels");
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
        (f.altText || "").toLowerCase().includes(q)
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

  const toggleVisible = useCallback(async (file, visible) => {
    const key = mediaFileKey(file);
    const prev = file.visible !== false;
    if (prev === visible) return;
    setFiles((rows) =>
      rows.map((f) => (mediaFileKey(f) === key ? { ...f, visible } : f))
    );
    setSavingVisibleKey(key);
    try {
      await adminMediaService.updateVisible({
        folder: file.folder,
        name: file.name,
        visible,
      });
    } catch (err) {
      setFiles((rows) =>
        rows.map((f) =>
          mediaFileKey(f) === key ? { ...f, visible: prev } : f
        )
      );
      toast.error(err.response?.data?.detail || "Could not update visibility");
    } finally {
      setSavingVisibleKey(null);
    }
  }, []);

  const columns = useMemo(
    () =>
      createMediaColumns({
        kind: "video",
        editingAltKey,
        altDraft,
        savingAltKey,
        onStartEditAlt: startEditAlt,
        onAltDraftChange: setAltDraft,
        onSaveAlt: saveAlt,
        onCancelEditAlt: cancelEditAlt,
        showVisibleToggle: true,
        savingVisibleKey,
        onToggleVisible: toggleVisible,
      }),
    [
      editingAltKey,
      altDraft,
      savingAltKey,
      startEditAlt,
      saveAlt,
      cancelEditAlt,
      savingVisibleKey,
      toggleVisible,
    ]
  );

  const uploadFiles = async (event) => {
    const list = Array.from(event.target.files || []);
    if (!list.length) return;
    const maxBytes = 200 * 1024 * 1024;
    const tooBig = list.find((f) => f.size > maxBytes);
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over 200 MB`);
      event.target.value = "";
      return;
    }
    setIsUploading(true);
    let ok = 0;
    const videos = list.filter((file) => {
      const isVideo =
        String(file.type || "").startsWith("video/") ||
        /\.(mp4|mov|webm|avi|mkv)$/i.test(file.name || "");
      if (!isVideo) {
        toast.error(`"${file.name}" skipped — videos only`);
      }
      return isVideo;
    });
    const total = videos.length;
    try {
      for (let i = 0; i < videos.length; i += 1) {
        const file = videos[i];
        const label = file.name || `Video ${i + 1}`;
        const toastId = toast.loading(
          `Uploading ${i + 1}/${total}: ${label} — 0%`
        );
        try {
          await adminMediaService.upload(file, "reels", {
            onUploadProgress: (evt) => {
              if (!evt.total) return;
              const pct = Math.min(
                99,
                Math.round((evt.loaded * 100) / evt.total)
              );
              toast.loading(
                `Uploading ${i + 1}/${total}: ${label} — ${pct}%`,
                { id: toastId }
              );
            },
          });
          ok += 1;
          toast.success(`Uploaded ${i + 1}/${total}: ${label}`, {
            id: toastId,
          });
        } catch (err) {
          toast.error(
            err.response?.data?.detail || `Failed: ${label}`,
            { id: toastId }
          );
        }
      }
      if (ok) await loadFiles();
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const deleteSelected = async () => {
    if (!selectedIds.length || bulkLoading) return;
    if (
      !window.confirm(
        `Delete ${selectedIds.length} reel${selectedIds.length === 1 ? "" : "s"}? This cannot be undone.`
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
      toast.error(err.response?.data?.detail || "Could not delete reel(s)");
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <AdminListLayout
      fill={false}
      title="Reels"
      icon={Film}
      actions={
        <>
          <input
            ref={inputRef}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/x-msvideo,video/*"
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
            {isUploading ? "Uploading…" : "Upload video"}
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
        emptyTitle="No reels found"
        emptyDescription="Upload videos to get started."
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
                placeholder="Search reels"
                className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder-gray-400 focus:border-border focus:outline-none"
              />
            </form>
          )
        }
      />
    </AdminListLayout>
  );
}
