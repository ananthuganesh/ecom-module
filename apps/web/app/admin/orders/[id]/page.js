"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { adminOrderService, adminErpService, adminShippingService, paymentService, adminCompanyProfileService, adminTaxClassService } from "@/api";
import { Package, ChevronUp, ChevronDown, RefreshCw, RotateCcw, Copy, Check, ShoppingBag as OrderIcon, X, Archive } from "lucide-react";
import SafeImage from "@/components/SafeImage";
import {
  buildOrderTimeline,
  formatTimelineTime,
  groupTimelineByDay,
  touchesEqual,
} from "@/lib/orderTimeline";
import { toast } from "sonner";
import { printHtml } from "@/utils/printHtml";
import { printPdfBlob } from "@/utils/printPdfBlob";
import { buildInvoicePrintHtml } from "@/utils/buildInvoicePrintHtml";
import { gstRateForUnitPrice, roundMoney, splitInclusiveGst } from "@/utils/gstRate";
import { displayCustomerName } from "@/utils/displayCustomerName";
import { formatOrderNumber, adminOrderHref, orderUrlKey } from "@/utils/formatOrderNumber";
import { formatINR } from "@/utils/formatINR";
import { formatPhone } from "@/utils/formatPhone";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AdminStatusText, AdminHeaderButton } from "@/components/admin/list";
import { paymentLabel, paymentTone, resolveFulfillmentDisplay } from "@/app/admin/orders/columns";
import {
  Card,
  CardContent,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

const ORDER_STATUSES = [
  "order placed", "abandoned", "processing", "shipped", "out for delivery", 
  "delivered", "return requested", "returned", "cancelled"
];

const ORDER_STATUS_LABELS = {
  "order placed": "Unfulfilled",
  abandoned: "Abandoned",
  processing: "Processing",
  shipped: "Packed",
  "out for delivery": "Out for delivery",
  delivered: "Delivered",
  "return requested": "Return requested",
  returned: "Returned",
  cancelled: "Cancelled",
};

function AttributionTouchRows({ touch }) {
  if (!touch) return <p className="text-[13px] font-medium text-muted-foreground">Direct / none</p>;
  const rows = [
    ["Source", touch.source],
    ["Medium", touch.medium],
    ["Campaign", touch.campaign],
    ["Content", touch.content],
    ["Term", touch.term],
    ["gclid", touch.gclid],
    ["fbclid", touch.fbclid],
  ].filter(([, v]) => v);
  return (
    <div className="space-y-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-3 text-[13px] font-medium">
          <span className="text-muted-foreground shrink-0">{label}</span>
          <span className="text-foreground text-right break-all">{value}</span>
        </div>
      ))}
    </div>
  );
}

function computeInvoiceGstBreakdown(order, items, _taxClasses, invoice) {
  const total = roundMoney(
    invoice?.grandTotal ?? order?.finalPrice ?? order?.total ?? 0
  );

  // Line-level apparel slabs: ≤ ₹2,500 → 5%, above → 18%
  const sourceItems =
    Array.isArray(invoice?.items) && invoice.items.length
      ? invoice.items.map((line) => ({
          price: Number(line.unitPrice || 0),
          quantity: Number(line.quantity || 0),
        }))
      : (items || []).map((item) => ({
          price: Number(item.price || item.unitPrice || 0),
          quantity: Number(item.quantity || item.qty || 0),
        }));

  let taxable = 0;
  let gst = 0;
  const rates = new Set();
  for (const line of sourceItems) {
    const unit = Number(line.price) || 0;
    const qty = Number(line.quantity) || 0;
    if (unit <= 0 || qty <= 0) continue;
    const rate = gstRateForUnitPrice(unit);
    rates.add(rate);
    const split = splitInclusiveGst(unit * qty, rate);
    taxable += split.taxable;
    gst += split.gst;
  }

  if (gst > 0) {
    const rateLabel =
      rates.size === 1 ? [...rates][0] : rates.size > 1 ? "mixed" : 0;
    return {
      taxable: roundMoney(taxable),
      gst: roundMoney(gst),
      total: total || roundMoney(taxable + gst),
      rate: rateLabel,
    };
  }

  const invGst = roundMoney(
    invoice?.taxTotal != null
      ? invoice.taxTotal
      : Number(invoice?.cgst || 0) +
          Number(invoice?.sgst || 0) +
          Number(invoice?.igst || 0)
  );
  const invTaxable = invoice?.subtotal != null ? roundMoney(invoice.subtotal) : null;
  if (invGst > 0 && invTaxable != null && invTaxable < total) {
    return {
      taxable: invTaxable,
      gst: invGst,
      total,
      rate: invTaxable > 0 ? Math.round((invGst / invTaxable) * 100) : 0,
    };
  }

  return { taxable: total, gst: 0, total, rate: 0 };
}

