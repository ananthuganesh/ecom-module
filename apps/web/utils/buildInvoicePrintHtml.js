import { gstRateForUnitPrice, roundMoney, splitInclusiveGst } from "@/utils/gstRate";

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function moneyPlain(n) {
  const v = Number(n || 0);
  return v.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qtyPlain(n) {
  const v = Number(n || 0);
  if (!Number.isFinite(v)) return "0";
  if (Number.isInteger(v) || Math.abs(v - Math.round(v)) < 1e-9) {
    return String(Math.round(v));
  }
  return v.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function money(n) {
  return `₹${moneyPlain(n)}`;
}

function moneyNeg(n) {
  return `-₹${moneyPlain(n)}`;
}

function fmtDate(d) {
  if (!d) return "—";
  try {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return "—";
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
  } catch {
    return "—";
  }
}

function addrCityLine(addr = {}) {
  const city = addr.city || "";
  const state = addr.state || addr.stateName || "";
  const pin = addr.postalCode || addr.pincode || addr.zipCode || "";
  const left = [city, state].filter(Boolean).join(", ");
  if (left && pin) return `${left} - ${pin}`;
  if (left) return left;
  if (pin) return String(pin);
  return "";
}

function addrLines(addr = {}) {
  const lines = [
    addr.address || addr.addressLine1 || addr.street || "",
    addr.address2 || addr.addressLine2 || "",
    addrCityLine(addr),
    addr.country && String(addr.country).toLowerCase() !== "india" ? addr.country : "",
  ].filter((l) => String(l).trim());
  return lines;
}

function personName(addr = {}, fallback = "Customer") {
  return (
    addr.name ||
    addr.fullName ||
    addr.customerName ||
    fallback
  );
}

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n) {
  if (n < 20) return ONES[n];
  const t = Math.floor(n / 10);
  const o = n % 10;
  return `${TENS[t]}${o ? ` ${ONES[o]}` : ""}`.trim();
}

function threeDigits(n) {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  if (h && rest) return `${ONES[h]} Hundred ${twoDigits(rest)}`;
  if (h) return `${ONES[h]} Hundred`;
  return twoDigits(rest);
}

/** Indian numbering: crore / lakh / thousand */
export function amountInWordsInr(amount) {
  let n = Math.round(Number(amount || 0));
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (n === 0) return "Indian Rupee Zero Only";

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return `Indian Rupee ${parts.join(" ")} Only`;
}

function companyAddressLines(company = {}) {
  const pin = company.pincode || company.postalCode || "";
  const cityState = [company.city, company.stateName || company.state].filter(Boolean).join(", ");
  const cityLine = cityState && pin ? `${cityState} - ${pin}` : cityState || pin;
  return [
    company.addressLine1 || company.address || "",
    company.addressLine2 || "",
    cityLine,
    company.country || "India",
  ].filter((l) => String(l).trim());
}

function mapCompany(company = {}) {
  return {
    name: company.name || company.tradeName || company.storeName || company.legalName || "Urban Aana",
    lines: companyAddressLines(company),
    phone: company.phone || "9037381610",
    email: company.email || "info@urbanaana.com",
    website: company.website || company.siteUrl || "urbanaana.com",
    gstin: company.gstin || "",
    stateCode: company.stateCode || "",
    stateName: company.stateName || company.state || "",
    logoUrl: company.logoUrl || "/images/invoice/logo-light.png",
  };
}

function normalizeStateCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (/^\d{1,2}$/.test(raw)) return raw.padStart(2, "0");
  // Kerala etc. — leave name as-is for Place of Supply display
  return raw;
}

function sameState(a, b) {
  const x = normalizeStateCode(a);
  const y = normalizeStateCode(b);
  if (!x || !y) return true; // default intra-state for Kerala ecommerce
  if (/^\d{2}$/.test(x) && /^\d{2}$/.test(y)) return x === y;
  return x === y;
}

