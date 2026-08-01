"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, ArrowUpDown, Columns3, Eye, EyeOff } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

function columnLabel(column) {
  const metaLabel = column.columnDef.meta?.label;
  if (typeof metaLabel === "string" && metaLabel.trim()) return metaLabel;
  if (typeof column.columnDef.header === "string" && column.columnDef.header.trim()) {
    return column.columnDef.header;
  }
  return column.id;
}

function defaultToggleableIds(table) {
  return table
    .getAllLeafColumns()
    .filter((column) => column.getCanHide())
    .map((column) => column.id);
}

/** Shopify-style 2×3 drag grip */
function DragHandleIcon({ className }) {
  return (
    <svg
      viewBox="0 0 12 16"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <circle cx="3.5" cy="3" r="1.15" />
      <circle cx="8.5" cy="3" r="1.15" />
      <circle cx="3.5" cy="8" r="1.15" />
      <circle cx="8.5" cy="8" r="1.15" />
      <circle cx="3.5" cy="13" r="1.15" />
      <circle cx="8.5" cy="13" r="1.15" />
    </svg>
  );
}

function SortableColumnRow({ id, label, visible, onToggle }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
      className={cn(
        "flex h-8 items-center gap-2 px-1 text-[0.8125rem] font-[450] leading-5",
        visible ? "text-[#303030]" : "text-[#b5b5b5]",
        isDragging && "rounded-lg bg-[#f6f6f6] shadow-sm"
      )}
    >
      <button
        type="button"
        className={cn(
          "inline-flex size-6 shrink-0 cursor-grab items-center justify-center text-[#8a8a8a] hover:text-[#303030] active:cursor-grabbing",
          !visible && "text-[#c9c9c9]"
        )}
        aria-label={`Reorder ${label}`}
        {...attributes}
        {...listeners}
      >
        <DragHandleIcon className="size-3" />
      </button>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "inline-flex size-7 shrink-0 items-center justify-center rounded-md hover:bg-black/[0.04]",
          visible ? "text-[#4a4a4a]" : "text-[#c9c9c9]"
        )}
        aria-label={visible ? `Hide ${label}` : `Show ${label}`}
      >
        {visible ? (
          <Eye className="size-3.5 stroke-[1.75]" />
        ) : (
          <EyeOff className="size-3.5 stroke-[1.75]" />
        )}
      </button>
    </div>
  );
}

/**
 * Shopify-style columns panel: optional sort/archive controls + drag/eye columns.
 */
