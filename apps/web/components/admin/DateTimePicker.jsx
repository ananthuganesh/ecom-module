"use client";

import { useState } from "react";
import { CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  buildLocalValue,
  formatLocalValue,
  minuteOptions,
  nowLocalValue,
  parseLocalValue,
} from "@/lib/dateTimeValue";

const pad = (n) => String(n).padStart(2, "0");

function draftFrom(value) {
  return parseLocalValue(value) || parseLocalValue(nowLocalValue());
}

/** Up/down stepper used for the hour and minute, wrapping at the ends. */
function Stepper({ label, value, options, onChange }) {
  const index = Math.max(0, options.indexOf(value));
  const step = (delta) => onChange(options[(index + delta + options.length) % options.length]);
  return (
    <div className="flex flex-col items-center">
      <button
        type="button"
        onClick={() => step(1)}
        className="flex h-6 w-11 items-center justify-center rounded-md text-[#616161] hover:bg-[#f1f1f1]"
        aria-label={`Increase ${label}`}
      >
        <ChevronUp className="size-3.5" />
      </button>
      <span className="grid h-8 w-11 place-items-center rounded-md border border-[#e3e3e3] bg-white text-[14px] font-semibold tabular-nums text-[#303030]">
        {pad(value)}
      </span>
      <button
        type="button"
        onClick={() => step(-1)}
        className="flex h-6 w-11 items-center justify-center rounded-md text-[#616161] hover:bg-[#f1f1f1]"
        aria-label={`Decrease ${label}`}
      >
        <ChevronDown className="size-3.5" />
      </button>
    </div>
  );
}

/**
 * Admin date + time picker. ``value`` / ``onChange`` use local
 * "YYYY-MM-DDTHH:mm" strings ("" when empty), like <input type="datetime-local">.
 */
export default function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date & time",
  minDate,
  align = "start",
  ariaLabel,
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => draftFrom(value));
  const label = formatLocalValue(value);
  const hours = Array.from({ length: 12 }, (_, i) => i + 1);
  const minutes = minuteOptions(draft.minute);
  const minDay = minDate
    ? new Date(minDate.getFullYear(), minDate.getMonth(), minDate.getDate())
    : undefined;

  const handleOpenChange = (next) => {
    if (next) setDraft(draftFrom(value));
    setOpen(next);
  };
  const update = (patch) => setDraft((prev) => ({ ...prev, ...patch }));
  const apply = () => {
    onChange(buildLocalValue(draft.date, draft.hour12, draft.minute, draft.meridiem));
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        aria-label={ariaLabel}
        className={cn(
          "inline-flex h-8 w-full items-center gap-2 rounded-lg border border-[#e3e3e3] bg-white px-2.5 text-left text-[13px] outline-none hover:border-[#ccc] focus-visible:border-[#b5b5b5]",
          open && "border-[#b5b5b5]"
        )}
      >
        <CalendarDays className="size-3.5 shrink-0 text-[#616161]" />
        <span className={cn("min-w-0 flex-1 truncate", label ? "text-[#303030]" : "text-[#8a8a8a]")}>
          {label || placeholder}
        </span>
        <ChevronDown className="size-3.5 shrink-0 text-[#8a8a8a]" />
      </PopoverTrigger>
      <PopoverContent align={align} sideOffset={6} className="w-auto gap-0 p-1.5 shadow-lg">
        <Calendar
          mode="single"
          selected={draft.date}
          defaultMonth={draft.date}
          onSelect={(date) => date && update({ date })}
          disabled={minDay ? { before: minDay } : undefined}
        />
        <div className="flex items-center justify-center gap-2 border-t border-border px-2 pt-2 pb-1">
          <Stepper
            label="hour"
            value={draft.hour12}
            options={hours}
            onChange={(hour12) => update({ hour12 })}
          />
          <span className="pb-0.5 text-[15px] font-semibold text-[#616161]">:</span>
          <Stepper
            label="minute"
            value={draft.minute}
            options={minutes}
            onChange={(minute) => update({ minute })}
          />
          <div className="ml-1 flex flex-col overflow-hidden rounded-md border border-[#e3e3e3]">
            {["AM", "PM"].map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => update({ meridiem: m })}
                aria-pressed={draft.meridiem === m}
                className={cn(
                  "h-7 w-11 text-[12px] font-semibold",
                  draft.meridiem === m
                    ? "bg-[#303030] text-white"
                    : "bg-white text-[#616161] hover:bg-[#f1f1f1]"
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center justify-between gap-1.5 border-t border-border px-1 pt-2 pb-0.5">
          <div className="flex gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setDraft(draftFrom(nowLocalValue()))}
            >
              Now
            </Button>
            {value ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            ) : null}
          </div>
          <Button type="button" size="sm" onClick={apply}>
            Done
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
