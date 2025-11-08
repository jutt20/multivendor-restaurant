# Thermal Printer Integration Guide

## Overview
When a customer places an order, both **Vendor** and **Captain** can view order details and print receipts on thermal printers (چھوٹے thermal printer جیسے 58mm یا 80mm).

## Features Added ✅

### 1. Order Notifications
- جب user order کرتا ہے تو vendor اور captain دونوں کو notification جاتی ہے
- Console میں log ہوتا ہے: `New order #1 received at Table 5 for The Delicious Bistro`

### 2. Order Details API
**Endpoint:** `GET /api/order/:orderId/details`

Captain اور Vendor دونوں complete order details دیکھ سکتے ہیں:
- تمام ordered items کی تفصیل
- Quantities اور prices
- Customer کی معلومات
- Table number
- Modifiers (جیسے size, extras)

### 3. Thermal Printer Receipt API
**Endpoint:** `GET /api/order/:orderId/receipt`

Returns JSON format with formatted receipt text.

**Endpoint:** `GET /api/order/:orderId/print`

Returns plain text format - directly send to thermal printer!

## Sample Thermal Printer Output

```
================================================
           The Delicious Bistro
        123 Main St, New York, NY 10001
              Phone: +1234567890
================================================
                  ORDER #1
                   Table: 5
         10/22/2025, 8:24:00 AM
================================================
Customer Information:
  Name: Ahmed Khan
  Phone: +92-300-1234567
================================================
ITEMS:
================================================
1. Spaghetti Carbonara
   Qty: 2 x 15.99
   Modifiers: {"size":"Large","extras":["Extra cheese"]}
   Subtotal: Rs. 31.98

2. Bruschetta
   Qty: 1 x 8.99
   Subtotal: Rs. 8.99

3. Espresso
   Qty: 2 x 2.49
   Subtotal: Rs. 4.98

================================================
                        TOTAL: Rs. 45.95
================================================
Customer Notes:
Please make it spicy
================================================
Status: PENDING
================================================
         Thank you for your order!
================================================
```

## How to Use from Mobile App (Vendor/Captain Panel)

### Step 1: View Vendor Orders
```bash
GET /api/vendor/orders
```

Returns list of all orders with basic info.

### Step 2: Get Order Details
```bash
GET /api/order/{orderId}/details
```

Response:
```json
{
  "order": {
    "id": 1,
    "status": "pending",
    "totalAmount": "45.95",
    "customerName": "Ahmed Khan",
    "customerPhone": "+92-300-1234567",
    "customerNotes": "Please make it spicy",
    "createdAt": "2025-10-22T08:24:00.000Z"
  },
  "restaurant": {
    "id": 1,
    "name": "The Delicious Bistro",
    "address": "123 Main St, New York, NY 10001",
    "phone": "+1234567890"
  },
  "table": {
    "id": 6,
    "tableNumber": 5
  },
  "items": [
    {
      "itemId": 4,
      "name": "Spaghetti Carbonara",
      "quantity": 2,
      "price": "15.99",
      "modifiers": {
        "size": "Large",
        "extras": ["Extra cheese"]
      },
      "subtotal": "31.98"
    },
    {
      "itemId": 1,
      "name": "Bruschetta",
      "quantity": 1,
      "price": "8.99",
      "subtotal": "8.99"
    },
    {
      "itemId": 11,
      "name": "Espresso",
      "quantity": 2,
      "price": "2.49",
      "subtotal": "4.98"
    }
  ]
}
```

### Step 3: Print Receipt
```bash
GET /api/order/{orderId}/print
```

This returns plain text formatted for 48-character width thermal printers.

## Thermal Printer Integration

### For Android/iOS Apps:

#### Option 1: Using Bluetooth Thermal Printer
```javascript
// Example using react-native-thermal-printer library
import { BluetoothManager } from 'react-native-bluetooth-escpos-printer';

async function printOrder(orderId) {
  // Get receipt text
  const response = await fetch(`/api/order/${orderId}/print`, {
    headers: {
      'Authorization': 'Bearer ' + userToken
    }
  });
  const receiptText = await response.text();
  
  // Print via Bluetooth
  await BluetoothManager.connect(printerAddress);
  await BluetoothManager.printText(receiptText);
}
```

