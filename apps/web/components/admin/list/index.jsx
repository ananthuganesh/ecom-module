"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDashed,
  Clock,
  Send,
  XCircle,
  Zap,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress, ProgressLabel } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export function AdminListLayout({
  title,
  description,
  actions,
  metrics,
  filters,
  children,
  aside,
  fill = true,
}) {
  const showHeader = Boolean(title) || Boolean(actions) || Boolean(description);

  return (
    <div
      className={
        fill
          ? "flex h-full min-h-full flex-1 flex-col overflow-hidden"
          : "flex w-full flex-col"
      }
    >
      <div
        className={
          fill
            ? "flex min-h-0 flex-1 flex-col items-stretch gap-8 xl:flex-row"
            : "flex w-full flex-col items-start gap-8 xl:flex-row"
        }
      >
        <div
          className={
            fill
              ? "flex min-h-0 w-full min-w-0 flex-1 flex-col"
              : "flex w-full min-w-0 flex-1 flex-col"
          }
        >
          {showHeader || metrics || filters ? (
            <div className="shrink-0">
              {showHeader ? (
                <div className="mb-5 flex w-full flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {title || description ? (
                    <div className="min-w-0">
                      {title ? (
                        <h1 className="admin-page-title text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
                          {title}
                        </h1>
                      ) : null}
                      {description ? (
                        <p className="mt-1 max-w-[42rem] text-[13px] leading-5 text-[#616161]">
                          {description}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <div />
                  )}
                  {actions ? (
                    <div className="flex flex-wrap items-center justify-end gap-1.5 sm:ml-auto">
                      {actions}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {metrics ? <div className="mb-5">{metrics}</div> : null}
              {filters ? (
                <div className="mb-3 flex w-full flex-wrap items-center gap-2">{filters}</div>
              ) : null}
            </div>
          ) : null}
          <div
            className={
              fill ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "w-full"
            }
          >
            {children}
          </div>
        </div>
        {aside ? (
          <aside className="min-h-0 w-full shrink-0 space-y-6 overflow-y-auto xl:w-[300px]">
            {aside}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function AdminHeaderButton({
  children,
  onClick,
  variant = "secondary",
  type = "button",
  disabled,
}) {
  const isPrimary = variant === "primary";
  const isOutline = variant === "outline";
  return (
    <Button
      type={type}
      onClick={onClick}
      disabled={disabled}
      size="lg"
      variant={isPrimary ? "default" : isOutline ? "outline" : "secondary"}
      className={cn(
        "h-8 min-h-8 gap-1.5 rounded-lg px-3 text-[0.8125rem] font-[550] leading-5 shadow-none",
        isPrimary
          ? "bg-[#303030] text-white hover:bg-[#1a1a1a]"
          : isOutline
            ? "border-[#c9cccf] bg-transparent text-[#303030] hover:bg-[#f7f7f7] active:bg-[#f1f1f1]"
            : "border-transparent bg-[#e3e3e3] text-[#303030] hover:bg-[#d4d4d4] active:bg-[#ccc]"
      )}
    >
      {children}
    </Button>
  );
}

export function AdminHeaderSplitButton({
  children,
  onClick,
  menuItems = [],
  variant = "primary",
  disabled,
}) {
  const isPrimary = variant === "primary";
  const btnVariant = isPrimary ? "default" : "outline";

  return (
    <div className="inline-flex h-8 items-center gap-0">
      <Button
        type="button"
        onClick={onClick}
        disabled={disabled}
        variant={btnVariant}
        size="lg"
        className={cn(
          "h-8 min-h-8 gap-1.5 rounded-r-none px-3 text-[0.8125rem] font-[550] leading-5 shadow-none",
          isPrimary
            ? "border-r border-r-white/15 bg-[#303030] text-white hover:bg-[#1a1a1a]"
            : "border-transparent bg-[#e3e3e3] text-[#303030] hover:bg-[#d4d4d4]"
        )}
      >
        {children}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={disabled || menuItems.length === 0}
          render={
            <Button
              type="button"
              variant={btnVariant}
              size="icon-lg"
              disabled={disabled || menuItems.length === 0}
              className={cn(
                "h-8 w-8 rounded-l-none shadow-none",
                isPrimary
                  ? "bg-[#303030] text-white hover:bg-[#1a1a1a]"
                  : "border-transparent bg-[#e3e3e3] text-[#303030] hover:bg-[#d4d4d4]"
              )}
            />
          }
        >
          <ChevronDown className="size-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[160px]">
          {menuItems.map((item) => (
            <DropdownMenuItem
              key={item.label}
              disabled={item.disabled}
              onClick={() => item.onClick?.()}
            >
              {item.icon}
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function AdminFilterPill({ label, value, options, onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 w-auto min-w-[120px] rounded-lg border-border bg-card text-[13px] font-medium">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}</SelectItem>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function AdminViewMenu({ value = "all", options = [], onChange }) {
  const current =
    options.find((o) => o.value === value) || options[0] || { value: "all", label: "All" };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="inline-flex h-8 shrink-0 items-center gap-1 rounded-md border-0 bg-transparent px-2 text-[0.8125rem] font-[550] text-[#303030] outline-none hover:bg-black/5">
        {current.label}
        <span className="inline-flex flex-col leading-none text-[#8a8a8a]" aria-hidden>
          <ChevronDown className="size-3 rotate-180" />
          <ChevronDown className="size-3 -mt-1" />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[180px]">
        {options.map((opt) => (
          <DropdownMenuItem
            key={opt.value}
            onClick={() => onChange?.(opt.value)}
          >
            <span className="w-4 text-center">{opt.value === value ? "✓" : ""}</span>
            {opt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const DATE_PRESETS = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
];

function toDayKey(d) {
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseDayKey(key) {
  if (!key || typeof key !== "string") return undefined;
  const [y, m, d] = key.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

function formatRangeLabel(fromKey, toKey) {
  const from = parseDayKey(fromKey);
  const to = parseDayKey(toKey || fromKey);
  if (!from) return "Custom range";
  const fmt = (dt) =>
    dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  if (!to || toDayKey(from) === toDayKey(to)) return fmt(from);
  return `${fmt(from)} – ${fmt(to)}`;
}

export function AdminDateRangeButton({
  value,
  onChange,
  className = "",
  presets = DATE_PRESETS,
  align = "end",
  allowCustom = false,
}) {
  const list = Array.isArray(presets) && presets.length ? presets : DATE_PRESETS;
  const isObject = value && typeof value === "object";
  const preset = isObject
    ? value.preset || (value.from || value.to ? "custom" : list[0]?.value || "all")
    : value || list[0]?.value || "all";
  const fromKey = isObject ? value.from || "" : "";
  const toKey = isObject ? value.to || "" : "";
  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState("presets"); // presets | custom
  const [draftRange, setDraftRange] = useState({
    from: parseDayKey(fromKey),
    to: parseDayKey(toKey),
  });

  const current = list.find((p) => p.value === preset);
  const label =
    preset === "custom" || (fromKey && toKey)
      ? formatRangeLabel(fromKey, toKey || fromKey)
      : current?.label || list[0]?.label || "Date";
  const hasAll = list.some((p) => p.value === "all");
  const isFiltered =
    preset === "custom" || Boolean(fromKey) || (hasAll ? preset !== "all" : Boolean(preset));

  const emit = (next) => {
    if (typeof value === "string" && next.preset && next.preset !== "custom" && !next.from) {
      onChange?.(next.preset);
      return;
    }
    onChange?.(next);
  };

  const handleOpenChange = (nextOpen) => {
    setOpen(nextOpen);
    if (!nextOpen) setPanel("presets");
  };

  const applyPreset = (p) => {
    setPanel("presets");
    setOpen(false);
    emit({ preset: p.value });
  };

  const showCustom = () => {
    setDraftRange({
      from: parseDayKey(fromKey) || undefined,
      to: parseDayKey(toKey || fromKey) || undefined,
    });
    setPanel("custom");
  };

  const applyCustom = () => {
    if (!draftRange?.from) return;
    const from = toDayKey(draftRange.from);
    const to = toDayKey(draftRange.to || draftRange.from);
    emit({ preset: "custom", from, to });
    setPanel("presets");
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        className={cn(
          "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-[13px] font-medium outline-none hover:bg-muted",
          isFiltered && "border-foreground/20 bg-muted/60",
          className
        )}
      >
        <CalendarDays className="size-3.5 text-muted-foreground" />
        <span className="max-w-[14rem] truncate">{label}</span>
        <ChevronDown className="size-3.5 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="bottom"
        sideOffset={6}
        className={cn(
          "gap-0 p-1.5 shadow-lg",
          panel === "custom" ? "w-auto min-w-[280px]" : "w-[220px]"
        )}
      >
        {panel === "presets" ? (
          <div className="flex flex-col py-0.5">
            {list.map((p, idx) => (
              <div key={p.value}>
                {hasAll && idx === 1 ? (
                  <div className="my-1 h-px bg-border" />
                ) : null}
                <button
                  type="button"
                  onClick={() => applyPreset(p)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground outline-none hover:bg-muted"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {p.value === preset && preset !== "custom" ? (
                      <Check className="size-3.5" />
                    ) : null}
                  </span>
                  {p.label}
                </button>
              </div>
            ))}
            {allowCustom ? (
              <>
                <div className="my-1 h-px bg-border" />
                <button
                  type="button"
                  onClick={showCustom}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] text-foreground outline-none hover:bg-muted"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    {preset === "custom" ? <Check className="size-3.5" /> : null}
                  </span>
                  Custom range…
                </button>
              </>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-2 p-1">
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={draftRange}
              onSelect={(range) => {
                setDraftRange(range || { from: undefined, to: undefined });
              }}
              defaultMonth={draftRange?.from || new Date()}
            />
            <div className="flex items-center justify-end gap-1.5 border-t border-border px-1 pt-2 pb-0.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-[12px]"
                onClick={() => {
                  setPanel("presets");
                  setOpen(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-7 px-2.5 text-[12px]"
                disabled={!draftRange?.from}
                onClick={applyCustom}
              >
                Apply
              </Button>
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

const STATUS_TONE_STYLES = {
  success: "bg-black/[0.06] text-[#616161] hover:bg-black/[0.06]",
  info: "bg-black/[0.06] text-[#616161] hover:bg-black/[0.06]",
  purple: "bg-black/[0.06] text-[#616161] hover:bg-black/[0.06]",
  review: "bg-black/[0.06] text-[#616161] hover:bg-black/[0.06]",
  neutral: "bg-black/[0.06] text-[#616161] hover:bg-black/[0.06]",
  danger: "bg-black/[0.06] text-[#616161] hover:bg-black/[0.06]",
  warning: "bg-black/[0.06] text-[#616161] hover:bg-black/[0.06]",
  caution: "bg-black/[0.06] text-[#616161] hover:bg-black/[0.06]",
};

/** Solid Polaris-style fills — use for fulfillment badges only. */
const STATUS_TONE_SOLID_STYLES = {
  success: "bg-[#cdfee1] text-[#0c5132] hover:bg-[#cdfee1]",
  info: "bg-[#e0f0ff] text-[#00527c] hover:bg-[#e0f0ff]",
  purple: "bg-[#f1e8ff] text-[#4c2e9d] hover:bg-[#f1e8ff]",
  review: "bg-[#ffef9d] text-[#4f4700] hover:bg-[#ffef9d]",
  neutral: "bg-[#e3e3e3] text-[#303030] hover:bg-[#e3e3e3]",
  danger: "bg-[#fee2e1] text-[#8e1f0b] hover:bg-[#fee2e1]",
  warning: "bg-[#ffd6a4] text-[#5e4200] hover:bg-[#ffd6a4]",
  caution: "bg-[#ffeb78] text-[#4f4700] hover:bg-[#ffeb78]",
};

const STATUS_TONE_ICON_COLORS = {
  success: "text-[#047b5d]",
  info: "text-[#0094d5]",
  purple: "text-[#8051ff]",
  review: "text-[#b28400]",
  neutral: "text-[#8a8a8a]",
  danger: "text-[#e22c38]",
  warning: "text-[#b28400]",
  caution: "text-[#4f4700]",
};

const STATUS_TONE_DOT_COLORS = {
  success: "bg-[#4a4a4a]",
  info: "bg-[#0094d5]",
  purple: "bg-[#8051ff]",
  review: "bg-[#b28400]",
  neutral: "bg-[#8a8a8a]",
  danger: "bg-[#e22c38]",
  warning: "bg-[#b28400]",
  caution: "bg-[#998a00]",
};

const STATUS_TONE_ICONS = {
  success: CheckCircle2,
  info: CircleDashed,
  purple: Send,
  review: Zap,
  neutral: Clock,
  danger: XCircle,
  warning: AlertTriangle,
  caution: AlertTriangle,
};

const STATUS_SIZE_STYLES = {
  default: "h-6 gap-1.5 rounded-[0.5rem] px-2 py-0.5 pl-1.5 text-[0.75rem] font-[550] leading-4",
  large:
    "h-7 gap-1.5 rounded-[0.5rem] px-2.5 py-0.5 pl-2 text-[0.8125rem] font-[550] leading-5",
};

/** Shopify Polaris order-unfulfilled glyph (16×16). */
export function OrderUnfulfilledIcon({ className, ...props }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      aria-hidden
      {...props}
    >
      <path d="M10.53 2.78a.749.749 0 1 0-1.06-1.06l-1.47 1.47-1.47-1.47a.749.749 0 1 0-1.06 1.06l1.47 1.47-1.47 1.47a.749.749 0 1 0 1.06 1.06l1.47-1.47 1.47 1.47a.749.749 0 1 0 1.06-1.06l-1.47-1.47z" />
      <path
        fillRule="evenodd"
        d="m12.844 8-.336-2.265a.75.75 0 0 1 1.484-.22l.413 2.792q.095.638.095 1.282v1.661a3.25 3.25 0 0 1-3.25 3.25h-6.5a3.25 3.25 0 0 1-3.25-3.25v-1.66q0-.645.094-1.283l.414-2.792a.75.75 0 1 1 1.484.22l-.336 2.265h2.484c.538 0 1.015.344 1.185.855l.159.474a.25.25 0 0 0 .237.171h1.558a.25.25 0 0 0 .237-.17l.159-.475a1.25 1.25 0 0 1 1.185-.855zm-9.843 1.5-.001.09v1.66c0 .967.784 1.75 1.75 1.75h6.5a1.75 1.75 0 0 0 1.75-1.75v-1.75h-2.46l-.1.303a1.75 1.75 0 0 1-1.66 1.197h-1.56a1.75 1.75 0 0 1-1.66-1.197l-.1-.303h-2.46Z"
      />
    </svg>
  );
}

export function AdminStatusText({
  tone = "neutral",
  size = "default",
  children,
  icon: IconProp,
  dot = false,
  solid = false,
  className,
}) {
  const Icon = IconProp || STATUS_TONE_ICONS[tone] || Clock;
  const iconSize = size === "large" ? "size-3.5" : "size-3";
  const toneStyles = solid
    ? STATUS_TONE_SOLID_STYLES[tone] || STATUS_TONE_SOLID_STYLES.neutral
    : STATUS_TONE_STYLES[tone] || STATUS_TONE_STYLES.neutral;
  return (
    <Badge
      variant="secondary"
      className={cn(
        "border-0",
        STATUS_SIZE_STYLES[size] || STATUS_SIZE_STYLES.default,
        toneStyles,
        className
      )}
    >
      {dot ? (
        <span
          className={cn(
            "size-2 shrink-0 rounded-[0.15rem]",
            STATUS_TONE_DOT_COLORS[tone] || STATUS_TONE_DOT_COLORS.neutral
          )}
          aria-hidden
        />
      ) : (
        <Icon
          className={cn(
            iconSize,
            "shrink-0",
            STATUS_TONE_ICON_COLORS[tone] || STATUS_TONE_ICON_COLORS.neutral
          )}
          strokeWidth={1.75}
          aria-hidden
        />
      )}
      {children}
    </Badge>
  );
}

export function AdminDataTable({ headers, children, empty, toolbar, fitContent = false }) {
  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden rounded-xl border-border py-0 shadow-none",
        fitContent
          ? "w-full"
          : "flex h-full min-h-0 flex-1 flex-col rounded-b-none border-b-0"
      )}
    >
      {toolbar ? (
        <div
          data-slot="data-table-toolbar"
          className="flex w-full shrink-0 items-center gap-2 border-b border-[#ebebeb] bg-white px-3 py-2"
        >
          {toolbar}
        </div>
      ) : null}
      <CardContent
        className={cn(
          "p-0",
          fitContent ? "overflow-x-auto" : "min-h-0 flex-1 overflow-auto"
        )}
      >
        <Table className={fitContent ? "table-auto" : "table-fixed"}>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow className="hover:bg-muted">
              {headers.map((h, i) => (
                <TableHead
                  key={i}
                  className={cn(
                    "h-8 whitespace-nowrap bg-muted px-3 py-0 text-[13px] font-normal text-muted-foreground",
                    h.align === "right" && "text-right",
                    h.className
                  )}
                >
                  {h.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody className="bg-card [&_tr:hover]:bg-muted [&_td]:h-8 [&_td]:border-b [&_td]:border-border [&_td]:py-0">
            {children}
          </TableBody>
        </Table>
        {empty}
      </CardContent>
    </Card>
  );
}

export function AdminBulkBar({ count, onClear, children }) {
  if (!count) return null;
  return (
    <div className="fixed bottom-6 right-6 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-xl bg-primary py-2 pr-2 pl-4 text-primary-foreground shadow-lg">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClear}
        className="size-6 text-primary-foreground/70 hover:bg-card/10 hover:text-primary-foreground"
        aria-label="Clear selection"
      >
        ×
      </Button>
      <span className="whitespace-nowrap text-[13px] font-medium">
        {count} selected
      </span>
      <Separator orientation="vertical" className="h-4 bg-card/20" />
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

export function AdminBulkAction({ children, onClick, disabled }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="lg"
      onClick={onClick}
      disabled={disabled}
      className="h-8 px-3 text-[13px] font-medium text-primary-foreground hover:bg-card/10 hover:text-primary-foreground"
    >
      {children}
    </Button>
  );
}

export function AdminInsightCard({ title, action, children }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13px] font-medium text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function AdminProgressRow({ label, value, percent }) {
  return (
    <Progress value={Math.min(100, Math.max(0, percent))} className="mb-2.5 gap-1">
      <div className="flex w-full items-center justify-between gap-2">
        <ProgressLabel className="text-[13px] text-muted-foreground">{label}</ProgressLabel>
        <span className="text-[13px] tabular-nums text-muted-foreground">{value}</span>
      </div>
    </Progress>
  );
}

export function AdminMetricRow({ items = [] }) {
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
      {items.map((item) => (
        <Card key={item.label} className="@container/card">
          <CardHeader>
            <CardDescription>{item.label}</CardDescription>
            <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
              {item.value}
            </CardTitle>
            {item.action ? <CardAction>{item.action}</CardAction> : null}
          </CardHeader>
          {item.detail || item.hint ? (
            <CardFooter className="flex-col items-start gap-1.5 text-xs">
              {item.detail ? (
                <div className="line-clamp-1 flex gap-2 font-medium">{item.detail}</div>
              ) : null}
              {item.hint ? (
                <div className="text-muted-foreground">{item.hint}</div>
              ) : null}
            </CardFooter>
          ) : null}
        </Card>
      ))}
    </div>
  );
}

export function AdminStatusTabs({ tabs, value, onChange }) {
  return (
    <Tabs value={value} onValueChange={onChange}>
      <TabsList variant="line" className="h-auto gap-2 bg-transparent p-0">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="h-8 rounded-md px-3.5 text-[13px] font-medium data-active:bg-muted data-active:shadow-none"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

// Keep TableCell export convenience for pages that compose rows
export { TableCell, TableRow };
