import type { Order } from '@shared/schema';

interface ReceiptData {
  order: Order;
  restaurantName?: string;
  restaurantAddress?: string;
  restaurantPhone?: string;
  items?: Array<{
    name: string;
    quantity: number;
    price: number;
  }>;
}

/** Currency formatter for INR */
const formatINR = (amount: number | string) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(Number(amount));
};

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
    items = [],
  } = data;

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
    .order-info-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .items-table { width: 100%; margin: 10px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 5px 0; }
    .item-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .item-name { flex: 1; font-weight: bold; }
    .item-qty { width: 30px; text-align: center; }
    .item-price { width: 60px; text-align: right; }
    .totals { margin: 10px 0; border-top: 1px dashed #000; padding-top: 5px; }
    .total-row { display: flex; justify-content: space-between; font-weight: bold; font-size: 13px; }
    .footer { text-align: center; margin-top: 10px; font-size: 10px; border-top: 1px dashed #000; padding-top: 5px; }
    .thank-you { font-weight: bold; margin: 3px 0; }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <div class="restaurant-name">${restaurantName}</div>
      ${restaurantAddress ? `<div class="restaurant-address">${restaurantAddress}</div>` : ''}
      ${restaurantPhone ? `<div class="restaurant-phone">Tel: ${restaurantPhone}</div>` : ''}
    </div>

    <div class="order-info">
      <div class="order-info-row"><span>Order #:</span><span><strong>${order.id}</strong></span></div>
      <div class="order-info-row"><span>Table:</span><span>${order.tableId || 'N/A'}</span></div>
      <div class="order-info-row"><span>Date:</span><span>${new Date(order.createdAt!).toLocaleDateString()}</span></div>
      <div class="order-info-row"><span>Time:</span><span>${new Date(order.createdAt!).toLocaleTimeString()}</span></div>
      <div class="order-info-row"><span>Customer:</span><span>${order.customerName || 'Guest'}</span></div>
      <div class="order-info-row"><span>Phone:</span><span>${order.customerPhone || '-'}</span></div>
      <div class="order-info-row"><span>Status:</span><span><strong>${order.status.toUpperCase()}</strong></span></div>
    </div>

    ${items.length > 0 ? `
    <div class="items-table">
      <div class="item-row" style="font-weight:bold; border-bottom:1px solid #000; padding-bottom:3px; margin-bottom:3px;">
        <div class="item-name">Item</div>
        <div class="item-qty">Qty</div>
        <div class="item-price">Price</div>
      </div>
      ${items.map(item => `
      <div class="item-row">
        <div class="item-name">${item.name}</div>
        <div class="item-qty">${item.quantity}</div>
        <div class="item-price">${formatINR(item.price * item.quantity)}</div>
      </div>
      `).join('')}
    </div>` : ''}

    <div class="totals">
      <div class="total-row">
        <span>TOTAL:</span>
        <span>${formatINR(order.totalAmount)}</span>
      </div>
    </div>

    <div class="footer">
      <div class="thank-you">Thank You!</div>
      <div>Powered by QuickBite QR App</div>
      <div style="margin-top:5px;">===========================</div>
    </div>
  </div>
</body>
</html>
  `.trim();
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