#### Option 2: Using Network Printer (WiFi)
```javascript
// Send ESC/POS commands to network printer
async function printOrderNetwork(orderId, printerIP) {
  const response = await fetch(`/api/order/${orderId}/print`);
  const receiptText = await response.text();
  
  // Send to printer IP
  fetch(`http://${printerIP}:9100`, {
    method: 'POST',
    body: receiptText
  });
}
```

### For Web Dashboard (Vendor/Captain Panel):

#### Print Button in Order List
```javascript
function printReceipt(orderId) {
  // Open receipt in new window for printing
  window.open(`/api/order/${orderId}/print`, '_blank');
  
  // Or download as text file
  fetch(`/api/order/${orderId}/print`)
    .then(response => response.text())
    .then(text => {
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `order-${orderId}.txt`;
      a.click();
    });
}
```

## Thermal Printer Types Supported

### 58mm Printers (32 characters wide)
- Small, portable
- Good for receipts
- Modify the `line` variable to 32 dashes

### 80mm Printers (48 characters wide) ✅
- **Current implementation**
- Standard restaurant receipts
- Better readability

### To Change Width:
Edit `server/routes.ts` lines 1262, 1352:
```typescript
const line = "================================"; // 32 chars for 58mm
// or
const line = "================================================"; // 48 chars for 80mm
```

## Complete Flow

### Customer Side:
1. Scans QR code → Gets menu
2. Orders items → Sends to `/api/dinein/order`
3. Receives order confirmation

### Vendor/Captain Side:
1. **Notification**: Console log shows new order
2. **View Orders**: Check `/api/vendor/orders` for all pending orders
3. **See Details**: Click order → `/api/order/{id}/details`
4. **Print Receipt**: Click print button → `/api/order/{id}/print`
5. **Update Status**: Mark as accepted/preparing/ready/delivered

## Testing the APIs

### Create Test Order:
```bash
curl -X POST http://localhost:5000/api/dinein/order \
  -H "Content-Type: application/json" \
  -d '{
    "vendorId": 1,
    "tableId": 6,
    "items": [
      {
        "itemId": 4,
        "name": "Spaghetti Carbonara",
        "quantity": 2,
        "price": "15.99",
        "modifiers": {"size": "Large"},
        "subtotal": "31.98"
      }
    ],
    "totalAmount": "31.98",
    "customerName": "Test Customer",
    "customerPhone": "+92-300-1234567",
    "customerNotes": "Extra spicy please"
  }'
```

### Get Order Details:
```bash
curl http://localhost:5000/api/order/1/details \
  -H "Cookie: <vendor-or-captain-session>"
```

### Get Thermal Receipt:
```bash
curl http://localhost:5000/api/order/1/print \
  -H "Cookie: <vendor-or-captain-session>"
```

## Receipt Format Details

### Header Section:
- Restaurant name (centered)
- Address (centered)
- Phone number (centered)
- Order ID & Table number
- Date and time

### Customer Section:
- Customer name
- Customer phone

### Items Section:
- Item number
- Item name
- Quantity × Price
- Modifiers (if any)
- Subtotal

### Footer Section:
- Total amount (right-aligned)
- Customer notes (if any)
- Order status
- Thank you message

## Benefits

### For Vendor:
✅ سب orders ایک جگہ نظر آتے ہیں
✅ Print کر کے kitchen میں بھیج سکتے ہیں
✅ Customer کی details اور notes دیکھ سکتے ہیں
✅ Order status update کر سکتے ہیں

### For Captain:
✅ اپنی assigned tables کے orders دیکھ سکتے ہیں  
✅ فوری print کر کے serve کر سکتے ہیں
✅ Customer requirements پوری کر سکتے ہیں

### For Kitchen:
✅ Thermal printer سے instantly receipt آ جاتی ہے
✅ تمام items کی clear list
✅ Modifiers اور special requests نظر آتے ہیں
✅ Table number معلوم ہوتا ہے

## Popular Thermal Printer Models

### Bluetooth Printers:
- Zebra ZQ110 / ZQ220
- Epson TM-P20
- Star Micronics SM-L200

### WiFi/Network Printers:
- Epson TM-T88VI
- Star TSP100
- Bixolon SRP-350III

### USB Printers:
- Epson TM-T20III
- Xprinter XP-58

## Recommended Libraries

### React Native:
- `react-native-thermal-printer`
- `react-native-bluetooth-escpos-printer`
- `react-native-star-prnt`

### Flutter:
- `esc_pos_printer`
- `blue_thermal_printer`

### Web (for vendor dashboard):
- Browser print dialog
- Direct ESC/POS commands via network

## Next Steps

1. Install thermal printer SDK in your mobile app
2. Test with your printer model
3. Customize receipt format as needed
4. Add auto-print feature for new orders
5. Configure printer settings in admin panel

---

**Note**: Vendor اور Captain login required ہے ان APIs کو access کرنے کے لیے۔ Authentication token include کریں requests میں۔