/** Instrument detail when Razorpay provided it (UPI / Card / Netbanking). */
function formatInstrumentLabel(order) {
  const td = order?.transactionDetails || {};
  if (td.instrumentDisplay) return td.instrumentDisplay;
  if (td.instrumentLabel) {
    return td.instrumentDetail
      ? `${td.instrumentLabel} · ${td.instrumentDetail}`
      : td.instrumentLabel;
  }
  return null;
}

function formatOrderDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const datePart = d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const timePart = d
    .toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })
    .toLowerCase();
  return `${datePart} at ${timePart}`;
}

function CopyableValue({ value, uppercase = false }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="text-foreground">—</span>;
  const text = uppercase ? String(value).toUpperCase() : String(value);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      toast.success("Copied");
      setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error("Could not copy");
    }
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={copy}
      title="Copy"
      className="group h-auto max-w-full gap-1.5 px-1 py-0.5 text-left justify-start font-normal hover:bg-transparent"
    >
      <span className="admin-card-muted break-all">{text}</span>
      {copied ? (
        <Check className="size-3 text-emerald-600 shrink-0" />
      ) : (
        <Copy className="size-3 text-muted-foreground/50 group-hover:text-muted-foreground shrink-0" />
      )}
    </Button>
  );
}

/** Contact line: hover reveals copy icon; click copies value. */
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

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [order, setOrder] = useState(null);
  const [invoice, setInvoice] = useState(null);
  const [taxClasses, setTaxClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [invoiceLoading, setInvoiceLoading] = useState(false);
  const [isPrintingInvoice, setIsPrintingInvoice] = useState(false);
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);
  const [fulfillLoading, setFulfillLoading] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundLoading, setRefundLoading] = useState(false);
  const [neighbors, setNeighbors] = useState({ previous: null, next: null });

  const loadInvoice = async (orderId) => {
    const inv = await adminErpService.salesInvoices.byOrder(orderId);
    setInvoice(inv || null);
  };

  useEffect(() => {
    let cancelled = false;
    adminTaxClassService
      .getAll()
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.taxClasses || data?.items || [];
        setTaxClasses(list);
      })
      .catch(() => {
        if (!cancelled) setTaxClasses([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fetchOrder = async () => {
      setLoading(true);
      try {
        const data = await adminOrderService.getById(params.id);
        setOrder(data);
        const key = orderUrlKey(data);
        if (key && String(params.id) !== key) {
          router.replace(adminOrderHref(data));
        }
        await loadInvoice(key || params.id);
        try {
          const nav = await adminOrderService.getNeighbors(key || params.id);
          setNeighbors({
            previous: nav?.previous || null,
            next: nav?.next || null,
          });
        } catch {
          setNeighbors({ previous: null, next: null });
        }
      } catch (e) {
        console.error(e);
        toast.error("Failed to load order");
      } finally {
        setLoading(false);
      }
    };
    if (params.id) fetchOrder();
  }, [params.id]);

  const ensureInvoice = async ({ silent = false } = {}) => {
    if (!order) return null;
    if (invoice) return invoice;
    setInvoiceLoading(true);
    try {
      const inv = await adminErpService.salesInvoices.fromOrder(order._id);
      setInvoice(inv);
      setOrder((prev) =>
        prev
          ? { ...prev, invoiceId: inv._id, invoiceNumber: inv.number }
          : prev
      );
      if (!silent) {
        toast.success(inv.isGstInvoice ? "GST invoice created" : "Invoice created");
      }
      return inv;
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Invoice failed");
      return null;
    } finally {
      setInvoiceLoading(false);
    }
  };

  const handlePrintInvoice = async () => {
    if (!order || isPrintingInvoice) return;
    setIsPrintingInvoice(true);
    try {
      const inv = invoice || (await ensureInvoice({ silent: true }));
      if (!inv && !(order.items || []).length) {
        toast.error("No invoice to print");
        return;
      }
      let company = {};
      try {
        company = (await adminCompanyProfileService.get()) || {};
      } catch {
        /* use defaults in builder */
      }
      let classes = taxClasses;
      if (!classes.length) {
        try {
          const data = await adminTaxClassService.getAll();
          classes = Array.isArray(data) ? data : data?.taxClasses || data?.items || [];
        } catch {
          classes = [];
        }
      }
      const html = buildInvoicePrintHtml({
        order,
        invoice: inv,
        taxClasses: classes,
        company: {
          name: company.tradeName || company.legalName || "Urban Aana",
          legalName: company.legalName,
          tradeName: company.tradeName,
          gstin: company.gstin,
          phone: company.phone,
          email: company.email,
          website: company.website || company.siteUrl,
          addressLine1: company.addressLine1,
          addressLine2: company.addressLine2,
          city: company.city,
          stateName: company.stateName,
          pincode: company.pincode,
          country: company.country || "India",
          stateCode: company.stateCode,
          stateName: company.stateName,
        },
      });
      await printHtml(html, {
        title: inv?.number || order?.invoiceNumber || order.orderNumber || "invoice",
      });
      toast.success("Print dialog opened");
    } catch (err) {
      toast.error(err?.message || "Invoice print failed");
    } finally {
      setIsPrintingInvoice(false);
    }
  };

  const handleStatusChange = async (newStatus) => {
    if (!order || !ORDER_STATUSES.includes(newStatus)) return;
    setUpdating(true);
    try {
      const updated = await adminOrderService.updateStatus(order._id, newStatus);
      setOrder((prev) =>
        prev
          ? {
              ...prev,
              ...(updated || {}),
              status: updated?.status || newStatus,
              shippingStatus: updated?.shippingStatus ?? prev.shippingStatus,
            }
          : null
      );
      toast.success(`Order set to ${ORDER_STATUS_LABELS[newStatus] || newStatus}`);
    } catch (e) {
      console.error(e);
      toast.error("Status update failed");
    } finally {
      setUpdating(false);
    }
  };

  const handleMarkFulfilled = async () => {
    if (!order || fulfillLoading) return;
    if (order.awbCode || order.awb) {
      toast.message("DTDC consignment already booked");
      return;
    }
    setFulfillLoading(true);
    try {
      const response = await adminShippingService.createShipment(order._id);
      if (response?.order) {
        setOrder(response.order);
      }
      toast.success("DTDC consignment booked");
    } catch (e) {
      console.error(e);
      const msg =
        e.response?.data?.detail || e.message || "DTDC booking failed";
      toast.error(typeof msg === "string" ? msg : "DTDC booking failed");
    } finally {
      setFulfillLoading(false);
    }
  };

  const handlePrintLabel = async () => {
    if (!order || isPrintingLabel) return;
    const awb = order.awbCode || order.awb;
    if (!awb) {
      toast.error("No DTDC label yet — mark as fulfilled first");
      return;
    }
    setIsPrintingLabel(true);
    try {
      const blob = await adminShippingService.downloadLabel(order._id);
      if (!(blob instanceof Blob) || blob.type?.includes("json")) {
        let detail = "Could not download shipping label";
        try {
          const text = await blob.text();
          const parsed = JSON.parse(text);
          if (parsed?.detail) detail = String(parsed.detail);
        } catch {
          /* ignore */
        }
        toast.error(detail);
        return;
      }
      await printPdfBlob(blob, { filename: `label-${awb}.pdf` });
      toast.success("Print dialog opened");
      // Label print may advance shippingStatus to Ready To Ship
      try {
        const refreshed = await adminOrderService.getById(order._id);
        if (refreshed) setOrder(refreshed);
      } catch {
        /* ignore */
      }
    } catch (e) {
      console.error(e);
      const msg = e.response?.data?.detail || e.message || "Label print failed";
      toast.error(typeof msg === "string" ? msg : "Label print failed");
    } finally {
      setIsPrintingLabel(false);
    }
  };

  const handlePaymentStatusUpdate = async (paymentStatus) => {
    if (!order) return;
    setUpdating(true);
    try {
      await adminOrderService.updatePaymentStatus(order._id, paymentStatus);
      setOrder((prev) => (prev ? { 
        ...prev, 
        transactionDetails: { ...(prev.transactionDetails || {}), paymentStatus }
      } : null));
      toast.success(`Payment set to ${paymentStatus}`);
    } catch (e) {
      console.error(e);
      toast.error("Payment update failed");
    } finally {
      setUpdating(false);
    }
  };

  const handleReturn = async (action) => {
    if (!order) return;
    setUpdating(true);
    try {
      await adminOrderService.handleReturn(order._id, action);
      const newStatus = action === "approve" ? "returned" : "delivered";
      setOrder((prev) => (prev ? { ...prev, status: newStatus } : null));
      toast.success(`Return ${action}ed`);
    } catch (e) {
      console.error(e);
      toast.error("Return processing failed");
    } finally {
      setUpdating(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!order) return;
    if (String(order.status || "").toLowerCase() === "cancelled") {
      toast.message("Order is already cancelled");
      return;
    }
    if (
      !confirm(
        "Cancel this order? Status becomes Cancelled and stock is restored if it was committed."
      )
    ) {
      return;
    }
    await handleStatusChange("cancelled");
  };

  const handleArchiveOrder = async () => {
    if (!order) return;
    const next = !order.archived;
    setUpdating(true);
    try {
      const updated = await adminOrderService.archive(order._id, next);
      setOrder((prev) =>
        prev ? { ...prev, ...(updated || {}), archived: updated?.archived ?? next } : null
      );
      toast.success(next ? "Order archived" : "Order unarchived");
    } catch (e) {
      console.error(e);
      toast.error(e.response?.data?.detail || e.message || "Archive failed");
    } finally {
      setUpdating(false);
    }
  };

  const openRefundModal = () => {
    if (!order) return;
    const total = Number(order.finalPrice ?? order.total ?? 0);
    const already = Number(order.refundedAmount || order.transactionDetails?.refundedAmount || 0);
    const remaining = Math.max(0, total - already);
    setRefundAmount(remaining ? remaining.toFixed(2) : "");
    setRefundReason("");
    setRefundOpen(true);
  };

  const handleRefund = async () => {
    if (!order) return;
    const amount = Number(refundAmount);
    if (!amount || amount <= 0) {
      toast.error("Enter a valid refund amount");
      return;
    }
    setRefundLoading(true);
    try {
      const res = await paymentService.refund({
        localOrderId: order._id,
        amount,
        reason: refundReason || "Admin refund",
      });
      setOrder(res.order);
      setRefundOpen(false);
      toast.success(
        res.order?.paymentStatus === "refunded"
          ? "Full refund processed"
          : `Refunded ₹${amount.toFixed(2)}`
      );
    } catch (e) {
      const msg = e.response?.data?.detail || e.response?.data?.message || e.message || "Refund failed";
      toast.error(typeof msg === "string" ? msg : "Refund failed");
    } finally {
      setRefundLoading(false);
    }
  };

  if (loading) return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Spinner className="size-8 text-muted-foreground" />
    </div>
  );

  if (!order) return (
    <main className="h-screen p-10 flex flex-col items-center justify-center bg-background">
      <Package className="w-12 h-12 text-muted-foreground/40 mb-4" />
      <p className="text-sm font-medium text-muted-foreground">Order Not Found</p>
      <Link href="/admin/orders" className="mt-6 text-xs font-medium text-primary border-b border-primary pb-1">Return to Archive</Link>
    </main>
  );

  const customer = order.customerId || {};
  const customerPublicId =
    customer.customerUrlId || customer._id || customer.id || null;
  const customerOrdersCount = Number(customer.ordersCount || 0);
  const customerOrdersHref = customerPublicId
    ? `/admin/orders?q=${encodeURIComponent(`customer_id:"${customerPublicId}"`)}`
    : null;
  const items = order.items || [];
  
  // Use order-specific shipping / billing addresses
  const shippingAddr = order.shippingAddress || {};
  const formatAddrLines = (addr) => ({
    name: addr.name || "",
    street: addr.address || addr.house || "",
    address2: addr.address2 || "",
    city: addr.city || "",
    state: addr.state || "",
    zipCode: addr.postalCode || addr.zip || "",
    country: addr.country || "",
    phone: addr.phone || "",
  });
  const shipping = formatAddrLines(shippingAddr);

  const renderAddressBlock = (addr, emptyLabel) => {
    if (!addr.street && !addr.city) {
      return <p className="admin-card-muted">{emptyLabel}</p>;
    }
    return (
      <div className="space-y-0.5 admin-card-muted">
        {addr.name ? (
          <p className="mb-1 font-medium">{addr.name}</p>
        ) : null}
        {addr.street ? <p>{addr.street}</p> : null}
        {addr.address2 ? <p>{addr.address2}</p> : null}
        <p>
          {[addr.city, addr.state, addr.zipCode].filter(Boolean).join(", ")}
        </p>
        {addr.country ? <p className="pt-1">{addr.country}</p> : null}
        {addr.phone ? (
          <p className="mt-2">{formatPhone(addr.phone)}</p>
        ) : null}
      </div>
    );
  };

  const timelineSteps = order ? buildOrderTimeline(order) : [];
  const firstTouch = order?.attribution?.firstTouch || null;
  const lastTouch = order?.attribution?.lastTouch || null;
  const sameTouch = touchesEqual(firstTouch, lastTouch);

  const {
    taxable: invoiceTaxable,
    gst: invoiceGstAmount,
    total: invoiceTotal,
  } = computeInvoiceGstBreakdown(order, items, taxClasses, invoice);
  const payStatus = String(
    order.paymentStatus || order.transactionDetails?.paymentStatus || ""
  ).toLowerCase();
  const fulfillment = resolveFulfillmentDisplay(order);
  const isCancelled = String(order.status || "").toLowerCase() === "cancelled";

  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[90rem] flex-1 flex-col overflow-y-auto bg-background">
      {/* Action Header */}
      <header className="px-4 py-3 flex justify-between items-center gap-3 shrink-0 z-20 bg-transparent sticky top-0 backdrop-blur-sm">
        <div className="flex items-center gap-3 min-w-0">
          <span className="inline-flex items-center justify-center w-8 h-8 shrink-0 text-foreground">
            <OrderIcon className="w-5 h-5" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[16px] leading-5 font-medium text-foreground truncate m-0">
                {formatOrderNumber(order) || "Order"}
              </p>
              <AdminStatusText tone={paymentTone(payStatus)} dot>
                {paymentLabel(payStatus)}
              </AdminStatusText>
              <AdminStatusText tone={fulfillment.tone} dot solid>
                {fulfillment.label}
              </AdminStatusText>
              {order.archived ? (
                <AdminStatusText tone="neutral" dot>
                  Archived
                </AdminStatusText>
              ) : null}
            </div>
            <p className="text-[13px] font-normal text-muted-foreground mt-0.5 truncate m-0">
              {formatOrderDateTime(order.createdAt)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {order.status === "return requested" ? (
            <div className="flex gap-2">
              <AdminHeaderButton
                onClick={() => handleReturn("approve")}
                disabled={updating}
              >
                Approve Return
              </AdminHeaderButton>
              <AdminHeaderButton
                onClick={() => handleReturn("reject")}
                disabled={updating}
              >
                Reject Request
              </AdminHeaderButton>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {order.transactionDetails?.paymentStatus !== 'paid' &&
                order.transactionDetails?.paymentStatus !== 'partially_refunded' &&
                order.paymentStatus !== 'paid' &&
                order.paymentStatus !== 'partially_refunded' && (
                <AdminHeaderButton
                  onClick={() => handlePaymentStatusUpdate('paid')}
                  disabled={updating}
                >
                  Mark as Paid
                </AdminHeaderButton>
              )}

              <AdminHeaderButton
                onClick={handlePrintInvoice}
                disabled={isPrintingInvoice || invoiceLoading}
              >
                {isPrintingInvoice ? (
                  <>
                    <Spinner className="size-3.5 text-[#303030]" />
                    Preparing…
                  </>
                ) : (
                  "Print invoice"
                )}
              </AdminHeaderButton>

              {(order.awbCode || order.awb) ? (
                <AdminHeaderButton
                  onClick={handlePrintLabel}
                  disabled={isPrintingLabel}
                >
                  {isPrintingLabel ? (
                    <>
                      <Spinner className="size-3.5 text-[#303030]" />
                      Preparing…
                    </>
                  ) : (
                    "Print label"
                  )}
                </AdminHeaderButton>
              ) : null}

              <DropdownMenu>
                <DropdownMenuTrigger
                  disabled={updating || refundLoading}
                  render={
                    <Button
                      type="button"
                      variant="secondary"
                      size="lg"
                      disabled={updating || refundLoading}
                      className="h-8 min-h-8 gap-1.5 rounded-lg border-transparent bg-[#e3e3e3] px-3 text-[0.8125rem] font-[550] leading-5 text-[#303030] shadow-none hover:bg-[#d4d4d4] active:bg-[#ccc] aria-expanded:bg-[#d4d4d4]"
                    />
                  }
                >
                  More actions
                  <ChevronDown className="size-3.5 opacity-70" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-[13.5rem]">
                  {(() => {
                    const payStatus = (
                      order.paymentStatus ||
                      order.transactionDetails?.paymentStatus ||
                      ""
                    ).toLowerCase();
                    const canRefund =
                      !!order.razorpayPaymentId &&
                      (payStatus === "paid" || payStatus === "partially_refunded");
                    if (!canRefund) return null;
                    return (
                      <DropdownMenuItem
                        className="gap-2 text-[0.8125rem]"
                        disabled={updating || refundLoading}
                        onClick={openRefundModal}
                      >
                        <RotateCcw className="size-3.5 text-[#616161]" />
                        Refund
                      </DropdownMenuItem>
                    );
                  })()}
                  <DropdownMenuItem
                    className="gap-2 text-[0.8125rem]"
                    disabled={isCancelled}
                    onClick={handleCancelOrder}
                  >
                    <X className="size-3.5 text-[#616161]" />
                    Cancel order
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="gap-2 text-[0.8125rem]"
                    onClick={handleArchiveOrder}
                  >
                    <Archive className="size-3.5 text-[#616161]" />
                    {order.archived ? "Unarchive" : "Archive"}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}

          <div className="ml-1 inline-flex items-center gap-1.5">
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              title="Previous order"
              disabled={!neighbors.previous}
              className="size-8 rounded-lg border-transparent bg-[#e3e3e3] text-[#303030] shadow-none hover:bg-[#d4d4d4] active:bg-[#ccc]"
              onClick={() => {
                if (!neighbors.previous) return;
                router.push(`/admin/orders/${encodeURIComponent(neighbors.previous.key)}`);
              }}
            >
              <ChevronUp strokeWidth={1.75} />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-lg"
              title="Next order"
              disabled={!neighbors.next}
              className="size-8 rounded-lg border-transparent bg-[#e3e3e3] text-[#303030] shadow-none hover:bg-[#d4d4d4] active:bg-[#ccc]"
              onClick={() => {
                if (!neighbors.next) return;
                router.push(`/admin/orders/${encodeURIComponent(neighbors.next.key)}`);
              }}
            >
              <ChevronDown strokeWidth={1.75} />
            </Button>
          </div>
        </div>
      </header>

      {/* Main Container - Three Column Grid (equal side cards; Unfulfilled flexes) */}
      <div className="grid grid-cols-1 items-start gap-3 p-3 pb-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_minmax(0,20rem)]">
        
        {/* Column 1: Customer & addresses */}
        <aside className="flex flex-col gap-3">
          <Card className="admin-surface gap-0 rounded-[0.75rem] border-0 bg-white py-0 shadow-none ring-0">
            <CardContent className="flex flex-col gap-4 p-4">
              <div>
                <CardTitle className="admin-card-heading mb-2">
                  Customer
                </CardTitle>
                {customerOrdersHref ? (
                  <Link
                    href={customerOrdersHref}
                    className="admin-card-link leading-tight hover:underline"
                  >
                    {displayCustomerName(order, "Anonymous")}
                  </Link>
                ) : (
                  <p className="admin-card-link leading-tight">
                    {displayCustomerName(order, "Anonymous")}
                  </p>
                )}
                {customerOrdersHref ? (
                  <Link
                    href={customerOrdersHref}
                    className="mt-1 block admin-card-link hover:underline"
                  >
                    {customerOrdersCount}{" "}
                    {customerOrdersCount === 1 ? "order" : "orders"}
                  </Link>
                ) : (
                  <p className="mt-1 admin-card-link">
                    {customerOrdersCount}{" "}
                    {customerOrdersCount === 1 ? "order" : "orders"}
                  </p>
                )}
              </div>

              <div>
                <CardTitle className="admin-card-heading mb-2">
                  Contact information
                </CardTitle>
                <div className="space-y-1.5">
                  <ContactCopyLine
                    value={customer.email || shippingAddr.email || ""}
                  />
                  <ContactCopyLine
                    value={formatPhone(customer.phone || shipping.phone) || ""}
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

          <Card className="admin-surface gap-0 rounded-[0.75rem] border-0 bg-white py-0 shadow-none ring-0">
            <CardContent className="flex flex-col gap-4 p-4">
              <div>
                <CardTitle className="admin-card-heading mb-3">
                  Shipment details
                </CardTitle>
                <div className="space-y-4">
                  <div>
                    <p className="mb-1 admin-card-label">Est. Cost</p>
                    <p className="admin-card-muted">
                      {order.dtdcEstCost != null && order.dtdcEstCost !== ""
                        ? formatINR(order.dtdcEstCost)
                        : ""}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 admin-card-label">Status</p>
                    <Badge
                      variant="outline"
                      className="h-auto rounded-md px-2 py-0.5 text-[12px] font-medium"
                    >
                      {fulfillment.label}
                    </Badge>
                  </div>
                  {(order.awbCode || order.awb) && (
                    <div>
                      <p className="mb-1 admin-card-label">AWB / Ref</p>
                      <p className="font-mono admin-card-muted">
                        {order.awbCode || order.awb}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {order.isGift && (
                <>
                  <div>
                    <CardTitle className="admin-card-heading mb-3">
                      Gift Details
                    </CardTitle>
                    <p className="mb-1 admin-card-muted">Marked as Gift</p>
                    {order.giftMessage ? (
                      <p className="admin-card-muted italic">"{order.giftMessage}"</p>
                    ) : (
                      <p className="admin-card-muted italic">No message provided</p>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </aside>

        {/* Column 2: Order details / fulfillment + timeline */}
        <div className="flex min-w-0 flex-col gap-3">
        <Card className="admin-surface flex flex-col gap-0 overflow-visible rounded-[0.75rem] border-0 bg-white py-0 shadow-none ring-0">
          <CardContent className="admin-fulfillment p-4">
            <div className="admin-fulfillment-header">
              <AdminStatusText tone={fulfillment.tone} size="large" dot solid>
                {fulfillment.label}
              </AdminStatusText>
            </div>

            <div className="admin-panel-box">
              <div className="admin-line-items">
                {items.map((item, i) => {
                  const product = item.productId;
                  const thumbnail =
                    product?.thumbnails?.[0] ||
                    product?.variants?.[0]?.images?.[0];
                  const name = product?.productName || "Product";
                  const qty = Number(item.quantity) || 1;
                  const unit = Number(item.price) || 0;
                  const lineTotal = unit * qty;
                  const productKey =
                    product?._id || product?.id || product?.productId;
                  const metaParts = [item.size].filter(Boolean);

                  return (
                    <div key={i} className="admin-line-item">
                      <div className="admin-line-item-thumb">
                        <SafeImage src={thumbnail} fill className="object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="admin-line-item-name">
                          {productKey ? (
                            <Link href={`/admin/products?q=${encodeURIComponent(String(productKey))}`}>
                              {name}
                            </Link>
                          ) : (
                            name
                          )}
                        </p>
                        {metaParts.length > 0 ? (
                          <p className="admin-line-item-meta">
                            {metaParts.join(" / ")}
                          </p>
                        ) : null}
                      </div>
                      <div className="admin-line-item-price-row">
                        <span>{formatINR(unit)}</span>
                        <span aria-hidden>×</span>
                        <span className="admin-qty-tag">{qty}</span>
                      </div>
                      <p className="admin-line-item-total">{formatINR(lineTotal)}</p>
                    </div>
                  );
                })}
              </div>
              {fulfillment.key === "Unfulfilled" &&
              !(order.awbCode || order.awb) ? (
                <div className="admin-fulfillment-actions">
                  <Button
                    type="button"
                    size="lg"
                    disabled={updating || fulfillLoading}
                    onClick={handleMarkFulfilled}
                  >
                    {fulfillLoading ? (
                      <>
                        <Spinner className="size-3.5" />
                        Booking…
                      </>
                    ) : (
                      "Mark as fulfilled"
                    )}
                  </Button>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

          <Card className="admin-surface gap-0 rounded-[0.75rem] border-0 bg-white py-0 shadow-none ring-0">
            <CardContent className="p-4">
              <CardTitle className="admin-card-heading mb-3">
                Activity
              </CardTitle>
              <div className="admin-timeline">
                {(() => {
                  const groups = groupTimelineByDay(timelineSteps);
                  const flatCount = groups.reduce((n, g) => n + g.steps.length, 0);
                  let flatIndex = 0;
                  return groups.map((group, groupIndex) => (
                  <div key={group.key} className="admin-timeline-group">
                    {group.label ? (
                      <div className="admin-timeline-day">{group.label}</div>
                    ) : null}
                    {group.steps.map((step, stepIndex) => {
                      const latest = groupIndex === 0 && stepIndex === 0;
                      const isFirst = flatIndex === 0;
                      const isLast = flatIndex === flatCount - 1;
                      flatIndex += 1;
                      return (
                        <div
                          key={step.id}
                          className={[
                            "admin-timeline-item",
                            latest ? "admin-timeline-item--latest" : "",
                            isFirst ? "admin-timeline-item--first" : "",
                            isLast ? "admin-timeline-item--last" : "",
                          ]
                            .filter(Boolean)
                            .join(" ")}
                        >
                          <div className="admin-timeline-rail" aria-hidden>
                            <span
                              className={`admin-timeline-dot${
                                step.tone === "success"
                                  ? " admin-timeline-dot--success"
                                  : step.tone === "critical"
                                    ? " admin-timeline-dot--critical"
                                    : step.tone === "info"
                                      ? " admin-timeline-dot--info"
                                      : ""
                              }${latest ? " admin-timeline-dot--latest" : ""}`}
                            />
                          </div>
                          <div className="admin-timeline-body">
                            <div className="admin-timeline-row">
                              <div className="admin-timeline-copy">
                                <p className="admin-timeline-title">{step.title}</p>
                                {step.subtitle ? (
                                  <p className="admin-timeline-meta">{step.subtitle}</p>
                                ) : null}
                              </div>
                              {step.at ? (
                                <p className="admin-timeline-time">
                                  {formatTimelineTime(step.at)}
                                </p>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  ));
                })()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Column 3: Payment, Invoice, Attribution */}
        <aside className="flex flex-col gap-3">
          <Card className="admin-surface gap-0 overflow-visible rounded-[0.75rem] border-0 bg-white py-0 shadow-none ring-0">
            <CardContent className="space-y-4 p-4">
            <div>
               <CardTitle className="admin-card-heading mb-3">
                 Payment Details
               </CardTitle>
               <div className="space-y-4">
                 <div>
                   <p className="mb-1 admin-card-label">Total</p>
                   <p className="admin-card-muted">
                     {formatINR(order.finalPrice)}
                   </p>
                 </div>
                 {formatInstrumentLabel(order) ? (
                   <div>
                     <p className="mb-1 admin-card-label">Paid via</p>
                     <p className="admin-card-muted">
                       {formatInstrumentLabel(order)}
                     </p>
                   </div>
                 ) : null}
                 {(order.refundedAmount > 0 || order.transactionDetails?.refundedAmount > 0) && (
                   <div>
                     <p className="mb-1 admin-card-label">Refunded</p>
                     <p className="admin-card-muted">
                       {formatINR(order.refundedAmount || order.transactionDetails?.refundedAmount || 0)}
                     </p>
                   </div>
                 )}
                 {(order.razorpayPaymentId ||
                   order.transactionDetails?.razorpayPaymentId ||
                   order.transactionDetails?.paymentId) && (
                   <div>
                     <p className="mb-1 admin-card-label">Payment ID</p>
                     <CopyableValue
                       uppercase
                       value={
                         order.razorpayPaymentId ||
                         order.transactionDetails?.razorpayPaymentId ||
                         order.transactionDetails?.paymentId
                       }
                     />
                   </div>
                 )}
                 {(order.razorpayOrderId || order.transactionDetails?.razorpayOrderId) && (
                   <div>
                     <p className="mb-1 admin-card-label">Razorpay order</p>
                     <CopyableValue
                       uppercase
                       value={order.razorpayOrderId || order.transactionDetails?.razorpayOrderId}
                     />
                   </div>
                 )}
                 {order.transactionDetails?.rrn && (
                   <div>
                     <p className="mb-1 admin-card-label">Reference (RRN)</p>
                     <CopyableValue value={order.transactionDetails.rrn} />
                   </div>
                 )}
                 {!order.razorpayPaymentId &&
                   !order.transactionDetails?.razorpayPaymentId &&
                   !order.transactionDetails?.paymentId &&
                   !order.razorpayOrderId &&
                   !order.transactionDetails?.razorpayOrderId &&
                   String(order.paymentMethod || order.transactionDetails?.paymentMethod || "").toLowerCase() === "cod" && (
                     <p className="admin-card-muted">
                       Collect on delivery — no online payment reference.
                     </p>
                   )}
                 {(order.refunds?.length > 0 || order.transactionDetails?.refunds?.length > 0) && (
                   <div className="space-y-2">
                     <p className="admin-card-label">Refund history</p>
                     {(order.refunds || order.transactionDetails?.refunds || []).map((r) => (
                       <div
                         key={r.id || r.createdAt}
                         className="flex justify-between admin-card-muted"
                       >
                         <span className="font-mono truncate max-w-[120px]">{r.id || "—"}</span>
                         <span>{formatINR(r.amount || 0)}</span>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
            </div>

            <div className="space-y-3">
               {order.discount > 0 && (
                  <div className="flex items-center justify-between text-[0.8125rem] font-[450]">
                    <span className="text-foreground">Offer Applied</span>
                    <span className="text-muted-foreground">{formatINR(-(Number(order.discount) || 0), { signed: true })}</span>
                  </div>
               )}
               {order.isGift && (
                  <div className="flex items-center justify-between text-[0.8125rem] font-[450]">
                    <span className="text-foreground">Gift Wrap Fee</span>
                    <span className="text-muted-foreground">{formatINR(order.giftFee || 39, { signed: true })}</span>
                  </div>
               )}
               {order.deliveryAmount > 0 && (
                  <div className="flex items-center justify-between text-[0.8125rem] font-[450]">
                    <span className="text-foreground">Delivery Fee</span>
                    <span className="text-muted-foreground">{formatINR(order.deliveryAmount)}</span>
                  </div>
               )}
            </div>
            </CardContent>
          </Card>

          <Card className="admin-surface gap-0 rounded-[0.75rem] border-0 bg-white py-0 shadow-none ring-0">
            <CardContent className="p-4">
              <CardTitle className="admin-card-heading mb-3">
                Invoice Details
              </CardTitle>
              <div className="mb-5 space-y-4">
                <div>
                  <p className="mb-1 admin-card-label">Taxable Value</p>
                  <p className="admin-card-muted">{formatINR(invoiceTaxable)}</p>
                </div>
                <div>
                  <p className="mb-1 admin-card-label">GST Amount</p>
                  <p className="admin-card-muted">{formatINR(invoiceGstAmount)}</p>
                </div>
                <div>
                  <p className="mb-1 admin-card-label">Total</p>
                  <p className="admin-card-muted">{formatINR(invoiceTotal)}</p>
                </div>
              </div>
              {!invoice ? (
                <AdminHeaderButton
                  onClick={() => ensureInvoice()}
                  disabled={invoiceLoading || isPrintingInvoice}
                >
                  {invoiceLoading ? (
                    <>
                      <Spinner className="size-3.5 text-[#303030]" />
                      Creating…
                    </>
                  ) : (
                    "Generate invoice"
                  )}
                </AdminHeaderButton>
              ) : null}
            </CardContent>
          </Card>

          <Card className="admin-surface gap-0 rounded-[0.75rem] border-0 bg-white py-0 shadow-none ring-0">
            <CardContent className="space-y-4 p-4">
              <CardTitle className="admin-card-heading mb-3">
                Attribution
              </CardTitle>
              {!firstTouch && !lastTouch ? (
                <p className="admin-card-muted">Direct / none</p>
              ) : sameTouch ? (
                <AttributionTouchRows touch={firstTouch || lastTouch} />
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="mb-2 admin-card-label">First touch</p>
                    <AttributionTouchRows touch={firstTouch} />
                  </div>
                  <div>
                    <p className="mb-2 admin-card-label">Last touch</p>
                    <AttributionTouchRows touch={lastTouch} />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton>
          <DialogHeader>
            <DialogTitle>Refund via Razorpay</DialogTitle>
            <DialogDescription>
              Money returns to the customer&apos;s original payment method. Leave amount as remaining for a full refund.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="refund-amount">Amount (₹)</Label>
              <Input
                id="refund-amount"
                type="number"
                min="0.01"
                step="0.01"
                className="h-8"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="refund-reason">Reason (optional)</Label>
              <Input
                id="refund-reason"
                type="text"
                className="h-8"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder="Return / cancel / goodwill"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => setRefundOpen(false)}
              disabled={refundLoading}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="lg"
              onClick={handleRefund}
              disabled={refundLoading}
            >
              {refundLoading && <RefreshCw className="animate-spin" />}
              Process refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: var(--border); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: var(--muted-foreground); }
      `}</style>
    </main>
  );
}
