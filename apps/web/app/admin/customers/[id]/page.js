"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Bell, BellOff, Copy, Check, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { adminUserService } from "@/api";
import { Users } from "@/components/admin/LocalIcons";
import {
  AdminHeaderButton,
  AdminStatusText,
} from "@/components/admin/list";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { displayCustomerName } from "@/utils/displayCustomerName";
import { formatINR } from "@/utils/formatINR";
import { formatPhone } from "@/utils/formatPhone";
import {
  formatAdminDate,
  formatAdminDateTime,
  parseAdminDate,
} from "@/utils/formatAdminDateTime";
import { formatOrderNumber, adminOrderHref } from "@/utils/formatOrderNumber";
import {
  adminCustomerHref,
  customerUrlKey,
} from "@/utils/formatCustomerUrl";
import {
  paymentLabel,
  paymentTone,
  resolveFulfillmentDisplay,
} from "@/app/admin/orders/columns";
import { customerPhone } from "../columns";

function ContactCopyLine({ value, display }) {
  const [copied, setCopied] = useState(false);
  const shown = display ?? value;
  if (!shown || shown === "—") {
    return <p className="admin-card-muted">—</p>;
  }

  const copy = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(String(value || shown));
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      title="Copy"
      className="group flex max-w-full items-center gap-1.5 text-left outline-none"
    >
      <span className="admin-card-link min-w-0 truncate group-hover:underline">
        {shown}
      </span>
      <span className="inline-flex size-4 shrink-0 items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
        {copied ? (
          <Check className="size-3 text-[#047b5d]" aria-hidden />
        ) : (
          <Copy className="size-3 text-[#8a8a8a]" aria-hidden />
        )}
      </span>
    </button>
  );
}

function pickPhone(...sources) {
  for (const src of sources) {
    if (src == null || src === "") continue;
    if (typeof src !== "object") {
      const text = String(src).trim();
      if (text && text !== "—") return text;
      continue;
    }
    for (const key of ["phone", "contact", "mobile", "mobileNumber"]) {
      const text = String(src[key] || "").trim();
      if (text && text !== "—") return text;
    }
  }
  return "";
}

function formatAddrLines(addr = {}) {
  return {
    name:
      [addr.firstName, addr.lastName].filter(Boolean).join(" ").trim() ||
      addr.fullName ||
      addr.name ||
      "",
    street: addr.address || addr.house || addr.street || "",
    address2: addr.address2 || "",
    city: addr.city || "",
    state: addr.state || "",
    zipCode: addr.postalCode || addr.zip || addr.pincode || addr.zipCode || "",
    country: addr.country || "",
    phone: pickPhone(addr),
  };
}

function renderAddressBlock(addr, emptyLabel) {
  if (!addr?.street && !addr?.city) {
    return <p className="admin-card-muted">{emptyLabel}</p>;
  }
  return (
    <div className="space-y-0.5 admin-card-muted">
      {addr.name ? <p className="mb-1 font-medium">{addr.name}</p> : null}
      {addr.street ? <p>{addr.street}</p> : null}
      {addr.address2 ? <p>{addr.address2}</p> : null}
      <p>{[addr.city, addr.state, addr.zipCode].filter(Boolean).join(", ")}</p>
      {addr.country ? <p className="pt-1">{addr.country}</p> : null}
      {addr.phone ? <p className="mt-2">{formatPhone(addr.phone)}</p> : null}
    </div>
  );
}

function customerOrderColumns() {
  return [
    {
      id: "order",
      accessorFn: (row) => formatOrderNumber(row) || row._id,
      header: "Order",
      size: 110,
      cell: ({ row }) => (
        <Link
          href={adminOrderHref(row.original)}
          onClick={(e) => e.stopPropagation()}
          className="block truncate text-[13px] font-medium text-[#005bd3] hover:underline"
        >
          {formatOrderNumber(row.original) || "Order"}
        </Link>
      ),
    },
    {
      id: "date",
      accessorFn: (row) => row.createdAt || "",
      header: "Date",
      cell: ({ row }) => (
        <span className="block truncate text-[13px] text-muted-foreground">
          {formatAdminDateTime(row.original.createdAt)}
        </span>
      ),
    },
    {
      id: "payment",
      accessorFn: (row) =>
        row.paymentStatus || row.transactionDetails?.paymentStatus || "",
      header: "Payment",
      cell: ({ row }) => {
        const status =
          row.original.paymentStatus ||
          row.original.transactionDetails?.paymentStatus ||
          "pending";
        return (
          <AdminStatusText tone={paymentTone(status)} dot>
            {paymentLabel(status)}
          </AdminStatusText>
        );
      },
    },
    {
      id: "fulfillment",
      accessorFn: (row) => resolveFulfillmentDisplay(row).label,
      header: "Fulfillment",
      cell: ({ row }) => {
        const fulfillment = resolveFulfillmentDisplay(row.original);
        return (
          <AdminStatusText tone={fulfillment.tone} dot solid>
            {fulfillment.label}
          </AdminStatusText>
        );
      },
    },
    {
      id: "total",
      accessorFn: (row) => Number(row.finalPrice) || 0,
      header: () => <div className="text-right">Total</div>,
      size: 96,
      cell: ({ row }) => (
        <div className="text-right text-[13px] font-medium tabular-nums">
          {formatINR(row.original.finalPrice)}
        </div>
      ),
    },
  ];
}

