"use client";

import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useEffect, useRef, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { DataTableColumnsMenu } from "@/components/ui/data-table-columns-menu";
import { cn } from "@/lib/utils";

function isStickyLeft(column) {
  return column?.columnDef?.meta?.sticky === "left";
}

/** Cumulative `left` offsets for sticky-left columns in visible order.
 * Overlap by 1px so scrolling content can't flash a hairline between pins. */
function stickyLeftMap(visibleColumns) {
  const map = new Map();
  let left = 0;
  let stickyIndex = 0;
  for (const column of visibleColumns) {
    if (!isStickyLeft(column)) continue;
    if (stickyIndex > 0) left -= 1;
    map.set(column.id, left);
    left += column.getSize() || 0;
    stickyIndex += 1;
  }
  return map;
}

function lastStickyLeftId(visibleColumns) {
  let lastId = null;
  for (const column of visibleColumns) {
    if (isStickyLeft(column)) lastId = column.id;
  }
  return lastId;
}

export function DataTable({
  columns,
  data,
  searchKey,
  searchPlaceholder = "Filter...",
  pageSize = 10,
  loading = false,
  emptyTitle = "No results",
  emptyDescription = "Try adjusting your filters.",
  className,
  toolbar,
  showFooter = true,
  showSelectionCount = true,
  showColumnsMenu = true,
  columnsMenuIds,
  columnsMenuSortOptions,
  columnsMenuSortValue,
  onColumnsMenuSortChange,
  columnsMenuHideArchived,
  onColumnsMenuHideArchivedChange,
  showColumnsMenuHideArchived = false,
  infiniteScroll = false,
  /** When set with infiniteScroll, parent owns paging — show all `data` and call this to fetch more. */
  onLoadMore,
  hasMore = false,
  loadingMore = false,
  getRowId,
  rowSelection: rowSelectionProp,
  onRowSelectionChange,
  onRowClick,
  getRowClassName,
  tableClassName,
  rowHeightClass = "h-10",
  columnVisibility: columnVisibilityProp,
  onColumnVisibilityChange,
  columnOrder: columnOrderProp,
  onColumnOrderChange,
}) {
  const [sorting, setSorting] = useState([]);
  const [columnFilters, setColumnFilters] = useState([]);
  const [uncontrolledSelection, setUncontrolledSelection] = useState({});
  const [uncontrolledVisibility, setUncontrolledVisibility] = useState({});
  const [uncontrolledOrder, setUncontrolledOrder] = useState([]);
  const [visiblePageSize, setVisiblePageSize] = useState(pageSize);
  const scrollRef = useRef(null);
  const loadMoreRef = useRef(null);
  const loadMoreLockRef = useRef(false);
  const serverInfinite = Boolean(infiniteScroll && onLoadMore);

  const isSelectionControlled = rowSelectionProp !== undefined;
  const rowSelection = isSelectionControlled ? rowSelectionProp : uncontrolledSelection;
  const setRowSelection = isSelectionControlled
    ? onRowSelectionChange || (() => {})
    : onRowSelectionChange || setUncontrolledSelection;

  const isVisibilityControlled = columnVisibilityProp !== undefined;
  const columnVisibility = isVisibilityControlled
    ? columnVisibilityProp
    : uncontrolledVisibility;
  const setColumnVisibility = isVisibilityControlled
    ? onColumnVisibilityChange || (() => {})
    : onColumnVisibilityChange || setUncontrolledVisibility;

  const isOrderControlled = columnOrderProp !== undefined;
  const columnOrder = isOrderControlled ? columnOrderProp : uncontrolledOrder;
  const setColumnOrder = isOrderControlled
    ? onColumnOrderChange || (() => {})
    : onColumnOrderChange || setUncontrolledOrder;

  const isFromInteractiveDescendant = (target, rowElement) => {
    if (!target || !(target instanceof Element)) return false;
    const selector = [
      "a[href]",
      "button",
      "input",
      "select",
      "textarea",
      "[role='button']",
      "[role='link']",
      "[role='checkbox']",
      "[data-slot='checkbox']",
      "[type='checkbox']",
      "[contenteditable='true']",
    ].join(",");
    const interactive = target.closest(selector);
    return Boolean(interactive && interactive !== rowElement);
  };

  const shouldIgnoreRowEvent = (e) => {
    if (!e) return false;
    if (e.defaultPrevented) return true;
    if (e.type === "click" && "button" in e && e.button !== 0) return true;
    return isFromInteractiveDescendant(e.target, e.currentTarget);
  };

  // Client-window mode: reset window when source data or filters change
  useEffect(() => {
    if (!infiniteScroll || serverInfinite) return;
    setVisiblePageSize(pageSize);
  }, [infiniteScroll, serverInfinite, pageSize, data, sorting, columnFilters]);

  useEffect(() => {
    if (!infiniteScroll || serverInfinite) {
      setVisiblePageSize(pageSize);
    }
  }, [infiniteScroll, serverInfinite, pageSize]);

  const infinitePageSize = serverInfinite
    ? Math.max(data?.length || 0, pageSize)
    : visiblePageSize;

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      columnVisibility,
      columnOrder,
      ...(infiniteScroll
        ? { pagination: { pageIndex: 0, pageSize: infinitePageSize } }
        : {}),
    },
    ...(getRowId ? { getRowId: (row) => getRowId(row) } : {}),
    enableRowSelection: true,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    onColumnOrderChange: setColumnOrder,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: {
      pagination: { pageSize },
    },
    autoResetPageIndex: !infiniteScroll,
  });

  const toolbarNode = typeof toolbar === "function" ? toolbar(table) : toolbar;
  const showToolbarRow = Boolean(toolbarNode || searchKey || showColumnsMenu);

  const filteredCount = table.getFilteredRowModel().rows.length;
  const canLoadMoreClient =
    infiniteScroll && !serverInfinite && !loading && visiblePageSize < filteredCount;
  const canLoadMoreServer =
    serverInfinite && hasMore && !loading && !loadingMore;
  const canLoadMore = canLoadMoreClient || canLoadMoreServer;

  useEffect(() => {
    if (!infiniteScroll || !canLoadMore) return;
    const target = loadMoreRef.current;
    if (!target) return;

    // Viewport / page scroll — table expands; no nested scroll root
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((e) => e.isIntersecting);
        if (!hit) return;
        if (serverInfinite) {
          if (loadMoreLockRef.current || loadingMore || loading || !hasMore) return;
          loadMoreLockRef.current = true;
          Promise.resolve(onLoadMore())
            .catch(() => {})
            .finally(() => {
              loadMoreLockRef.current = false;
            });
          return;
        }
        setVisiblePageSize((prev) => {
          if (prev >= filteredCount) return prev;
          return Math.min(prev + pageSize, filteredCount);
        });
      },
      { root: null, rootMargin: "240px", threshold: 0 }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [
    infiniteScroll,
    serverInfinite,
    canLoadMore,
    filteredCount,
    pageSize,
    visiblePageSize,
    onLoadMore,
    hasMore,
    loading,
    loadingMore,
  ]);

  const showPager = showFooter && !infiniteScroll;
  const showCountBar = showFooter && showSelectionCount;

  const visibleLeafColumns = table.getVisibleLeafColumns();
  const stickyLeft = stickyLeftMap(visibleLeafColumns);
  const stickyEdgeId = lastStickyLeftId(visibleLeafColumns);

  const stickyCellClass = (columnId, { header = false } = {}) => {
    if (!stickyLeft.has(columnId)) return undefined;
    return cn(
      "sticky border-r-0",
      header ? "z-[3] bg-[#f6f6f6]" : "z-[1] bg-background"
    );
  };

  const stickyCellProps = (columnId) => {
    if (!stickyLeft.has(columnId)) return {};
    return {
      "data-sticky": "left",
      ...(columnId === stickyEdgeId ? { "data-sticky-edge": "" } : {}),
    };
  };

  const stickyCellStyle = (columnId, sizeStyle) => {
    if (!stickyLeft.has(columnId)) return sizeStyle;
    return {
      ...sizeStyle,
      left: stickyLeft.get(columnId),
    };
  };

  return (
    <div className={cn("flex w-full min-w-0 flex-col", className)}>
      <div
        data-slot="data-table-surface"
        className="min-w-0 overflow-hidden rounded-lg border-0 bg-card"
      >
        {showToolbarRow ? (
          <div
            data-slot="data-table-toolbar"
            className="flex w-full flex-wrap items-center gap-2 border-b bg-white px-3 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              {searchKey ? (
                <Input
                  placeholder={searchPlaceholder}
                  value={table.getColumn(searchKey)?.getFilterValue() ?? ""}
                  onChange={(e) =>
                    table.getColumn(searchKey)?.setFilterValue(e.target.value)
                  }
                  className="h-8 max-w-sm border-transparent bg-transparent shadow-none focus-visible:border-transparent focus-visible:ring-0"
                />
              ) : null}
              {toolbarNode}
            </div>
            {showColumnsMenu ? (
              <>
                <div
                  className="h-5 w-px shrink-0 bg-[#e3e3e3]"
                  aria-hidden
                />
                <DataTableColumnsMenu
                  table={table}
                  columnIds={columnsMenuIds}
                  sortOptions={columnsMenuSortOptions}
                  sortValue={columnsMenuSortValue}
                  onSortChange={onColumnsMenuSortChange}
                  hideArchived={columnsMenuHideArchived}
                  onHideArchivedChange={onColumnsMenuHideArchivedChange}
                  showHideArchived={showColumnsMenuHideArchived}
                />
              </>
            ) : null}
          </div>
        ) : null}

        <div
          ref={scrollRef}
          className={cn(
            "w-full min-w-0 overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]",
            !infiniteScroll && "max-h-[min(70vh,720px)] overflow-y-auto"
          )}
        >
          <Table className={cn("w-full min-w-max", tableClassName)}>
            <TableHeader
              className={cn(
                "z-10 bg-[#f6f6f6]",
                !infiniteScroll && "sticky top-0"
              )}
            >
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id} className="hover:bg-transparent">
                  {headerGroup.headers.map((header) => {
                    const sizeStyle = header.column.columnDef.size
                      ? {
                          width: header.column.getSize(),
                          minWidth: header.column.getSize(),
                          maxWidth: header.column.getSize(),
                        }
                      : stickyLeft.has(header.column.id)
                        ? {
                            width: header.column.getSize(),
                            minWidth: header.column.getSize(),
                          }
                        : undefined;
                    return (
                    <TableHead
                      key={header.id}
                      {...stickyCellProps(header.column.id)}
                      className={cn(
                        "h-9 bg-[#f6f6f6] px-3 py-0 text-[0.75rem] font-[550] leading-4 text-[#616161]",
                        header.column.columnDef.meta?.className,
                        stickyCellClass(header.column.id, { header: true })
                      )}
                      style={stickyCellStyle(header.column.id, sizeStyle)}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                    );
                  })}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: Math.min(pageSize, 5) }).map((_, i) => (
                  <TableRow key={`skel-${i}`} className={cn("group/row", rowHeightClass)}>
                    {visibleLeafColumns.map((col) => {
                      const sizeStyle = col.columnDef.size
                        ? {
                            width: col.getSize(),
                            minWidth: col.getSize(),
                            maxWidth: col.getSize(),
                          }
                        : stickyLeft.has(col.id)
                          ? { width: col.getSize(), minWidth: col.getSize() }
                          : undefined;
                      return (
                        <TableCell
                          key={`skel-${i}-${col.id}`}
                          {...stickyCellProps(col.id)}
                          className={cn(
                            rowHeightClass,
                            "py-0",
                            col.columnDef.meta?.className,
                            stickyCellClass(col.id)
                          )}
                          style={stickyCellStyle(col.id, sizeStyle)}
                        >
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : table.getRowModel().rows?.length ? (
                <>
                  {table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={cn(
                        "group/row",
                        rowHeightClass,
                        "bg-background hover:bg-muted/50 data-[state=selected]:bg-muted/50",
                        getRowClassName?.(row.original),
                        onRowClick && "cursor-pointer"
                      )}
                      data-state={row.getIsSelected() && "selected"}
                      onClick={
                        onRowClick
                          ? (e) => {
                              if (shouldIgnoreRowEvent(e)) return;
                              onRowClick(row.original);
                            }
                          : undefined
                      }
                      onKeyDown={
                        onRowClick
                          ? (e) => {
                              if (shouldIgnoreRowEvent(e)) return;
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onRowClick(row.original);
                              }
                            }
                          : undefined
                      }
                      tabIndex={onRowClick ? 0 : undefined}
                      role={onRowClick ? "button" : undefined}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const sizeStyle = cell.column.columnDef.size
                          ? {
                              width: cell.column.getSize(),
                              minWidth: cell.column.getSize(),
                              maxWidth: cell.column.getSize(),
                            }
                          : stickyLeft.has(cell.column.id)
                            ? {
                                width: cell.column.getSize(),
                                minWidth: cell.column.getSize(),
                              }
                            : undefined;
                        return (
                        <TableCell
                          key={cell.id}
                          {...stickyCellProps(cell.column.id)}
                          className={cn(
                            rowHeightClass,
                            "py-0",
                            cell.column.columnDef.meta?.className,
                            stickyCellClass(cell.column.id)
                          )}
                          style={stickyCellStyle(cell.column.id, sizeStyle)}
                        >
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                  {canLoadMore || loadingMore ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={columns.length} className="h-10 p-0">
                        <div
                          ref={loadMoreRef}
                          className="flex h-10 items-center justify-center"
                        >
                          <Spinner className="size-3.5 text-muted-foreground" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : null}
                </>
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-56 p-0">
                    <Empty className="border-0 py-12">
                      <EmptyHeader className="gap-1.5">
                        <EmptyTitle className="text-[0.875rem] font-[550] text-[#303030]">
                          {emptyTitle}
                        </EmptyTitle>
                        <EmptyDescription className="text-[0.8125rem] font-[450] text-[#616161]">
                          {emptyDescription}
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {showCountBar || showPager ? (
        <div className="flex items-center justify-between gap-2">
          {showSelectionCount ? (
            <p className="text-xs text-muted-foreground">
              {loading ? (
                <span className="inline-flex items-center gap-1.5">
                  <Spinner className="size-3" /> Loading…
                </span>
              ) : (
                <>
                  {table.getFilteredSelectedRowModel().rows.length} of{" "}
                  {table.getFilteredRowModel().rows.length} row(s) selected
                </>
              )}
            </p>
          ) : (
            <div />
          )}
          {showPager ? (
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.previousPage()}
                disabled={!table.getCanPreviousPage() || loading}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => table.nextPage()}
                disabled={!table.getCanNextPage() || loading}
              >
                Next
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
