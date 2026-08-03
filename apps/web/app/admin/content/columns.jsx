"use client";

import { useState } from "react";
import { Loader2, File as FileIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  fileExtLabel,
  formatFileSize,
  formatRelativeDate,
  isMediaImage,
  mediaDisplayName,
  mediaFileKey,
} from "./mediaUtils";

function selectColumn() {
  return {
    id: "select",
    size: 40,
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        onClick={(e) => e.stopPropagation()}
        className="data-checked:border-[#303030] data-checked:bg-[#303030]"
      />
    ),
    cell: ({ row }) => (
      <div
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
          className="data-checked:border-[#303030] data-checked:bg-[#303030]"
        />
      </div>
    ),
  };
}

function FilePreview({ file, kind = "image" }) {
  const [broken, setBroken] = useState(false);
  const showVideo = kind === "video" || file.type === "video";
  const showImage = !showVideo && !broken && isMediaImage(file, kind);

  return (
    <a
      href={file.url}
      target="_blank"
      rel="noreferrer"
      className="flex min-w-0 items-center gap-3"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="relative flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
        {showVideo ? (
          <video
            src={file.url}
            className="h-full w-full object-cover"
            muted
            playsInline
            preload="metadata"
          />
        ) : showImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={file.url}
            alt={file.altText || ""}
            className="h-full w-full object-cover"
            onError={() => setBroken(true)}
          />
        ) : (
          <FileIcon className="h-4 w-4 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-[500] text-foreground hover:underline">
          {mediaDisplayName(file)}
        </p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {fileExtLabel(file.name)}
        </p>
      </div>
    </a>
  );
}

function AltTextCell({
  file,
  editingKey,
  draft,
  savingKey,
  onStart,
  onDraft,
  onSave,
  onCancel,
}) {
  const key = mediaFileKey(file);
  if (editingKey === key) {
    return (
      <div
        className="flex items-center gap-1.5"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          autoFocus
          type="text"
          value={draft}
          maxLength={500}
          onChange={(e) => onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave(file);
            }
            if (e.key === "Escape") onCancel();
          }}
          onBlur={() => onSave(file)}
          disabled={savingKey === key}
          placeholder="Add alt text"
          className="h-8 w-full rounded-md border border-input px-2 text-[13px] font-medium text-foreground focus:border-primary focus:outline-none"
        />
        {savingKey === key ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : null}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onStart(file);
      }}
      className={`-mx-1.5 w-full cursor-pointer truncate rounded-md px-1.5 py-1 text-left text-[13px] font-medium hover:bg-black/[0.04] ${
        file.altText ? "text-foreground" : "text-muted-foreground/60"
      }`}
      title={file.altText || "Add alt text"}
    >
      {file.altText || "Add alt text"}
    </button>
  );
}

function VisibleCell({ file, savingKey, onToggle }) {
  const key = mediaFileKey(file);
  const saving = savingKey === key;
  return (
    <div
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Switch
        checked={file.visible !== false}
        disabled={saving}
        onCheckedChange={(checked) => onToggle?.(file, Boolean(checked))}
        aria-label={file.visible !== false ? "Visible" : "Hidden"}
        className="data-checked:bg-[#303030] data-unchecked:bg-[#c9c9c9]"
      />
      {saving ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
      ) : (
        <span className="text-[12px] font-medium text-muted-foreground">
          {file.visible !== false ? "On" : "Off"}
        </span>
      )}
    </div>
  );
}

export function createMediaColumns({
  kind = "image",
  editingAltKey,
  altDraft,
  savingAltKey,
  onStartEditAlt,
  onAltDraftChange,
  onSaveAlt,
  onCancelEditAlt,
  showVisibleToggle = false,
  savingVisibleKey,
  onToggleVisible,
}) {
  const cols = [
    selectColumn(),
    {
      id: "file",
      accessorKey: "name",
      header: "File",
      size: 280,
      cell: ({ row }) => <FilePreview file={row.original} kind={kind} />,
    },
    {
      id: "altText",
      accessorKey: "altText",
      header: "Alt text",
      size: showVisibleToggle ? 220 : 260,
      cell: ({ row }) => (
        <AltTextCell
          file={row.original}
          editingKey={editingAltKey}
          draft={altDraft}
          savingKey={savingAltKey}
          onStart={onStartEditAlt}
          onDraft={onAltDraftChange}
          onSave={onSaveAlt}
          onCancel={onCancelEditAlt}
        />
      ),
    },
  ];

  if (showVisibleToggle) {
    cols.push({
      id: "visible",
      accessorKey: "visible",
      header: "Visible",
      size: 110,
      enableSorting: false,
      cell: ({ row }) => (
        <VisibleCell
          file={row.original}
          savingKey={savingVisibleKey}
          onToggle={onToggleVisible}
        />
      ),
    });
  }

  cols.push(
    {
      id: "modifiedAt",
      accessorKey: "modifiedAt",
      header: "Date added",
      size: 140,
      cell: ({ row }) => (
        <span className="text-[13px] font-[500] text-muted-foreground">
          {formatRelativeDate(row.original.modifiedAt)}
        </span>
      ),
    },
    {
      id: "size",
      accessorKey: "size",
      header: "Size",
      size: 100,
      cell: ({ row }) => (
        <span className="text-[13px] font-[500] text-muted-foreground">
          {formatFileSize(row.original.size)}
        </span>
      ),
    }
  );

  return cols;
}