export default function AdminCustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerRef = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [customer, setCustomer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [neighbors, setNeighbors] = useState({ previous: null, next: null });
  const columns = useMemo(() => customerOrderColumns(), []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const [data, nav] = await Promise.all([
          adminUserService.getUserById(customerRef),
          adminUserService.getNeighbors(customerRef).catch(() => ({
            previous: null,
            next: null,
          })),
        ]);
        if (cancelled) return;
        setCustomer(data);
        setNeighbors({
          previous: nav?.previous || null,
          next: nav?.next || null,
        });
        const key = customerUrlKey(data);
        if (key && String(customerRef) !== key) {
          router.replace(adminCustomerHref(data));
        }
        try {
          const list = await adminUserService.getUserOrders(key || customerRef);
          if (!cancelled) {
            setOrders(Array.isArray(list) ? list : []);
          }
        } catch {
          if (!cancelled) setOrders([]);
        }
      } catch {
        if (!cancelled) {
          setCustomer(null);
          setNeighbors({ previous: null, next: null });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    if (customerRef) load();
    return () => {
      cancelled = true;
    };
  }, [customerRef, router]);

  const name = displayCustomerName(customer, "Customer");
  const subscribed = Boolean(
    customer?.emailSubscribed || customer?.whatsappSubscribed
  );
  const ordersCount = Number(customer?.ordersCount || 0);
  const abandonedCount = Number(customer?.abandonedCount || 0);
  const amountSpent = Number(customer?.amountSpent || 0);
  const customerId = customerUrlKey(customer);
  const ordersHref = customerId
    ? `/admin/orders?q=${encodeURIComponent(`customer_id:"${customerId}"`)}`
    : "/admin/orders";
  const visibleOrders = useMemo(
    () =>
      (orders || []).filter(
        (order) => String(order.status || "").toLowerCase() !== "abandoned"
      ),
    [orders]
  );
  const shipping = useMemo(() => {
    const list = Array.isArray(customer?.addresses) ? customer.addresses : [];
    const saved = list.find((a) => a.isDefault) || list[0];
    const latestOrder = visibleOrders.find(
      (o) =>
        o.shippingAddress ||
        o.customerDetails ||
        o.transactionDetails?.customerDetails
    );
    const latest = latestOrder?.shippingAddress;
    const fromSaved = saved
      ? formatAddrLines({
          ...saved,
          name: saved.name || name,
        })
      : null;
    const fromOrder = latest ? formatAddrLines(latest) : null;
    const base =
      fromSaved?.street || fromSaved?.city
        ? fromSaved
        : fromOrder?.street || fromOrder?.city
          ? fromOrder
          : fromSaved || {
              name,
              street: "",
              city: "",
              state: "",
              zipCode: "",
              country: "",
              phone: "",
              address2: "",
            };
    if (pickPhone(base)) return base;
    const orderPhone = pickPhone(
      latest,
      latestOrder?.customerDetails,
      latestOrder?.transactionDetails?.customerDetails
    );
    return orderPhone ? { ...base, phone: orderPhone } : base;
  }, [customer, name, visibleOrders]);
  const lastOrder = useMemo(() => {
    if (!visibleOrders.length) return null;
    return visibleOrders.reduce((latest, order) => {
      const next = parseAdminDate(order.createdAt)?.getTime() || 0;
      const prev = parseAdminDate(latest?.createdAt)?.getTime() || 0;
      return next > prev ? order : latest;
    }, visibleOrders[0]);
  }, [visibleOrders]);
  const phone = pickPhone(
    customer,
    customer ? customerPhone(customer) : "",
    shipping
  );
  const abandonedHref = `/admin/orders/abandoned?q=${encodeURIComponent(
    String(customer?.email || "").trim() ||
      phone ||
      name ||
      customerId ||
      ""
  )}`;

  const handleDelete = async () => {
    if (!customer || ordersCount > 0 || deleting) return;
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await adminUserService.deleteUser(customer._id || customerId);
      toast.success("Customer deleted");
      router.push("/admin/customers");
    } catch (error) {
      toast.error(
        error.response?.data?.detail ||
          error.response?.data?.message ||
          "Could not delete customer"
      );
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Spinner className="size-8 text-muted-foreground" />
      </div>
    );
  }

  if (!customer) {
    return (
      <main className="flex min-h-[40vh] flex-col items-center justify-center bg-background p-10">
        <Users className="mb-4 h-12 w-12 text-muted-foreground/40" />
        <p className="text-sm font-medium text-muted-foreground">
          Customer not found
        </p>
        <Link
          href="/admin/customers"
          className="mt-6 border-b border-primary pb-1 text-xs font-medium text-primary"
        >
          Return to customers
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col gap-4 overflow-y-auto bg-background md:gap-6">
      <header className="sticky top-0 z-20 flex shrink-0 flex-col gap-3 bg-transparent py-0 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <Users active className="size-[18px] shrink-0 text-[#303030]" />
          <h2 className="admin-page-title m-0 truncate text-[1.25rem] font-[650] leading-6 tracking-[-0.00833em] text-[#303030]">
            {name}
          </h2>
          <AdminStatusText
            tone={subscribed ? "success" : "neutral"}
            icon={subscribed ? Bell : BellOff}
          >
            {subscribed ? "Subscribed" : "Unsubscribed"}
          </AdminStatusText>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {ordersCount === 0 ? (
            <AdminHeaderButton onClick={handleDelete} disabled={deleting}>
              <Trash2 className="h-3.5 w-3.5" />
              {deleting ? "Deleting…" : "Delete"}
            </AdminHeaderButton>
          ) : null}
          <div className="ml-1 inline-flex items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              title="Previous customer"
              disabled={!neighbors.previous}
              className="size-8 rounded-lg border-transparent bg-[#e3e3e3] text-[#303030] shadow-none hover:bg-[#d4d4d4] active:bg-[#ccc]"
              onClick={() => {
                if (!neighbors.previous) return;
                router.push(
                  `/admin/customers/${encodeURIComponent(neighbors.previous.key)}`
                );
              }}
            >
              <ChevronUp strokeWidth={1.75} />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              title="Next customer"
              disabled={!neighbors.next}
              className="size-8 rounded-lg border-transparent bg-[#e3e3e3] text-[#303030] shadow-none hover:bg-[#d4d4d4] active:bg-[#ccc]"
              onClick={() => {
                if (!neighbors.next) return;
                router.push(
                  `/admin/customers/${encodeURIComponent(neighbors.next.key)}`
                );
              }}
            >
              <ChevronDown strokeWidth={1.75} />
            </Button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 items-start gap-4 pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <Card className="@container/card min-w-0">
          <CardHeader>
            <CardTitle>Orders</CardTitle>
            <CardDescription>
              {ordersCount} {ordersCount === 1 ? "order" : "orders"} ·{" "}
              {formatINR(amountSpent)} spent
            </CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <DataTable
              columns={columns}
              data={visibleOrders}
              pageSize={10}
              showFooter={visibleOrders.length > 10}
              showToolbar={false}
              showColumnsMenu={false}
              emptyTitle="No orders yet"
              emptyDescription="Orders from this customer will show up here."
              onRowClick={(order) => router.push(adminOrderHref(order))}
              rowHeightClass="h-10"
            />
          </CardContent>
        </Card>

        <aside className="flex flex-col gap-4">
          <Card className="@container/card gap-0 py-0">
            <CardContent className="flex flex-col gap-4 p-4">
              <div>
                <CardTitle className="admin-card-heading mb-2">
                  Customer
                </CardTitle>
                <p className="admin-card-link leading-tight">{name}</p>
                <Link
                  href={ordersHref}
                  className="mt-1 block admin-card-link hover:underline"
                >
                  {ordersCount} {ordersCount === 1 ? "order" : "orders"}
                </Link>
                <Link
                  href={abandonedHref}
                  className="mt-1 block admin-card-link hover:underline"
                >
                  {abandonedCount}{" "}
                  {abandonedCount === 1 ? "abandoned cart" : "abandoned carts"}
                </Link>
              </div>

              <div>
                <CardTitle className="admin-card-heading mb-2">
                  Contact information
                </CardTitle>
                <div className="space-y-1.5">
                  <ContactCopyLine value={customer.email || ""} />
                  <ContactCopyLine
                    value={phone}
                    display={formatPhone(phone) || phone}
                  />
                </div>
              </div>

              <div>
                <CardTitle className="admin-card-heading mb-2">
                  Shipping address
                </CardTitle>
                <div className="admin-card-muted leading-relaxed">
                  {renderAddressBlock(shipping, "No shipping address")}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="@container/card gap-0 py-0">
            <CardContent className="flex flex-col gap-4 p-4">
              <div className="space-y-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="admin-card-muted">Total orders</span>
                  <Link
                    href={ordersHref}
                    className="text-[15px] font-[650] tabular-nums leading-5 tracking-[-0.01em] text-[#303030] hover:underline"
                  >
                    {ordersCount}
                  </Link>
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="admin-card-muted">Total spent</span>
                  <span className="text-[15px] font-[650] tabular-nums leading-5 tracking-[-0.01em] text-[#303030]">
                    {formatINR(amountSpent)}
                  </span>
                </div>
              </div>

              <div className="space-y-2 border-t border-[#ebebeb] pt-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="admin-card-muted">Last order</span>
                  {lastOrder ? (
                    <Link
                      href={adminOrderHref(lastOrder)}
                      className="admin-card-link shrink-0 tabular-nums hover:underline"
                    >
                      {formatAdminDate(lastOrder.createdAt) || "—"}
                    </Link>
                  ) : (
                    <span className="admin-card-muted">—</span>
                  )}
                </div>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="admin-card-muted">Abandoned carts</span>
                  <Link
                    href={abandonedHref}
                    className="admin-card-link shrink-0 tabular-nums hover:underline"
                  >
                    {abandonedCount}
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </main>
  );
}