export function DataTableColumnsMenu({
  table,
  columnIds,
  className,
  align = "end",
  sortOptions,
  sortValue,
  onSortChange,
  hideArchived,
  onHideArchivedChange,
  showHideArchived = false,
}) {
  const [open, setOpen] = useState(false);
  const contentRef = useRef(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const resolvedIds = useMemo(
    () => (columnIds?.length ? columnIds : defaultToggleableIds(table)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, columnIds, table.getState().columnOrder, table.getState().columnVisibility]
  );

  const managedIds = useMemo(() => {
    const order = table.getState().columnOrder;
    const all = resolvedIds.filter((id) => table.getColumn(id)?.getCanHide());
    if (!order?.length) return all;
    const ordered = order.filter((id) => all.includes(id));
    const missing = all.filter((id) => !ordered.includes(id));
    return [...ordered, ...missing];
  }, [table, resolvedIds, table.getState().columnOrder]);

  const sortableOptions = useMemo(() => {
    if (sortOptions?.length) return sortOptions;
    return managedIds
      .map((id) => {
        const column = table.getColumn(id);
        if (!column?.getCanSort?.()) return null;
        return { value: id, label: columnLabel(column) };
      })
      .filter(Boolean);
  }, [sortOptions, managedIds, table]);

  const currentSort =
    sortValue ||
    table.getState().sorting?.[0]?.id ||
    sortableOptions[0]?.value ||
    "";

  const currentSortLabel =
    sortableOptions.find((o) => o.value === currentSort)?.label || "Date";

  // Close when the page/table scrolls behind the popover; columns list can still scroll.
  useEffect(() => {
    if (!open) return;

    const isInsidePopover = (target) => {
      if (!(target instanceof Node)) return false;
      if (contentRef.current?.contains(target)) return true;
      const popup = document.querySelector(
        '[data-slot="popover-content"][data-columns-menu]'
      );
      return Boolean(popup?.contains(target));
    };

    const closeIfOutside = (event) => {
      if (isInsidePopover(event.target)) return;
      setOpen(false);
    };

    window.addEventListener("scroll", closeIfOutside, true);
    window.addEventListener("wheel", closeIfOutside, { capture: true, passive: true });
    window.addEventListener("touchmove", closeIfOutside, {
      capture: true,
      passive: true,
    });

    return () => {
      window.removeEventListener("scroll", closeIfOutside, true);
      window.removeEventListener("wheel", closeIfOutside, true);
      window.removeEventListener("touchmove", closeIfOutside, true);
    };
  }, [open]);

  if (managedIds.length === 0) return null;

  const onDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = managedIds.indexOf(String(active.id));
    const newIndex = managedIds.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const nextManaged = arrayMove(managedIds, oldIndex, newIndex);

    const currentOrder = table.getState().columnOrder;
    const allLeafIds = table.getAllLeafColumns().map((c) => c.id);
    const base = currentOrder?.length ? currentOrder : allLeafIds;
    const managedSet = new Set(managedIds);
    const result = [];
    let mi = 0;
    for (const id of base) {
      if (managedSet.has(id)) {
        if (mi < nextManaged.length) {
          result.push(nextManaged[mi]);
          mi += 1;
        }
      } else {
        result.push(id);
      }
    }
    while (mi < nextManaged.length) {
      result.push(nextManaged[mi]);
      mi += 1;
    }
    table.setColumnOrder(result);
  };

  const handleSortSelect = (value) => {
    if (onSortChange) {
      onSortChange(value);
      return;
    }
    table.setSorting([{ id: value, desc: true }]);
  };

  const showSortRow = sortableOptions.length > 0;
  const showArchiveRow = showHideArchived || typeof onHideArchivedChange === "function";

  return (
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-md border-0 bg-transparent text-[#8a8a8a] outline-none transition-colors hover:bg-black/5 hover:text-[#303030] focus-visible:ring-2 focus-visible:ring-ring/30",
          className
        )}
        aria-label="Columns"
        title="Columns"
      >
        <Columns3 className="size-4" />
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align={align}
        sideOffset={6}
        data-columns-menu=""
        className="w-[17.5rem] gap-0 overflow-hidden rounded-[0.75rem] border-[#e3e3e3] bg-white p-0 shadow-[0_0.25rem_0.75rem_#00000014,0_0_0_0.5px_#0000000d]"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        {(showSortRow || showArchiveRow) && (
          <div className="flex flex-col px-2 pt-2">
            {showSortRow ? (
              <div className="flex h-8 items-center gap-2 px-1 text-[0.8125rem] font-[450] text-[#303030]">
                <ArrowUpDown className="size-3.5 shrink-0 text-[#616161]" />
                <span className="min-w-0 flex-1">Sort by</span>
                <DropdownMenu>
                  <DropdownMenuTrigger className="inline-flex max-w-[8.5rem] items-center gap-1 rounded-md px-1 py-0.5 text-[0.8125rem] font-[450] text-[#303030] outline-none hover:bg-black/[0.04]">
                    <span className="truncate">{currentSortLabel}</span>
                    <span
                      className="inline-flex flex-col items-center leading-[0.55] text-[#8a8a8a]"
                      aria-hidden
                    >
                      <span className="text-[7px]">▴</span>
                      <span className="text-[7px]">▾</span>
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-[10rem]">
                    {sortableOptions.map((opt) => (
                      <DropdownMenuItem
                        key={opt.value}
                        className="text-[0.8125rem]"
                        onClick={() => handleSortSelect(opt.value)}
                      >
                        <span className="w-4 text-center text-[#303030]">
                          {opt.value === currentSort ? "✓" : ""}
                        </span>
                        {opt.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : null}

            {showArchiveRow ? (
              <div className="flex h-8 items-center gap-2 px-1 text-[0.8125rem] font-[450] text-[#303030]">
                <Archive className="size-3.5 shrink-0 text-[#616161]" />
                <span className="min-w-0 flex-1">Hide archived</span>
                <Switch
                  checked={Boolean(hideArchived)}
                  onCheckedChange={(checked) => onHideArchivedChange?.(checked)}
                  size="sm"
                  className="data-checked:bg-[#303030] data-unchecked:bg-[#c9c9c9]"
                />
              </div>
            ) : null}
          </div>
        )}

        {(showSortRow || showArchiveRow) && (
          <Separator className="my-1.5 bg-[#ebebeb]" />
        )}

        <div className="max-h-[min(60vh,22rem)] overflow-y-auto overscroll-contain px-2 pb-2">
          <p className="px-1 pb-1 text-[0.75rem] font-[550] leading-4 text-[#616161]">
            Columns
          </p>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={managedIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col">
                {managedIds.map((id) => {
                  const column = table.getColumn(id);
                  if (!column) return null;
                  const visible = column.getIsVisible();
                  return (
                    <SortableColumnRow
                      key={id}
                      id={id}
                      label={columnLabel(column)}
                      visible={visible}
                      onToggle={() => column.toggleVisibility(!visible)}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        </div>
      </PopoverContent>
    </Popover>
  );
}
