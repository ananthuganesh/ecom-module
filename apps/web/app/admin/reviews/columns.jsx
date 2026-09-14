"use client";

import { AdminStatusText } from "@/components/admin/list";
import { Checkbox } from "@/components/ui/checkbox";
import StarRating from "@/components/storefront/StarRating";
import { ADMIN_TIME_ZONE } from "@/utils/formatAdminDateTime";

export const REVIEW_STATUS_LABELS = {
  published: "Published",
  hidden: "Hidden",
};

const REVIEW_STATUS_TONES = {
  published: "success",
  hidden: "neutral",
};

export function isMutedReviewRow(row) {
  return String(row?.status || "").toLowerCase() === "hidden";
}

function shortDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: ADMIN_TIME_ZONE,
  });
}

function meta({ widthClass, sticky }) {
  return {
    ...(widthClass ? { className: widthClass } : {}),
    ...(sticky ? { sticky } : {}),
  };
}

function selectColumn({ widthClass = "w-10", size = 40, sticky } = {}) {
  return {
    id: "select",
    size,
    meta: meta({ widthClass, sticky }),
    enableSorting: false,
    enableHiding: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected()}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        onClick={(e) => e.stopPropagation()}
      />
    ),
    cell: ({ row }) => (
      <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(value) => row.toggleSelected(!!value)}
          aria-label="Select row"
        />
      </div>
    ),
  };
}

function productColumn({ widthClass, size, sticky } = {}) {
  return {
    id: "product",
    size,
    meta: meta({ widthClass, sticky }),
    accessorFn: (row) => row.productName || "",
    header: "Product",
    cell: ({ row }) => {
      const { productName, productSlug, productId } = row.original;
      return (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          <a
            href={`/product/${productSlug || productId}#reviews`}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-[13px] font-[550] text-[#005bd3] hover:underline"
          >
            {productName || "Deleted product"}
          </a>
        </div>
      );
    },
  };
}

function ratingColumn({ widthClass, size } = {}) {
  return {
    id: "rating",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => Number(row.rating || 0),
    header: "Rating",
    cell: ({ row }) => <StarRating rating={row.original.rating} size={13} className="text-amber-500" />,
  };
}

function reviewColumn({ widthClass, size } = {}) {
  return {
    id: "review",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => `${row.title || ""} ${row.body || ""}`,
    header: "Review",
    cell: ({ row }) => {
      const { title, body } = row.original;
      return (
        <span className="block truncate text-[13px] text-foreground" title={body || title || ""}>
          {title ? <span className="font-[550]">{title}</span> : null}
          {title && body ? " — " : ""}
          <span className="text-muted-foreground">{body || (title ? "" : "No written review")}</span>
        </span>
      );
    },
  };
}

function authorColumn({ widthClass, size } = {}) {
  return {
    id: "author",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.authorName || "",
    header: "Customer",
    cell: ({ row }) => (
      <span className="block truncate text-[13px] text-foreground">
        {row.original.authorName || "—"}
        {row.original.size ? (
          <span className="text-muted-foreground"> · {row.original.size}</span>
        ) : null}
      </span>
    ),
  };
}

function statusColumn({ widthClass, size } = {}) {
  return {
    id: "status",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.status || "",
    header: "Status",
    cell: ({ row }) => {
      const status = String(row.original.status || "published").toLowerCase();
      return (
        <AdminStatusText tone={REVIEW_STATUS_TONES[status] || "neutral"} dot solid>
          {REVIEW_STATUS_LABELS[status] || status}
        </AdminStatusText>
      );
    },
  };
}

function dateColumn({ widthClass, size } = {}) {
  return {
    id: "date",
    size,
    meta: meta({ widthClass }),
    accessorFn: (row) => row.createdAt || "",
    header: "Date",
    cell: ({ row }) => (
      <span className="block truncate text-[13px] text-muted-foreground">
        {shortDate(row.original.createdAt)}
      </span>
    ),
  };
}

export function createReviewColumns() {
  const stickyLead = { sticky: "left" };
  return [
    selectColumn({ widthClass: "w-10", size: 40, ...stickyLead }),
    productColumn({ widthClass: "w-[180px]", size: 180, ...stickyLead }),
    ratingColumn({ widthClass: "w-[100px]", size: 100 }),
    reviewColumn({ widthClass: "w-[340px]", size: 340 }),
    authorColumn({ widthClass: "w-[150px]", size: 150 }),
    statusColumn({ widthClass: "w-[110px]", size: 110 }),
    dateColumn({ widthClass: "w-[90px]", size: 90 }),
  ];
}
