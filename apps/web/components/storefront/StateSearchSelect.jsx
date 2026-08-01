"use client";

import {
  CaretIcon,
  SearchIcon
} from "@/components/icons/storeIcons";
import { useEffect, useMemo, useRef, useState } from "react";

export const INDIAN_STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Ladakh",
  "Lakshadweep",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const ALIASES = {
  orissa: "Odisha",
  pondicherry: "Puducherry",
  "nct of delhi": "Delhi",
  "national capital territory of delhi": "Delhi",
  "dadra and nagar haveli": "Dadra and Nagar Haveli and Daman and Diu",
  "daman and diu": "Dadra and Nagar Haveli and Daman and Diu",
};

/** Map API / free-text state names onto the canonical list. */
export function normalizeIndianState(raw = "") {
  const value = String(raw || "").trim();
  if (!value) return "";
  const lower = value.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  const exact = INDIAN_STATES.find((s) => s.toLowerCase() === lower);
  if (exact) return exact;
  const starts = INDIAN_STATES.find((s) => s.toLowerCase().startsWith(lower));
  if (starts) return starts;
  const includes = INDIAN_STATES.find((s) => s.toLowerCase().includes(lower));
  return includes || value;
}

/**
 * Searchable Indian state selector.
 */
export default function StateSearchSelect({
  value,
  onChange,
  error = false,
  className = "",
  placeholder = "Select state",
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef(null);
  const searchRef = useRef(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return INDIAN_STATES;
    return INDIAN_STATES.filter((s) => s.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (!rootRef.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);

  const display = value || placeholder;

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between rounded-md border bg-white px-3 py-3 text-left text-[14px] focus:outline-none focus:ring-1 ${
          error
            ? "border-red-400 focus:border-red-500 focus:ring-red-500"
            : "border-gray-300 focus:border-[#1773b0] focus:ring-[#1773b0]"
        } ${value ? "text-gray-900" : "text-gray-400"}`}
      >
        <span className="truncate">{display}</span>
        <CaretIcon className={`h-4 w-4 shrink-0 text-gray-400 transition ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <SearchIcon className="h-4 w-4 text-gray-400" />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search state…"
              className="w-full bg-transparent text-[14px] text-gray-900 outline-none placeholder:text-gray-400"
            />
          </div>
          <ul role="listbox" className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-[13px] text-gray-400">No states found</li>
            ) : (
              filtered.map((state) => {
                const selected = state === value;
                return (
                  <li key={state}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={`w-full px-3 py-2 text-left text-[14px] hover:bg-[#f0f5ff] ${
                        selected ? "bg-[#f0f5ff] font-medium text-[#1773b0]" : "text-gray-900"
                      }`}
                      onClick={() => {
                        onChange(state);
                        setOpen(false);
                      }}
                    >
                      {state}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
