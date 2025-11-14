import type { Order } from "@shared/schema";

type OrderWithVendorDetails = Order & {
  vendorDetails?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    paymentQrCodeUrl?: string | null;
    gstin?: string | null;
  } | null;
};

export type PaymentType = "cash" | "upi";

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPrice: number;
  unitPriceWithTax: number;
  baseSubtotal: number;
  gstRate: number;
  gstMode: "include" | "exclude";
  gstAmount: number;
  lineTotal: number;
}

interface ReceiptData {
  order: OrderWithVendorDetails;
  restaurantName?: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  paymentQrCodeUrl?: string | null;
  paymentType?: PaymentType;
  items?: ReceiptItem[];
  title?: string;
  ticketNumber?: string;
  hidePricing?: boolean;
}

/** Currency formatter for INR */
const formatINR = (amount: number | string) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(amount));
};

const paymentTypeLabels: Record<PaymentType, string> = {
  cash: "Cash Payment",
  upi: "UPI Payment",
};

const roundCurrency = (value: number): number =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

const parseAmount = (value: unknown): number => {
  if (value === null || value === undefined || value === "") {
    return 0;
  }
  const numeric = Number.parseFloat(String(value));
  return Number.isFinite(numeric) ? Number(numeric.toFixed(2)) : 0;
};

const computeReceiptTotals = (
  items: ReceiptItem[] = [],
  orderTotal?: number | string,
) => {
  const gstByRate = new Map<number, number>();
  const summary = items.reduce(
    (acc, item) => {
      const subtotal = roundCurrency(item.baseSubtotal ?? item.unitPrice * item.quantity);
      const gstAmount = roundCurrency(item.gstAmount ?? subtotal * (item.gstRate / 100));
      const gstRate = Number.isFinite(item.gstRate) ? item.gstRate : 0;
      const lineTotal = roundCurrency(item.lineTotal ?? subtotal + gstAmount);

      acc.subtotal += subtotal;
      acc.totalTax += gstAmount;
      if (gstRate > 0) {
        if (item.gstMode === "include") {
          acc.gstIncluded += gstAmount;
        } else {
          acc.gstSeparate += gstAmount;
          gstByRate.set(gstRate, (gstByRate.get(gstRate) ?? 0) + gstAmount);
        }
      }
      acc.computedTotal += lineTotal;
      return acc;
    },
    {
      subtotal: 0,
      totalTax: 0,
      gstIncluded: 0,
      gstSeparate: 0,
      computedTotal: 0,
    },
  );

  const computedTotal = roundCurrency(
    summary.subtotal + summary.gstIncluded + summary.gstSeparate,
  );
  const orderTotalNumber = parseAmount(orderTotal);
  const finalTotal =
    orderTotalNumber > 0 ? roundCurrency(orderTotalNumber) : computedTotal;
  const roundOff = roundCurrency(finalTotal - computedTotal);

  const gstBreakdown = Array.from(gstByRate.entries())
    .map(([rate, amount]) => ({
      rate,
      amount: roundCurrency(amount),
      cgstRate: roundCurrency(rate / 2), // 50% of GST rate
      cgstAmount: roundCurrency(amount / 2), // 50% of GST amount
      sgstRate: roundCurrency(rate / 2), // 50% of GST rate
      sgstAmount: roundCurrency(amount / 2), // 50% of GST amount
    }))
    .sort((a, b) => a.rate - b.rate);

  // Also calculate CGST and SGST for included GST
  const cgstIncluded = roundCurrency(summary.gstIncluded / 2);
  const sgstIncluded = roundCurrency(summary.gstIncluded / 2);

  return {
    subtotal: roundCurrency(summary.subtotal),
    totalTax: roundCurrency(summary.totalTax),
    gstIncluded: roundCurrency(summary.gstIncluded),
    cgstIncluded,
    sgstIncluded,
    gstSeparate: roundCurrency(summary.gstSeparate),
    computedTotal,
    finalTotal,
    roundOff,
    gstBreakdown,
  };
};

const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  }).format(date);

const formatTime = (date: Date) =>
  new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }).format(date);

