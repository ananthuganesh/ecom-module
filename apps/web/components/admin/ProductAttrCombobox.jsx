"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

function normalizeValue(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Single-value attribute picker: choose a suggestion or type a new one.
 *
 * The single-value sibling of ProductColorChips, for fields like Pattern and
 * Fit where the built-in list is a starting point rather than a closed set.
 */
export default function ProductAttrCombobox({
  value = "",
  suggestions = [],
  onChange,
  placeholder = "Select or type a new value",
  className = "",
}) {
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);
  const inputRef = useRef(null);

  const current = normalizeValue(value);

  const options = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const item of suggestions || []) {
      const name = normalizeValue(item);
      const key = name.toLowerCase();
      if (!name || seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    return out;
  }, [suggestions]);

  const filtered = useMemo(() => {
    const q = draft.trim().toLowerCase();
    return options.filter((o) => !q || o.toLowerCase().includes(q)).slice(0, 10);
  }, [options, draft]);

  const typed = normalizeValue(draft);
  const canCreate =
    !!typed &&
    !options.some((o) => o.toLowerCase() === typed.toLowerCase()) &&
    typed.toLowerCase() !== current.toLowerCase();

  const commit = (raw) => {
    const name = normalizeValue(raw);
    if (!name) return;
    onChange?.(name);
    setDraft("");
    setOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    onChange?.("");
    setDraft("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  return (
    <div className={cn("relative", className)}>
      <div
        className="flex min-h-8 w-full items-center gap-1.5 rounded-lg border border-[#e3e3e3] bg-white px-2.5 py-1 shadow-none focus-within:border-[#b5b5b5]"
        onClick={() => inputRef.current?.focus()}
      >
        {current && !draft ? (
          <span className="inline-flex h-5 max-w-full items-center gap-1 rounded-md bg-[#e3e3e3] px-1.5 text-[12px] leading-none font-[550] text-[#303030]">
            <span className="truncate leading-none">{current}</span>
            <button
              type="button"
              aria-label={`Clear ${current}`}
              className="inline-flex size-3.5 shrink-0 items-center justify-center rounded opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                clear();
              }}
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
          </span>
        ) : null}
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
            if (e.key === "Enter") {
              e.preventDefault();
              commit(draft);
              return;
            }
            if (e.key === "Backspace" && !draft && current) {
              clear();
            }
          }}
          placeholder={current ? "" : placeholder}
          className="h-5 min-w-[6rem] flex-1 border-0 bg-transparent p-0 text-[13px] leading-5 outline-none placeholder:text-[#b5b5b5]"
          autoComplete="off"
        />
      </div>

      {open && (filtered.length > 0 || canCreate) ? (
        <div className="absolute left-0 z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-[#e3e3e3] bg-white py-1 text-left shadow-md">
          {filtered.map((opt) => (
            <button
              key={opt}
              type="button"
              className={cn(
                "flex w-full px-2.5 py-1.5 text-left text-[13px] leading-5 text-[#303030] hover:bg-[#f1f1f1]",
                opt.toLowerCase() === current.toLowerCase() && "font-[550]"
              )}
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
              Add “{typed}”
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