function paymentDetails(order, grand) {
  const statusRaw = String(
    order?.paymentStatus || order?.transactionDetails?.paymentStatus || ""
  ).toLowerCase();
  const methodRaw = String(
    order?.paymentMethod || order?.transactionDetails?.paymentMethod || ""
  ).toLowerCase();
  const instrument = String(
    order?.paymentInstrument ||
      order?.transactionDetails?.paymentInstrument ||
      order?.transactionDetails?.method ||
      ""
  ).toLowerCase();
  const td = order?.transactionDetails || {};

  const isCod =
    methodRaw === "cod" ||
    methodRaw === "cash_on_delivery" ||
    methodRaw.includes("cash on delivery") ||
    statusRaw === "pay_on_delivery";

  let paymentStatus = "PAYMENT PENDING";
  if (statusRaw === "paid" || statusRaw === "captured") paymentStatus = "PAID";
  else if (statusRaw === "refunded") paymentStatus = "REFUNDED";
  else if (statusRaw === "partially_refunded") paymentStatus = "PARTIALLY REFUNDED";
  else if (isCod) paymentStatus = "PAYMENT PENDING";
  else if (statusRaw === "failed") paymentStatus = "FAILED";
  else if (statusRaw === "pending" || !statusRaw) paymentStatus = "PAYMENT PENDING";

  let paymentMethod = "—";
  if (isCod) paymentMethod = "Cash on Delivery";
  else if (instrument.includes("upi")) paymentMethod = "Razorpay / UPI";
  else if (instrument.includes("card")) paymentMethod = "Razorpay / Card";
  else if (instrument.includes("netbanking") || instrument.includes("net_banking"))
    paymentMethod = "Razorpay / Netbanking";
  else if (instrument.includes("wallet")) paymentMethod = "Razorpay / Wallet";
  else if (methodRaw.includes("razorpay") || methodRaw.includes("online") || methodRaw === "prepaid")
    paymentMethod = "Razorpay";
  else if (methodRaw.includes("bank")) paymentMethod = "Bank Transfer";
  else if (methodRaw) paymentMethod = methodRaw.replace(/_/g, " ");

  const paymentId =
    order?.razorpayPaymentId ||
    td.razorpayPaymentId ||
    td.paymentId ||
    order?.paymentId ||
    "";

  const paymentDate =
    td.paidAt ||
    td.paymentDate ||
    order?.paidAt ||
    (paymentStatus === "PAID" ? order?.updatedAt || order?.createdAt : null);

  const paidLike = paymentStatus === "PAID" || paymentStatus === "PARTIALLY REFUNDED";
  const paymentMade = paidLike ? grand : 0;
  const balanceDue = paidLike ? 0 : isCod ? grand : grand;

  return {
    paymentStatus,
    paymentMethod,
    paymentId,
    paymentDate,
    paymentMade,
    balanceDue,
    isCod,
  };
}

/** Reverse-split a tax-inclusive gross into taxable + GST. */
function splitInclusive(gross, rate) {
  const split = splitInclusiveGst(gross, rate);
  return { taxable: split.taxable, tax: split.gst, gst: split.gst };
}

/**
 * Build a GST-ready printable TAX INVOICE HTML document.
 *
 * Apparel GST slabs (sale price per piece): ≤ ₹2,500 → 5%, above → 18%.
 */