/**
 * Generate thermal printer-friendly receipt HTML
 * Optimized for 58mm and 80mm thermal printers
 */
export function generateThermalReceipt(data: ReceiptData): string {
  const {
    order,
    restaurantName = order.vendorDetails?.name || 'QuickBite QR',
    restaurantAddress = order.vendorDetails?.address || '',
    restaurantPhone = order.vendorDetails?.phone || '',
    paymentQrCodeUrl = order.vendorDetails?.paymentQrCodeUrl ?? null,
    paymentType,
    items = [],
    title,
    ticketNumber,
    hidePricing = false,
  } = data;

  const gstin = order.vendorDetails?.gstin || null;
  const showPricing = !hidePricing;
  const paymentLabel = paymentType ? paymentTypeLabels[paymentType] : null;

  let totalsSection = "";
  if (showPricing) {
    const totals = computeReceiptTotals(items, order.totalAmount);
    
    // Generate CGST and SGST breakdown for separate GST items
    const cgstSgstBreakdownHtml =
      totals.gstBreakdown.length > 0
        ? totals.gstBreakdown
            .map(
              (entry) => `
      <div class="total-row">
        <span>CGST @ ${entry.cgstRate.toFixed(2)}%</span>
        <span>${formatINR(entry.cgstAmount)}</span>
      </div>
      <div class="total-row">
        <span>SGST @ ${entry.sgstRate.toFixed(2)}%</span>
        <span>${formatINR(entry.sgstAmount)}</span>
      </div>`,
            )
            .join("")
        : "";
    
    // Generate CGST and SGST for included GST
    const cgstSgstIncludedHtml =
      totals.gstIncluded > 0
        ? `
      <div class="total-row">
        <span>CGST (included)</span>
        <span>${formatINR(totals.cgstIncluded)}</span>
      </div>
      <div class="total-row">
        <span>SGST (included)</span>
        <span>${formatINR(totals.sgstIncluded)}</span>
      </div>`
        : "";
    
    const roundOffRow =
      Math.abs(totals.roundOff) >= 0.01
        ? `
      <div class="total-row">
        <span>Round Off</span>
        <span>${formatINR(totals.roundOff)}</span>
      </div>`
        : "";

    totalsSection = `
    <div class="totals">
      <div class="total-row">
        <span>Subtotal</span>
        <span>${formatINR(totals.subtotal)}</span>
      </div>
      ${cgstSgstBreakdownHtml}
      ${cgstSgstIncludedHtml}
      ${roundOffRow}
      <div class="total-row">
        <span>TOTAL:</span>
        <span>${formatINR(totals.finalTotal)}</span>
      </div>
    </div>`;
  }

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Receipt #${order.id}</title>
  <style>
    @media print {
      @page { margin: 0; size: 80mm auto; }
      body { margin: 0; padding: 0; }
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Courier New', monospace; font-size: 12px; line-height: 1.4; width: 80mm; padding: 10mm 5mm; color: #000; }
    .receipt { width: 100%; }
    .header { text-align: center; margin-bottom: 10px; border-bottom: 1px dashed #000; padding-bottom: 10px; }
    .restaurant-name { font-size: 16px; font-weight: bold; margin-bottom: 2px; }
    .restaurant-address, .restaurant-phone { font-size: 10px; margin-bottom: 2px; }
    .order-info { margin: 10px 0; font-size: 11px; }
        .kot-title { font-size: 13px; font-weight: bold; text-transform: uppercase; margin-bottom: 6px; text-align: center; }
    .order-info-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .items-table { width: 100%; margin: 10px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; }
    .item-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .item-name { flex: 1; font-weight: bold; }
    .item-qty { width: 30px; text-align: center; }
    .item-price { width: 60px; text-align: right; }
    .totals { margin: 10px 0; border-top: 1px dashed #000; padding-top: 5px; }
    .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; }
    .payment-section { margin: 12px 0; text-align: center; }
    .payment-heading { font-size: 12px; font-weight: bold; margin-bottom: 6px; text-transform: uppercase; }
    .payment-qr { display: inline-flex; padding: 4px; border: 1px dashed #000; border-radius: 4px; }
    .payment-qr img { width: 120px; height: 120px; object-fit: contain; }
    .footer { text-align: center; margin-top: 10px; font-size: 10px; border-top: 1px dashed #000; padding-top: 5px; }
    .thank-you { font-weight: bold; margin: 3px 0; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="restaurant-name">${restaurantName}</div>
      ${restaurantAddress ? `<div class="restaurant-address">${restaurantAddress}</div>` : ''}
      ${gstin ? `<div class="restaurant-phone">GST: ${gstin}</div>` : ''}
      ${restaurantPhone ? `<div class="restaurant-phone">Tel: ${restaurantPhone}</div>` : ''}
    </div>

    <div class="order-info">
      ${title ? `<div class="kot-title">${title}</div>` : ""}
      ${ticketNumber ? `<div class="order-info-row"><span>Ticket #:</span><span><strong>${ticketNumber}</strong></span></div>` : ""}
      <div class="order-info-row"><span>Order #:</span><span><strong>${order.id}</strong></span></div>
      <div class="order-info-row"><span>Table:</span><span>${order.tableId || 'N/A'}</span></div>
      <div class="order-info-row"><span>Date:</span><span>${new Date(order.createdAt!).toLocaleDateString()}</span></div>
      <div class="order-info-row"><span>Time:</span><span>${new Date(order.createdAt!).toLocaleTimeString()}</span></div>
      <div class="order-info-row"><span>Customer:</span><span>${order.customerName || 'Guest'}</span></div>
      <div class="order-info-row"><span>Phone:</span><span>${order.customerPhone || '-'}</span></div>
      <div class="order-info-row"><span>Status:</span><span><strong>${order.status.toUpperCase()}</strong></span></div>
      ${paymentLabel ? `<div class="order-info-row"><span>Payment:</span><span><strong>${paymentLabel}</strong></span></div>` : ''}
    </div>

    ${items.length > 0 ? `
    <div class="items-table">
      <div class="item-row" style="font-weight:bold; border-bottom:1px solid #000; padding-bottom:3px; margin-bottom:3px;">
        <div class="item-name">Item</div>
        <div class="item-qty">Qty</div>
        ${showPricing ? `<div class="item-price">Price</div>` : ""}
      </div>
      ${items.map(item => {
        const rowAmount =
          item.gstMode === "include" ? item.lineTotal : item.baseSubtotal;
        return `
      <div class="item-row">
        <div class="item-name">${item.name}</div>
        <div class="item-qty">${item.quantity}</div>
        ${showPricing ? `<div class="item-price">${formatINR(rowAmount)}</div>` : ""}
      </div>`;
      }).join('')}
    </div>` : ''}

    ${totalsSection}

    ${
      paymentQrCodeUrl
        ? `
    <div class="payment-section">
      <div class="payment-heading">Scan to Pay</div>
      <div class="payment-qr">
        <img src="${paymentQrCodeUrl}" alt="Scan to pay" />
      </div>
    </div>`
        : ""
    }

    <div class="footer">
      <div class="thank-you">Thank You!</div>
      <div>Hukam Mere Aaka</div>
      <div style="margin-top:5px;">===========================</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

interface InvoiceData extends ReceiptData {
  paymentType: PaymentType;
}

export function generateA4Invoice(data: InvoiceData): string {
  const {
    order,
    restaurantName = order.vendorDetails?.name || "QuickBite QR",
    restaurantAddress = order.vendorDetails?.address || "",
    restaurantPhone = order.vendorDetails?.phone || "",
    paymentQrCodeUrl = data.paymentQrCodeUrl ?? order.vendorDetails?.paymentQrCodeUrl ?? null,
    paymentType,
    items = [],
  } = data;

  const gstin = order.vendorDetails?.gstin || null;
  const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const customerName = order.customerName || "Guest";
  const customerPhone = order.customerPhone || "-";
  const paymentLabel = paymentTypeLabels[paymentType];
  const totals = computeReceiptTotals(items, order.totalAmount);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice #${order.id}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm;
    }
    body {
      font-family: "Inter", "Segoe UI", Arial, sans-serif;
      color: #111827;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .invoice-container {
      max-width: 210mm;
      margin: 0 auto;
      padding: 24px 32px;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      box-shadow: 0 4px 20px rgba(15, 23, 42, 0.08);
    }
    .invoice-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #111827;
      padding-bottom: 16px;
      margin-bottom: 24px;
    }
    .invoice-title {
      font-size: 28px;
      font-weight: 700;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    .business-details, .invoice-meta {
      font-size: 14px;
      line-height: 1.6;
    }
    .invoice-meta {
      text-align: right;
    }
    .section-heading {
      font-size: 16px;
      font-weight: 600;
      text-transform: uppercase;
      color: #1f2937;
      margin-bottom: 12px;
      letter-spacing: 0.5px;
    }
    .details-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 24px;
      margin-bottom: 24px;
    }
    .details-grid div {
      font-size: 14px;
    }
    .label {
      font-weight: 600;
      color: #374151;
      margin-right: 4px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    thead {
      background-color: #f3f4f6;
    }
    th, td {
      text-align: left;
      padding: 12px 14px;
      font-size: 14px;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1f2937;
    }
    .totals {
      margin-left: auto;
      width: 60%;
    }
    .totals table {
      margin-bottom: 0;
    }
    .totals td {
      border-bottom: none;
      font-size: 15px;
    }
    .totals tr:last-child td {
      font-size: 18px;
      font-weight: 700;
      border-top: 2px solid #111827;
      padding-top: 16px;
    }
    .notes {
      margin-top: 24px;
      font-size: 13px;
      color: #4b5563;
      line-height: 1.6;
    }
    .footer {
      margin-top: 40px;
      padding-top: 16px;
      border-top: 1px solid #d1d5db;
      font-size: 12px;
      color: #6b7280;
      text-align: center;
    }
    .signature-blocks {
      display: flex;
      justify-content: space-between;
      margin-top: 40px;
      font-size: 13px;
    }
    .signature {
      width: 45%;
      text-align: center;
    }
    .signature-line {
      border-top: 1px solid #94a3b8;
      margin-top: 48px;
      padding-top: 8px;
      font-weight: 500;
    }
    .payment-section {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 24px;
    }
    .payment-card {
      border: 1px dashed #cbd5f5;
      border-radius: 8px;
      padding: 12px 16px;
      background-color: #f9fafb;
      text-align: center;
      max-width: 220px;
    }
    .payment-card h4 {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
      color: #1f2937;
    }
    .payment-card img {
      width: 160px;
      height: 160px;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="invoice-header">
      <div>
        <div class="invoice-title">Tax Invoice</div>
        <div class="business-details">
          <div><strong>${restaurantName}</strong></div>
          ${restaurantAddress ? `<div>${restaurantAddress}</div>` : ""}
          ${gstin ? `<div>GST: ${gstin}</div>` : ""}
          ${restaurantPhone ? `<div>Phone: ${restaurantPhone}</div>` : ""}
          ${order.vendorDetails?.email ? `<div>Email: ${order.vendorDetails.email}</div>` : ""}
        </div>
      </div>
      <div class="invoice-meta">
        <div><span class="label">Invoice #:</span>${order.id}</div>
        <div><span class="label">Date:</span>${formatDate(createdAt)}</div>
        <div><span class="label">Time:</span>${formatTime(createdAt)}</div>
        <div><span class="label">Payment:</span>${paymentLabel}</div>
      </div>
    </div>

    ${
      paymentQrCodeUrl
        ? `
    <div class="payment-section">
      <div class="payment-card">
        <h4>Scan to Pay</h4>
        <img src="${paymentQrCodeUrl}" alt="Scan to pay" />
      </div>
    </div>`
        : ""
    }

    <div class="section-heading">Bill To</div>
    <div class="details-grid">
      <div><span class="label">Customer:</span>${customerName}</div>
      <div><span class="label">Contact:</span>${customerPhone}</div>
      <div><span class="label">Table #:</span>${order.tableId ?? "N/A"}</div>
      <div><span class="label">Order Status:</span>${order.status.toUpperCase()}</div>
    </div>

    <div class="section-heading">Order Summary</div>
    <table>
      <thead>
        <tr>
          <th style="width: 48%;">Item Description</th>
          <th style="width: 14%;">Qty</th>
          <th style="width: 19%;">Unit Price</th>
          <th style="width: 19%;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${
          items.length > 0
            ? items
                .map(
                  (item) => `
        <tr>
          <td>${item.name}</td>
          <td>${item.quantity}</td>
          <td>${formatINR(
            item.gstMode === "include" ? item.unitPriceWithTax : item.unitPrice,
          )}</td>
          <td>${formatINR(
            item.gstMode === "include" ? item.lineTotal : item.baseSubtotal,
          )}</td>
        </tr>`
                )
                .join("")
            : `
        <tr>
          <td colspan="4" style="text-align: center; color: #6b7280;">
            No items found for this order.
          </td>
        </tr>`
        }
      </tbody>
    </table>

    <div class="totals">
      <table>
        <tbody>
          <tr>
            <td style="text-align: right;">Subtotal</td>
            <td style="text-align: right;">${formatINR(totals.subtotal)}</td>
          </tr>
          ${
            totals.gstBreakdown.length > 0
              ? totals.gstBreakdown
                  .map(
                    (entry) => `
          <tr>
            <td style="text-align: right;">CGST @ ${entry.cgstRate.toFixed(2)}%</td>
            <td style="text-align: right;">${formatINR(entry.cgstAmount)}</td>
          </tr>
          <tr>
            <td style="text-align: right;">SGST @ ${entry.sgstRate.toFixed(2)}%</td>
            <td style="text-align: right;">${formatINR(entry.sgstAmount)}</td>
          </tr>`,
                  )
                  .join("")
              : ""
          }
          ${
            totals.gstIncluded > 0
              ? `
          <tr>
            <td style="text-align: right;">CGST (included in prices)</td>
            <td style="text-align: right;">${formatINR(totals.cgstIncluded)}</td>
          </tr>
          <tr>
            <td style="text-align: right;">SGST (included in prices)</td>
            <td style="text-align: right;">${formatINR(totals.sgstIncluded)}</td>
          </tr>`
              : ""
          }
          ${
            Math.abs(totals.roundOff) >= 0.01
              ? `
          <tr>
            <td style="text-align: right;">Round Off</td>
            <td style="text-align: right;">${formatINR(totals.roundOff)}</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="text-align: right;">Total Amount Due</td>
            <td style="text-align: right;">${formatINR(totals.finalTotal)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    ${
      order.customerNotes
        ? `<div class="notes"><strong>Customer Notes:</strong> ${order.customerNotes}</div>`
        : ""
    }
    ${
      order.vendorNotes
        ? `<div class="notes"><strong>Vendor Notes:</strong> ${order.vendorNotes}</div>`
        : ""
    }

    <div class="signature-blocks">
      <div class="signature">
        <div>Customer Signature</div>
        <div class="signature-line">&nbsp;</div>
      </div>
      <div class="signature">
        <div>Authorized Signature</div>
        <div class="signature-line">&nbsp;</div>
      </div>
    </div>

    <div class="footer">
      Thank you for dining with us! | Hukam Mere Aaka
    </div>
  </div>
</body>
</html>
  `.trim();
}

export function printA4Invoice(data: InvoiceData): void {
  const invoiceHtml = generateA4Invoice(data);

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.error('Unable to access iframe document');
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(invoiceHtml);
  iframeDoc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    } catch (error) {
      console.error('Print error:', error);
      document.body.removeChild(iframe);
    }
  };
}

/** Print thermal receipt */
export function printThermalReceipt(data: ReceiptData): void {
  const receiptHtml = generateThermalReceipt(data);

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.error('Unable to access iframe document');
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(receiptHtml);
  iframeDoc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    } catch (error) {
      console.error('Print error:', error);
      document.body.removeChild(iframe);
    }
  };
}

const formatKotHeading = (title?: string) =>
  title && title.trim().length > 0 ? title.trim() : "Kitchen Order Ticket";

export function generateA4Kot(data: ReceiptData): string {
  const {
    order,
    restaurantName = order.vendorDetails?.name || "QuickBite QR",
    restaurantAddress = order.vendorDetails?.address || "",
    restaurantPhone = order.vendorDetails?.phone || "",
    items = [],
    title,
    ticketNumber,
  } = data;

  const createdAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const heading = formatKotHeading(title);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${heading} - Order #${order.id}</title>
  <style>
    @page {
      size: A4;
      margin: 12mm;
    }
    body {
      font-family: "Inter", "Segoe UI", Arial, sans-serif;
      color: #111827;
      margin: 0;
      padding: 0;
      background: #ffffff;
    }
    .kot-container {
      max-width: 210mm;
      margin: 0 auto;
      padding: 24px 32px;
      border: 1px dashed #9ca3af;
      border-radius: 8px;
    }
    .kot-header {
      text-align: center;
      margin-bottom: 24px;
    }
    .kot-heading {
      font-size: 26px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }
    .restaurant-details {
      margin-top: 8px;
      font-size: 14px;
      color: #4b5563;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px 24px;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .meta-grid div {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .meta-label {
      font-weight: 600;
      color: #374151;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }
    thead {
      background-color: #f3f4f6;
    }
    th, td {
      text-align: left;
      padding: 12px 14px;
      font-size: 14px;
      border-bottom: 1px solid #e5e7eb;
    }
    th {
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #1f2937;
    }
    .notes {
      font-size: 14px;
      color: #1f2937;
    }
  </style>
</head>
<body>
  <div class="kot-container">
    <div class="kot-header">
      <div class="kot-heading">${heading}</div>
      ${ticketNumber ? `<div style="margin-top:4px;font-size:16px;font-weight:600;">Ticket: ${ticketNumber}</div>` : ""}
      <div class="restaurant-details">
        ${restaurantName}<br/>
        ${restaurantAddress || ""}${restaurantAddress && restaurantPhone ? "<br/>" : ""}${restaurantPhone ? `Phone: ${restaurantPhone}` : ""}
      </div>
    </div>

    <div class="meta-grid">
      <div><span class="meta-label">Order #:</span><span>${order.id}</span></div>
      <div><span class="meta-label">Table:</span><span>${order.tableId || "N/A"}</span></div>
      <div><span class="meta-label">Date:</span><span>${formatDate(createdAt)}</span></div>
      <div><span class="meta-label">Time:</span><span>${formatTime(createdAt)}</span></div>
      <div><span class="meta-label">Customer:</span><span>${order.customerName || "Guest"}</span></div>
      <div><span class="meta-label">Phone:</span><span>${order.customerPhone || "-"}</span></div>
    </div>

    ${items.length > 0 ? `
    <table>
      <thead>
        <tr>
          <th style="width:50%;">Item</th>
          <th style="width:15%;">Qty</th>
          <th style="width:35%;">Notes</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
        <tr>
          <td>${item.name}</td>
          <td>${item.quantity}</td>
          <td>${itemDescription(item)}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : ""}

    ${order.customerNotes ? `
    <div class="notes">
      <strong>Customer Notes:</strong><br/>
      ${order.customerNotes}
    </div>` : ""}
  </div>
</body>
</html>
  `.trim();
}

const itemDescription = (item: ReceiptItem): string => {
  return "";
};

export function printA4Kot(data: ReceiptData): void {
  const html = generateA4Kot(data);

  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  document.body.appendChild(iframe);

  const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!iframeDoc) {
    console.error("Unable to access iframe document for KOT A4");
    document.body.removeChild(iframe);
    return;
  }

  iframeDoc.open();
  iframeDoc.write(html);
  iframeDoc.close();

  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
      setTimeout(() => document.body.removeChild(iframe), 1000);
    } catch (error) {
      console.error("KOT A4 print error:", error);
      document.body.removeChild(iframe);
    }
  };
}
