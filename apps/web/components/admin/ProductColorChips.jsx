"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function normalizeColor(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Type a color + Enter → badge chip. Suggestions from shared color catalog.
 */
export default function ProductColorChips({
  value = [],
  suggestions = [],
  onChange,
  onSaveColor,
  placeholder = "Type a color and press Enter",
  className = "",
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const selected = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const item of Array.isArray(value) ? value : []) {
      const name = normalizeColor(item);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }, [value]);

  const selectedKeys = useMemo(
    () => new Set(selected.map((c) => c.toLowerCase())),
    [selected]
  );

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return (suggestions || [])
      .map(normalizeColor)
      .filter(Boolean)
      .filter((c) => !selectedKeys.has(c.toLowerCase()))
      .filter((c) => !q || c.toLowerCase().includes(q))
      .slice(0, 8);
  }, [suggestions, selectedKeys, draft]);

  const canCreate =
    !!draft.trim() &&
    !selectedKeys.has(draft.trim().toLowerCase()) &&
    !filtered.some((c) => c.toLowerCase() === draft.trim().toLowerCase());

  const commit = (raw) => {
    const name = normalizeColor(raw);
    if (!name) return;
    if (selectedKeys.has(name.toLowerCase())) {
      setDraft("");
      return;
    }
    const next = [...selected, name];
    onChange?.(next);
    onSaveColor?.(name);
    setDraft("");
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const removeAt = (index) => {
    onChange?.(selected.filter((_, i) => i !== index));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className="flex min-h-8 w-full flex-wrap items-center gap-1.5 rounded-lg border border-[#e3e3e3] bg-white px-2.5 py-1 shadow-none focus-within:border-[#b5b5b5]"
        onClick={() => inputRef.current?.focus()}
      >
        {selected.map((color, index) => (
          <span
            key={`${color}-${index}`}
            className="inline-flex h-5 max-w-full items-center gap-1 rounded-md bg-[#e3e3e3] px-1.5 text-[12px] leading-none font-[550] text-[#303030]"
          >
            <span className="truncate leading-none">{color}</span>
            <button
              type="button"
              aria-label={`Remove ${color}`}
              className="inline-flex size-3.5 shrink-0 items-center justify-center rounded opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(index);
              }}
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => {
            window.setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit(draft);
              return;
            }
            if (e.key === "Backspace" && !draft && selected.length) {
              removeAt(selected.length - 1);
            }
          }}
          placeholder={selected.length ? "" : placeholder}
          className="h-5 min-w-[7rem] flex-1 border-0 bg-transparent p-0 text-[13px] leading-5 outline-none placeholder:text-[#b5b5b5]"
          autoComplete="off"
        />
      </div>

      {open && (filtered.length > 0 || canCreate) ? (
        <div className="absolute left-0 z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[#e3e3e3] bg-white py-1 text-left shadow-md">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className="flex w-full px-2.5 py-1.5 text-left text-[13px] leading-5 text-[#303030] hover:bg-[#f1f1f1]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(opt)}
            >
              {opt}
            </button>
          ))}
          {canCreate ? (
            <button
              type="button"
              className="flex w-full px-2.5 py-1.5 text-left text-[13px] leading-5 font-[550] text-[#303030] hover:bg-[#f1f1f1]"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commit(draft)}
            >
              Add “{normalizeColor(draft)}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