export function buildInvoicePrintHtml({ order, invoice, company = {}, taxClasses = [] }) {
  const co = mapCompany(company);
  const customer = typeof order?.customerId === "object" && order.customerId ? order.customerId : {};
  const ship = order?.shippingAddress || {};
  const bill = order?.billingAddress || order?.billing || ship;

  const billName =
    invoice?.customerName ||
    personName(bill, personName(ship, customer.name || order?.customerName || "Customer"));
  const shipName = personName(ship, billName);
  const billLines = addrLines(bill);
  const shipLines = addrLines(ship);
  const billPhone = bill.phone || bill.contact || ship.phone || ship.contact || customer.phone || "";
  const shipPhone = ship.phone || ship.contact || billPhone;
  const customerGstin =
    invoice?.customerGstin ||
    bill.gstin ||
    ship.gstin ||
    customer.gstin ||
    order?.customerGstin ||
    "";

  const invNumber =
    invoice?.number ||
    order?.invoiceNumber ||
    order?.orderNumber ||
    `INV-${String(order?._id || "").slice(-6).toUpperCase()}`;
  const orderRef = order?.orderNumber || "";
  const invDate = invoice?.invoiceDate || order?.createdAt;
  const dueDate = invoice?.dueDate || invDate;
  const terms = invoice?.terms || "Due on Receipt";
  const reverseCharge =
    invoice?.reverseCharge === true || invoice?.reverseCharge === "Yes" ? "Yes" : "No";

  const sellerState = co.stateCode || co.stateName || "";
  const buyerState =
    invoice?.customerStateCode || ship.stateCode || ship.state || ship.stateName || sellerState;
  const intraState = sameState(sellerState, buyerState);

  const invItems = Array.isArray(invoice?.items) && invoice.items.length ? invoice.items : null;
  const orderItems = order?.items || order?.orderItems || [];

  const resolveLineRate = (unitPrice) => gstRateForUnitPrice(unitPrice);

  const lineRows = [];
  if (invItems) {
    invItems.forEach((item, i) => {
      const orderItem = orderItems[i] || {};
      const product =
        typeof orderItem.productId === "object" && orderItem.productId ? orderItem.productId : {};
      const name = item.productName || item.name || "Item";
      const sku = item.variantSku || item.sku || "";
      const qty = Number(item.quantity || 0);
      const unitPrice = Number(item.unitPrice || 0);
      const lineDiscount = Number(item.discount || item.discountAmount || 0);
      const gross = Math.max(0, unitPrice * qty - lineDiscount);
      const taxRate = resolveLineRate(unitPrice);
      const split = splitInclusive(gross, taxRate);
      const taxable = split.taxable;
      const taxAmt = split.tax;
      const amount = Number(item.totalAmount != null ? item.totalAmount : gross);
      const variantBits = [item.size && `Size: ${item.size}`, item.color && `Color: ${item.color}`]
        .filter(Boolean)
        .join(" · ");
      lineRows.push({
        no: i + 1,
        sku,
        name,
        variant: variantBits,
        hsn: item.hsnCode || item.hsn || product.hsnCode || "",
        qty,
        rate: unitPrice,
        discount: lineDiscount,
        taxRate,
        taxable,
        taxAmt,
        amount,
      });
    });
  } else {
    orderItems.forEach((item, i) => {
      const product = typeof item.productId === "object" && item.productId ? item.productId : {};
      const name = item.productName || item.name || product.productName || product.name || "Item";
      const sku = item.sku || item.variantSku || product.sku || "";
      const qty = Number(item.quantity ?? item.qty ?? 0);
      const unitPrice = Number(item.price || item.unitPrice || 0);
      const lineDiscount = Number(item.discount || item.discountAmount || 0);
      const gross = Math.max(0, unitPrice * qty - lineDiscount);
      const taxRate = resolveLineRate(unitPrice);
      const inclusive = (product.priceTaxMode || "inclusive") !== "exclusive";
      let taxable;
      let taxAmt;
      if (inclusive) {
        const split = splitInclusive(gross, taxRate);
        taxable = split.taxable;
        taxAmt = split.tax;
      } else {
        taxable = roundMoney(gross);
        taxAmt = taxRate ? roundMoney((taxable * taxRate) / 100) : 0;
      }
      const variantBits = [item.size && `Size: ${item.size}`, item.color && `Color: ${item.color}`]
        .filter(Boolean)
        .join(" · ");
      lineRows.push({
        no: i + 1,
        sku,
        name,
        variant: variantBits,
        hsn: item.hsnCode || item.hsn || product.hsnCode || "",
        qty,
        rate: unitPrice,
        discount: lineDiscount,
        taxRate,
        taxable,
        taxAmt,
        amount: inclusive ? gross : roundMoney(taxable + taxAmt),
      });
    });
  }

  const lineTaxableSum = roundMoney(lineRows.reduce((s, r) => s + Number(r.taxable || 0), 0));
  const lineTaxSum = roundMoney(lineRows.reduce((s, r) => s + Number(r.taxAmt || 0), 0));
  const lineGrossSum = roundMoney(
    lineRows.reduce((s, r) => s + Number(r.rate || 0) * Number(r.qty || 0), 0)
  );
  const lineDiscountSum = roundMoney(lineRows.reduce((s, r) => s + Number(r.discount || 0), 0));

  const discount = Number(
    invoice?.discount != null
      ? invoice.discount
      : order?.discountAmount || order?.discount || lineDiscountSum || 0
  );
  const delivery = Number(order?.deliveryAmount || invoice?.shipping || 0);

  // Always prefer slab-recomputed line GST (≤₹2500→5%, >₹2500→18%).
  const storedTaxTotal = Number(
    invoice?.taxTotal != null
      ? invoice.taxTotal
      : Number(invoice?.cgst || 0) + Number(invoice?.sgst || 0) + Number(invoice?.igst || 0)
  );
  const useLineTax = lineTaxSum > 0;

  const taxableAmount = useLineTax
    ? lineTaxableSum
    : invoice?.subtotal != null && storedTaxTotal > 0
      ? Number(invoice.subtotal)
      : lineTaxableSum || Math.max(0, lineGrossSum - discount);

  let taxTotal = useLineTax ? lineTaxSum : storedTaxTotal;
  let cgst = useLineTax ? 0 : Number(invoice?.cgst || 0);
  let sgst = useLineTax ? 0 : Number(invoice?.sgst || 0);
  let igst = useLineTax ? 0 : Number(invoice?.igst || 0);

  // If invoice has tax total but no CGST/SGST/IGST split, derive from place of supply
  if (taxTotal > 0 && cgst + sgst + igst <= 0) {
    if (intraState) {
      cgst = Math.round((taxTotal / 2) * 100) / 100;
      sgst = Math.round((taxTotal - cgst) * 100) / 100;
      igst = 0;
    } else {
      igst = taxTotal;
      cgst = 0;
      sgst = 0;
    }
  }

  const isGst = Boolean(invoice?.isGstInvoice || co.gstin || taxTotal > 0);
  const title = isGst ? "Tax Invoice" : "Invoice";

  // Dominant GST rate for labels (from lines)
  const rateCounts = {};
  lineRows.forEach((r) => {
    const rate = Number(r.taxRate || 0);
    if (rate > 0) rateCounts[rate] = (rateCounts[rate] || 0) + 1;
  });
  const dominantRate =
    Object.keys(rateCounts)
      .map(Number)
      .sort((a, b) => rateCounts[b] - rateCounts[a])[0] || (taxTotal && taxableAmount
      ? Math.round((taxTotal / taxableAmount) * 1000) / 10
      : 0);
  const halfRate = dominantRate ? dominantRate / 2 : 0;

  const grand = invoice
    ? Number(invoice.grandTotal || 0)
    : Number(order?.finalPrice ?? order?.total ?? taxableAmount + taxTotal + delivery);

  const pay = paymentDetails(order, grand);
  const words = amountInWordsInr(grand);
  const billEmail = bill.email || ship.email || customer.email || "";

  const rowsHtml = lineRows
    .map((r) => {
      return `<tr>
      <td class="col-sl ctr">${esc(r.no)}</td>
      <td class="col-item">
        <div class="item-cell">
          <div class="item-name">${esc(r.name)}</div>
          ${r.variant ? `<div class="item-desc">${esc(r.variant)}</div>` : ""}
        </div>
      </td>
      <td class="col-sku">${esc(r.sku || "—")}</td>
      <td class="col-qty ctr">${esc(qtyPlain(r.qty))}</td>
      <td class="col-rate num">${esc(moneyPlain(r.rate))}</td>
      <td class="col-disc num">${esc(moneyPlain(r.discount || 0))}</td>
      <td class="col-taxable num">${esc(moneyPlain(r.taxable))}</td>
      <td class="col-gst num">${esc(r.taxRate ? `${qtyPlain(r.taxRate)}%` : "—")}</td>
      <td class="col-amt num">${esc(moneyPlain(r.amount))}</td>
    </tr>`;
    })
    .join("");

  const tableHead = `<tr>
        <th class="col-sl ctr">Sl No</th>
        <th class="col-item">Product</th>
        <th class="col-sku">SKU</th>
        <th class="col-qty ctr">Qty</th>
        <th class="col-rate num">Unit Price</th>
        <th class="col-disc num">Discount</th>
        <th class="col-taxable num">Taxable</th>
        <th class="col-gst num">GST</th>
        <th class="col-amt num">Total</th>
      </tr>`;

  const emptyRow = `<tr><td colspan="9" class="empty">No items</td></tr>`;

  const taxCalcRows = [];
  if (discount > 0) {
    taxCalcRows.push(
      `<div class="tot-row"><span class="tot-k">Discount</span><span class="tot-v">${esc(moneyNeg(discount))}</span></div>`
    );
  }
  taxCalcRows.push(
    `<div class="tot-row"><span class="tot-k">Taxable Amount</span><span class="tot-v">${esc(money(taxableAmount))}</span></div>`
  );
  if (isGst || taxTotal > 0) {
    if (igst > 0) {
      taxCalcRows.push(
        `<div class="tot-row"><span class="tot-k">IGST${dominantRate ? ` @ ${moneyPlain(dominantRate)}%` : ""}</span><span class="tot-v">${esc(money(igst))}</span></div>`
      );
    } else if (cgst > 0 || sgst > 0) {
      taxCalcRows.push(
        `<div class="tot-row"><span class="tot-k">CGST${halfRate ? ` @ ${moneyPlain(halfRate)}%` : ""}</span><span class="tot-v">${esc(money(cgst))}</span></div>`
      );
      taxCalcRows.push(
        `<div class="tot-row"><span class="tot-k">SGST${halfRate ? ` @ ${moneyPlain(halfRate)}%` : ""}</span><span class="tot-v">${esc(money(sgst))}</span></div>`
      );
    }
    taxCalcRows.push(
      `<div class="tot-row"><span class="tot-k">Total GST${dominantRate ? ` @ ${moneyPlain(dominantRate)}%` : ""}</span><span class="tot-v">${esc(money(taxTotal))}</span></div>`
    );
  }
  if (delivery > 0) {
    taxCalcRows.push(
      `<div class="tot-row"><span class="tot-k">Shipping Charges</span><span class="tot-v">${esc(money(delivery))}</span></div>`
    );
  }

  const metaPairs = [
    ["Invoice #", invNumber],
    ["Invoice Date", fmtDate(invDate)],
    ["Order #", orderRef || "—"],
    ["Payment Terms", terms],
    ["Due Date", fmtDate(dueDate)],
  ];
  if (isGst) {
    metaPairs.push(["Reverse Charge", reverseCharge]);
  }
  const metaRows = metaPairs
    .map(
      ([k, v]) =>
        `<div class="meta-row"><span class="meta-k">${esc(k)}</span><span class="meta-v">${esc(v)}</span></div>`
    )
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${esc(title)} ${esc(invNumber)}</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 24px 32px 32px;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      color: #1a1a1a;
      font-size: 11px;
      line-height: 1.4;
      background: #fff;
    }

    /* —— Header —— */
    .header {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 24px;
      align-items: start;
      padding-bottom: 16px;
      margin-bottom: 16px;
      border-bottom: 1px solid #d0d5db;
    }
    .brand { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .logo { width: 80px; height: auto; object-fit: contain; display: block; }
    .co-name {
      margin: 0 0 4px;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      color: #111;
    }
    .co-line { margin: 0; color: #555; font-size: 11px; }
    .co-contact { margin-top: 4px; }
    .gstin { margin-top: 6px; font-size: 11px; color: #111; font-weight: 600; }

    .meta-block { text-align: right; min-width: 0; }
    .doc-title {
      margin: 0 0 12px;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: 0.01em;
      color: #111;
      line-height: 1.2;
    }
    .meta-list {
      display: inline-grid;
      grid-template-columns: auto auto;
      column-gap: 12px;
      row-gap: 4px;
      text-align: left;
      margin-left: auto;
    }
    .meta-row { display: contents; }
    .meta-k {
      color: #6b7280;
      font-size: 10px;
      font-weight: 500;
      text-align: right;
      white-space: nowrap;
      padding-top: 1px;
    }
    .meta-v {
      color: #111;
      font-size: 11px;
      font-weight: 600;
      text-align: right;
      white-space: nowrap;
    }

    /* —— Addresses —— */
    .addr-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
      margin-bottom: 16px;
    }
    .addr-col {
      min-width: 0;
    }
    .section-label {
      margin: 0 0 8px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #6b7280;
    }
    .bill-name {
      margin: 0 0 4px;
      font-weight: 700;
      font-size: 12px;
      color: #111;
    }
    .bill-line {
      margin: 0;
      color: #4b5563;
      font-size: 11px;
      overflow-wrap: anywhere;
    }
    .bill-line + .bill-line { margin-top: 2px; }

    /* —— Items + totals (merged block) —— */
    .sheet-block {
      border: 1px solid #e5e7eb;
      margin: 0 0 16px;
      overflow: hidden;
    }
    table.items {
      width: 100%;
      table-layout: fixed;
      border-collapse: collapse;
      margin: 0;
      border: none;
    }
    table.items thead th {
      background: #374151;
      color: #fff !important;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.03em;
      text-transform: uppercase;
      text-align: left;
      height: 36px;
      padding: 0 8px;
      border: none;
      border-bottom: 1px solid #374151;
      white-space: nowrap;
      vertical-align: middle;
      line-height: 36px;
    }
    table.items tbody td {
      height: 40px;
      padding: 0 8px;
      border: none;
      border-bottom: 1px solid #e5e7eb;
      vertical-align: middle;
      font-size: 11px;
      line-height: 40px;
      color: #111;
      overflow: hidden;
    }
    table.items tbody tr:last-child td {
      border-bottom: none;
    }
    table.items thead th.num,
    table.items tbody td.num {
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    table.items thead th.ctr,
    table.items tbody td.ctr {
      text-align: center;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    table.items tbody td.empty {
      text-align: center;
      color: #9ca3af;
      line-height: 40px;
    }
    .col-sl { width: 7%; }
    .col-item { width: 28%; }
    .col-sku { width: 12%; }
    .col-qty { width: 6%; }
    .col-rate { width: 11%; }
    .col-disc { width: 10%; }
    .col-taxable { width: 11%; }
    .col-gst { width: 7%; }
    .col-amt { width: 8%; }
    table.items th.col-sl,
    table.items td.col-sl {
      text-align: center;
      white-space: nowrap;
      padding-left: 8px;
    }
    table.items th.col-sku,
    table.items td.col-sku {
      text-align: left;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    table.items tbody td.col-sku {
      font-size: 10px;
      color: #6b7280;
    }
    table.items th.col-item,
    table.items td.col-item {
      text-align: left;
      overflow: hidden;
    }
    table.items tbody td.col-item {
      line-height: normal;
      padding-top: 8px;
      padding-bottom: 8px;
    }
    table.items th.col-amt,
    table.items td.col-amt {
      padding-right: 10px;
    }
    .item-cell {
      display: block;
      max-width: 100%;
      line-height: 1.25;
    }
    .item-name {
      font-weight: 600;
      color: #111;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }
    .item-desc {
      margin-top: 2px;
      color: #6b7280;
      font-size: 10px;
      white-space: normal;
      word-break: break-word;
      overflow-wrap: anywhere;
      line-height: 1.25;
    }

    /* —— Totals + words —— */
    .totals-wrap {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
      gap: 0;
      align-items: stretch;
      margin: 0;
      border-top: 1px solid #e5e7eb;
    }
    .words-plain {
      padding: 12px 12px 12px 10px;
      min-height: 100%;
      align-self: stretch;
      display: flex;
      align-items: flex-end;
      box-sizing: border-box;
    }
    .words-value {
      margin: 0;
      color: #4b5563;
      font-size: 11px;
      font-weight: 500;
      line-height: 1.45;
      width: 100%;
    }
    .totals {
      border: none;
      border-radius: 0;
      border-left: 1px solid #e5e7eb;
      padding: 10px 12px 12px;
      background: #fff;
      min-height: 100%;
      box-sizing: border-box;
    }
    .tot-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 16px;
      align-items: baseline;
      padding: 4px 0;
      font-size: 11px;
    }
    .tot-k { color: #6b7280; text-align: left; }
    .tot-v {
      color: #111;
      font-weight: 600;
      text-align: right;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
    }
    .tot-row.grand {
      margin-top: 6px;
      padding-top: 8px;
      border-top: 1px solid #d1d5db;
    }
    .tot-row.grand .tot-k,
    .tot-row.grand .tot-v {
      color: #111;
      font-weight: 700;
      font-size: 13px;
    }
    .tot-pay {
      margin-top: 8px;
      padding-top: 8px;
      border-top: 1px dashed #d1d5db;
    }
    .tot-row.balance .tot-k,
    .tot-row.balance .tot-v {
      font-weight: 700;
      color: #111;
    }

    /* —— Signature + footer —— */
    .sign-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 24px;
      align-items: end;
      margin: 24px 0 16px;
      min-height: 88px;
    }
    .sign {
      text-align: right;
      margin-right: 32px;
    }
    .sign-img {
      display: block;
      margin: 0 0 4px auto;
      max-height: 56px;
      width: auto;
      max-width: 160px;
      object-fit: contain;
    }
    .sign-label {
      display: inline-block;
      min-width: 160px;
      font-size: 10px;
      color: #6b7280;
      text-align: center;
      letter-spacing: 0.02em;
    }
    .footer {
      margin-top: 8px;
      padding-top: 16px;
      border-top: 1px solid #e5e7eb;
    }
    .footer-title {
      margin: 0 0 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #374151;
    }
    .footer ul {
      margin: 0 0 10px;
      padding-left: 16px;
      color: #6b7280;
      font-size: 10px;
    }
    .footer li { margin: 0 0 3px; }

    @media print {
      body { padding: 12px 16px 20px; }
      table.items thead th {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
    @page { margin: 10mm; }
  </style>
</head>
<body>
  <header class="header">
    <div class="brand">
      <img class="logo" src="${esc(co.logoUrl)}" alt="${esc(co.name)}" />
      <div>
        <h1 class="co-name">${esc(co.name)}</h1>
        ${co.lines.map((l) => `<p class="co-line">${esc(l)}</p>`).join("")}
        <div class="co-contact">
          ${co.phone ? `<p class="co-line">Phone: ${esc(co.phone)}</p>` : ""}
          ${co.email ? `<p class="co-line">Email: ${esc(co.email)}</p>` : ""}
        </div>
        ${co.gstin ? `<p class="gstin">GSTIN: ${esc(co.gstin)}</p>` : ""}
      </div>
    </div>
    <div class="meta-block">
      <h2 class="doc-title">${esc(title)}</h2>
      <div class="meta-list">${metaRows}</div>
    </div>
  </header>

  <section class="addr-grid">
    <div class="addr-col">
      <h3 class="section-label">Bill To</h3>
      <p class="bill-name">${esc(billName)}</p>
      ${billLines.map((l) => `<p class="bill-line">${esc(l)}</p>`).join("")}
      ${billPhone ? `<p class="bill-line">Phone: ${esc(billPhone)}</p>` : ""}
      ${billEmail ? `<p class="bill-line">Email: ${esc(billEmail)}</p>` : ""}
      ${customerGstin ? `<p class="bill-line">GSTIN: ${esc(customerGstin)}</p>` : ""}
    </div>
    <div class="addr-col">
      <h3 class="section-label">Ship To</h3>
      <p class="bill-name">${esc(shipName)}</p>
      ${shipLines.map((l) => `<p class="bill-line">${esc(l)}</p>`).join("")}
      ${shipPhone ? `<p class="bill-line">Phone: ${esc(shipPhone)}</p>` : ""}
    </div>
  </section>

  <div class="sheet-block">
    <table class="items">
      <thead>${tableHead}</thead>
      <tbody>${rowsHtml || emptyRow}</tbody>
    </table>
    <section class="totals-wrap">
      <div class="words-plain">
        <p class="words-value">${esc(words)}</p>
      </div>
      <div class="totals">
        ${taxCalcRows.join("")}
        <div class="tot-row grand">
          <span class="tot-k">Grand Total</span>
          <span class="tot-v">${esc(money(grand))}</span>
        </div>
        <div class="tot-pay">
          <div class="tot-row">
            <span class="tot-k">Payment Made</span>
            <span class="tot-v">${esc(moneyNeg(pay.paymentMade))}</span>
          </div>
          <div class="tot-row balance">
            <span class="tot-k">Balance Due</span>
            <span class="tot-v">${esc(money(pay.balanceDue))}</span>
          </div>
        </div>
      </div>
    </section>
  </div>

  <section class="sign-row">
    <div></div>
    <div class="sign">
      <img
        class="sign-img"
        src="/images/invoice/authorized-signature.png"
        alt="Authorized signature"
      />
      <div class="sign-label">Authorized Signature</div>
    </div>
  </section>

  <footer class="footer">
    <p class="footer-title">Terms &amp; Conditions</p>
    <ul>
      <li>Goods once sold are subject to the applicable return policy.</li>
      <li>For returns or support, contact ${esc(co.email || "info@urbanaana.com")}.</li>
      <li>Please retain this invoice for warranty and return purposes.</li>
    </ul>
  </footer>
</body>
</html>`;
}

/**
 * Combine multiple invoice HTML docs into one print job (page break between each).
 * @param {Array<{ order: object, invoice?: object, company?: object }>} entries
 */
export function buildMultiInvoicePrintHtml(entries) {
  const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
  if (!list.length) return "";
  if (list.length === 1) {
    return buildInvoicePrintHtml(list[0]);
  }

  const pages = list
    .map((entry, idx) => {
      const html = buildInvoicePrintHtml(entry);
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
      const inner = bodyMatch ? bodyMatch[1] : html;
      const breakStyle =
        idx < list.length - 1 ? "page-break-after: always;" : "page-break-after: auto;";
      return `<section class="invoice-page" style="${breakStyle}">${inner}</section>`;
    })
    .join("\n");

  const sample = buildInvoicePrintHtml(list[0]);
  const styleMatch = sample.match(/<style>([\s\S]*)<\/style>/i);
  const styles = styleMatch ? styleMatch[1] : "";

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Invoices (${list.length})</title>
  <style>
    ${styles}
    .invoice-page { padding: 0; }
    @media print {
      .invoice-page { break-after: page; page-break-after: always; }
      .invoice-page:last-child { break-after: auto; page-break-after: auto; }
    }
  </style>
</head>
<body style="padding:0;margin:0">
  ${pages}
</body>
</html>`;
}
