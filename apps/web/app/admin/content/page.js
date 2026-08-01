"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Folder,
  Upload,
  Search,
  Trash2,
  Columns3,
  ChevronDown,
  Loader2,
  ImageIcon,
  Video,
  File as FileIcon,
} from "lucide-react";
import { toast } from "sonner";
import { adminMediaService } from "@/api";
import { useAuthStore } from "@/store/useAuthStore";

const formatSize = (bytes) => {
  if (!Number.isFinite(bytes)) return "";
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
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
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

export default function MediaLibrary() {
  const token = useAuthStore((s) => s.userInfo?.token);
  const [folder, setFolder] = useState("products");
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
      toast.error(err.response?.data?.detail || "Could not load media files");
      setFiles([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, folder]);

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
    visibleFiles.length > 0 && visibleFiles.every((f) => selected.has(fileKey(f)));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(visibleFiles.map(fileKey)));
  };

  const toggleOne = (file) => {
    const key = fileKey(file);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const uploadFiles = async (event) => {
    const list = Array.from(event.target.files || []);
    if (!list.length) return;
    const maxBytes = 10 * 1024 * 1024;
    const tooBig = list.find((f) => f.type.startsWith("image/") && f.size > maxBytes);
    if (tooBig) {
      toast.error(`"${tooBig.name}" is over 10 MB`);
      event.target.value = "";
      return;
    }
    setIsUploading(true);
    let ok = 0;
    try {
      for (const file of list) {
        if (!file.type.startsWith("image/")) {
          toast.error(`"${file.name}" skipped — images only (optimized to WebP)`);
          continue;
        }
        await adminMediaService.upload(file);
        ok += 1;
      }
      if (ok) toast.success(ok === 1 ? "Uploaded & optimized to WebP" : `${ok} files uploaded as WebP`);
      await loadFiles();
    } catch (err) {
      toast.error(err.response?.data?.detail || "Could not upload file(s)");
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const deleteSelected = async () => {
    const keys = [...selected];
    if (!keys.length) return;
    if (!window.confirm(`Delete ${keys.length} file${keys.length === 1 ? "" : "s"}? This cannot be undone.`)) {
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
      toast.error(err.response?.data?.detail || "Could not delete file(s)");
    }
  };

  return (
    <div className="w-full max-w-[1100px]">
      {/* Header card */}
      <div className="bg-card border border-border rounded-xl shadow-[0_1px_2px_rgba(16,24,40,0.04)] overflow-hidden">
        <div className="px-4 py-3.5 flex flex-wrap items-center justify-between gap-3 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
              <Folder className="w-4 h-4" />
            </div>
            <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">Files</h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              className="hidden"
              onChange={uploadFiles}
            />
            <button
              type="button"
              onClick={() => toast("Upload from URL coming soon")}
              className="h-8 px-3 rounded-lg border border-border bg-card text-[13px] font-medium text-foreground hover:bg-muted cursor-pointer"
            >
              Upload from URL
            </button>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={isUploading}
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 disabled:opacity-60 cursor-pointer inline-flex items-center gap-1.5"
              title="Max 10 MB · converted to WebP"
            >
              {isUploading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Upload className="w-3.5 h-3.5" />
              )}
              {isUploading ? "Uploading…" : "Upload files"}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="px-3 py-2.5 flex flex-wrap items-center gap-2 border-b border-border">
          <label className="relative inline-flex items-center">
            <select
              value={folder}
              onChange={(e) => setFolder(e.target.value)}
              className="appearance-none h-8 pl-3 pr-8 rounded-lg border border-border bg-card text-[13px] font-medium text-foreground cursor-pointer hover:bg-muted focus:outline-none"
            >
              <option value="all">All</option>
              <option value="products">Products</option>
              <option value="ai">AI</option>
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 w-3.5 h-3.5 text-muted-foreground" />
          </label>

          <div className="relative flex-1 min-w-[180px] max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search and filter"
              className="w-full h-8 pl-8 pr-3 rounded-lg border border-border text-[13px] font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-input"
            />
          </div>

          <div className="ml-auto flex items-center gap-1">
            {selected.size > 0 ? (
              <button
                type="button"
                onClick={deleteSelected}
                className="h-8 px-2.5 rounded-lg text-red-600 hover:bg-red-50 text-[13px] font-medium inline-flex items-center gap-1.5 cursor-pointer"
                title="Delete selected"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete ({selected.size})
              </button>
            ) : null}
            <button
              type="button"
              className="h-8 w-8 rounded-lg border border-transparent hover:bg-muted text-muted-foreground inline-flex items-center justify-center cursor-pointer"
              title="Columns"
              aria-label="Columns"
            >
              <Columns3 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead>
              <tr className="border-b border-border bg-muted">
                <th className="w-10 px-3 py-2.5">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="size-4 cursor-pointer accent-primary"
                    aria-label="Select all"
                  />
                </th>
                <th className="px-2 py-2.5 text-[12px] font-medium text-muted-foreground">File name</th>
                <th className="px-3 py-2.5 text-[12px] font-medium text-muted-foreground w-[18%]">Alt text</th>
                <th className="px-3 py-2.5 text-[12px] font-medium text-muted-foreground w-[16%]">
                  <span className="inline-flex items-center gap-1">
                    Date added
                    <span className="text-muted-foreground">↓</span>
                  </span>
                </th>
                <th className="px-3 py-2.5 text-[12px] font-medium text-muted-foreground w-[12%]">Size</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <Loader2 className="w-5 h-5 animate-spin text-muted-foreground mx-auto" />
                  </td>
                </tr>
              ) : visibleFiles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center">
                    <div className="inline-flex flex-col items-center gap-2 text-muted-foreground">
                      <Folder className="w-8 h-8 text-muted-foreground/40" />
                      <p className="text-[13px] font-medium">No files found</p>
                      <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        className="text-[13px] font-medium text-foreground underline cursor-pointer"
                      >
                        Upload files
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleFiles.map((file) => {
                  const key = fileKey(file);
                  const checked = selected.has(key);
                  return (
                    <tr
                      key={key}
                      className={`border-b border-border hover:bg-muted/80 ${
                        checked ? "bg-sky-50/40" : ""
                      }`}
                    >
                      <td className="px-3 py-2.5 align-middle">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(file)}
                          className="size-4 cursor-pointer accent-primary"
                          aria-label={`Select ${file.name}`}
                        />
                      </td>
                      <td className="px-2 py-2.5 align-middle">
                        <a
                          href={file.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-3 min-w-0 group"
                        >
                          <div className="w-10 h-10 rounded-md border border-border bg-muted overflow-hidden shrink-0 flex items-center justify-center">
                            {file.type === "image" ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={file.url}
                                alt={file.altText || ""}
                                className="w-full h-full object-cover"
                              />
                            ) : file.type === "video" ? (
                              <Video className="w-4 h-4 text-muted-foreground" />
                            ) : (
                              <FileIcon className="w-4 h-4 text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-medium text-foreground truncate group-hover:underline">
                              {file.name?.replace(/\.[^.]+$/, "") || file.name}
                            </p>
                            <p className="text-[12px] font-medium text-muted-foreground mt-0.5">
                              {fileExtLabel(file.name)}
                            </p>
                          </div>
                        </a>
                      </td>
                      <td className="px-3 py-2.5 align-middle">
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
                              className="w-full h-8 px-2 rounded-md border border-input text-[13px] font-medium text-foreground focus:outline-none focus:border-primary"
                            />
                            {savingAltKey === key ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                            ) : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startEditAlt(file)}
                            className={`w-full text-left text-[13px] font-medium truncate rounded-md px-1.5 py-1 -mx-1.5 hover:bg-muted cursor-pointer ${
                              file.altText ? "text-foreground" : "text-muted-foreground/50"
                            }`}
                            title={file.altText || "Add alt text"}
                          >
                            {file.altText || "Add alt text"}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-[13px] font-medium text-muted-foreground">
                        {formatRelativeDate(file.modifiedAt)}
                      </td>
                      <td className="px-3 py-2.5 align-middle text-[13px] font-medium text-muted-foreground">
                        {formatSize(file.size)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-3 text-[12px] text-muted-foreground font-medium flex items-center gap-1.5 px-1">
        <ImageIcon className="w-3 h-3" />
        {files.length} file{files.length === 1 ? "" : "s"}
        {folder !== "all" ? ` in ${folder}` : ""}
        {selected.size ? ` · ${selected.size} selected` : ""}
        {" · "}Max 10 MB · optimized to WebP on upload
      </p>
    </div>
  );
}
