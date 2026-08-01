"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  Upload,
  Search,
  Trash2,
  Loader2,
  Video,
  File as FileIcon,
} from "lucide-react";
import { toast } from "sonner";
import { adminMediaService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";
import {
  AdminListLayout,
  AdminDataTable,
  AdminHeaderButton,
  AdminBulkBar,
  AdminBulkAction,
} from "@/components/admin/list";
import { Checkbox } from "@/components/ui/checkbox";

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let n = bytes / 1024;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i += 1;
  }
  return `${n.toFixed(i === 0 && n >= 10 ? 0 : 1)} ${units[i]}`;
};

const formatRelativeDate = (value) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return "Just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
};

const fileExtLabel = (name = "") => {
  const ext = name.includes(".") ? name.split(".").pop() : "";
  return (ext || "FILE").toUpperCase();
};

const fileKey = (file) => `${file.folder}/${file.name}`;

const cellClass = "!h-14 px-3 py-0 border-b border-border align-middle";

export default function AdminReelsPage() {
  const userInfo = useAuthStore((s) => s.userInfo);
  const authed = Boolean(
    userInfo?.authenticated || userInfo?.token || userInfo?._id
  );
  const folder = "reels";
  const [search, setSearch] = useState("");
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [editingAltKey, setEditingAltKey] = useState(null);
  const [altDraft, setAltDraft] = useState("");
  const [savingAltKey, setSavingAltKey] = useState(null);
  const inputRef = useRef(null);

  const loadFiles = async () => {
    setIsLoading(true);
    try {
      const data = await adminMediaService.list(folder);
      setFiles(Array.isArray(data) ? data : []);
      setSelected(new Set());
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not load reels");
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!authed) return;
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  const visibleFiles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return files;
    return files.filter(
      (f) =>
        (f.name || "").toLowerCase().includes(q) ||
        (f.altText || "").toLowerCase().includes(q)
    );
  }, [files, search]);

  const startEditAlt = (file) => {
    setEditingAltKey(fileKey(file));
    setAltDraft(file.altText || "");
  };

  const cancelEditAlt = () => {
    setEditingAltKey(null);
    setAltDraft("");
  };

  const saveAlt = async (file) => {
    const key = fileKey(file);
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
        prev.map((f) => (fileKey(f) === key ? { ...f, altText: next } : f))
      );
      cancelEditAlt();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not save alt text");
    } finally {
      setSavingAltKey(null);
    }
  };

  const allVisibleSelected =
    visibleFiles.length > 0 &&
    visibleFiles.every((f) => selected.has(fileKey(f)));

  const toggleAll = (checked) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(visibleFiles.map(fileKey)));
  };

  const toggleOne = (file, checked) => {
    const key = fileKey(file);
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const uploadFiles = async (event) => {
    const list = Array.from(event.target.files || []);
    if (!list.length) return;
    const maxBytes = 80 * 1024 * 1024;
    const tooBig = list.find((f) => f.size > maxBytes);
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over 80 MB`);
      event.target.value = "";
      return;
    }
    setIsUploading(true);
    let ok = 0;
    try {
      for (const file of list) {
        const isVideo =
          String(file.type || "").startsWith("video/") ||
          /\.(mp4|mov|webm|avi|mkv)$/i.test(file.name || "");
        if (!isVideo) {
          toast.error(`"${file.name}" skipped — videos only`);
          continue;
        }
        await adminMediaService.upload(file, "reels");
        ok += 1;
      }
      if (ok) {
        toast.success(ok === 1 ? "Video uploaded" : `${ok} videos uploaded`);
      }
      await loadFiles();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not upload video(s)");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const deleteSelected = async () => {
    const keys = [...selected];
    if (!keys.length) return;
    if (
      !window.confirm(
        `Delete ${keys.length} reel${keys.length === 1 ? "" : "s"}? This cannot be undone.`
      )
    ) {
      return;
    }
    try {
      for (const key of keys) {
        const [folderName, ...rest] = key.split("/");
        const name = rest.join("/");
        await adminMediaService.delete({ folder: folderName, name });
      }
      toast.success("Deleted");
      await loadFiles();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not delete reel(s)");
    }
  };

  return (
    <>
      <AdminListLayout
        title="Reels"
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
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Upload className="h-3.5 w-3.5" />
              )}
              {isUploading ? "Uploading…" : "Upload video"}
            </AdminHeaderButton>
          </>
        }
      >
        <AdminDataTable
          toolbar={
            <div className="relative w-full max-w-[240px] shrink-0">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search reels"
                className="h-8 w-full rounded-lg border border-border bg-card pr-3 pl-9 text-[13px] font-normal text-foreground placeholder:text-muted-foreground focus:border-border focus:outline-none"
              />
            </div>
          }
          headers={[
            {
              label: (
                <Checkbox
                  checked={allVisibleSelected}
                  onCheckedChange={toggleAll}
                  aria-label="Select all"
                  className="data-checked:border-[#303030] data-checked:bg-[#303030]"
                />
              ),
              className: "w-12",
            },
            { label: "File", className: "min-w-[220px]" },
            { label: "Alt text", className: "w-[32%]" },
            { label: "Date added", className: "w-[140px]" },
            { label: "Size", className: "w-[100px]" },
          ]}
          empty={
            !isLoading && visibleFiles.length === 0 ? (
              <div className="py-16 text-center">
                <Folder className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
                <p className="text-[13px] font-medium text-muted-foreground">
                  No reels found
                </p>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="mt-4 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3.5 text-[13px] font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <Upload className="h-3.5 w-3.5" /> Upload video
                </button>
              </div>
            ) : null
          }
        >
          {isLoading ? (
            <tr>
              <td colSpan={5} className="px-4 py-16 text-center">
                <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
              </td>
            </tr>
          ) : (
            visibleFiles.map((file) => {
              const key = fileKey(file);
              const checked = selected.has(key);
              const displayName =
                file.name?.replace(/\.[^.]+$/, "") || file.name || "Untitled";

              return (
                <tr
                  key={key}
                  className={`group transition-colors ${
                    checked ? "!bg-muted" : "bg-card hover:bg-muted"
                  }`}
                >
                  <td className={cellClass}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(value) =>
                        toggleOne(file, Boolean(value))
                      }
                      aria-label={`Select ${file.name}`}
                      className="data-checked:border-[#303030] data-checked:bg-[#303030]"
                    />
                  </td>
                  <td className={cellClass}>
                    <a
                      href={file.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex min-w-0 items-center gap-3"
                    >
                      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
                        {file.type === "video" ? (
                          <video
                            src={file.url}
                            className="h-full w-full object-cover"
                            muted
                            playsInline
                            preload="metadata"
                          />
                        ) : (
                          <FileIcon className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-[500] text-foreground group-hover:underline">
                          {displayName}
                        </p>
                        <p className="mt-0.5 text-[12px] text-muted-foreground">
                          {fileExtLabel(file.name)}
                        </p>
                      </div>
                    </a>
                  </td>
                  <td className={cellClass}>
                    {editingAltKey === key ? (
                      <div className="flex items-center gap-1.5">
                        <input
                          autoFocus
                          type="text"
                          value={altDraft}
                          maxLength={500}
                          onChange={(e) => setAltDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              saveAlt(file);
                            }
                            if (e.key === "Escape") cancelEditAlt();
                          }}
                          onBlur={() => saveAlt(file)}
                          disabled={savingAltKey === key}
                          placeholder="Add alt text"
                          className="h-8 w-full rounded-md border border-input px-2 text-[13px] font-medium text-foreground focus:border-primary focus:outline-none"
                        />
                        {savingAltKey === key ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => startEditAlt(file)}
                        className={`-mx-1.5 w-full cursor-pointer truncate rounded-md px-1.5 py-1 text-left text-[13px] font-medium hover:bg-black/[0.04] ${
                          file.altText
                            ? "text-foreground"
                            : "text-muted-foreground/60"
                        }`}
                        title={file.altText || "Add alt text"}
                      >
                        {file.altText || "Add alt text"}
                      </button>
                    )}
                  </td>
                  <td className={cellClass}>
                    <span className="text-[13px] font-[500] text-muted-foreground">
                      {formatRelativeDate(file.modifiedAt)}
                    </span>
                  </td>
                  <td className={cellClass}>
                    <span className="text-[13px] font-[500] text-muted-foreground">
                      {formatSize(file.size)}
                    </span>
                  </td>
                </tr>
              );
            })
          )}
        </AdminDataTable>

        <p className="mt-3 flex items-center gap-1.5 px-1 text-[12px] font-medium text-muted-foreground">
          <Video className="h-3 w-3" />
          {files.length} reel{files.length === 1 ? "" : "s"}
          {" · "}Max 80 MB · MP4 / MOV / WebM
        </p>
      </AdminListLayout>

      <AdminBulkBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
      >
        <AdminBulkAction onClick={deleteSelected}>
          <Trash2 className="mr-1.5 h-3.5 w-3.5" />
          Delete
        </AdminBulkAction>
      </AdminBulkBar>
    </>
  );
}
