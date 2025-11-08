# Order اور Thermal Printing System - مکمل تفصیل

## ✅ کیا implement ہوا ہے:

### 1. جب User Order کرتا ہے
- Customer mobile app سے QR scan کر کے order کرتا ہے
- Order database میں save ہو جاتا ہے
- **Vendor** اور **Captain** دونوں کو order نظر آتا ہے
- Console میں log ہوتا ہے کہ نیا order آیا ہے

### 2. تین نئے APIs بنائے گئے ہیں:

#### API 1: Order کی Complete Details
```
GET /api/order/:orderId/details
```

**یہ دیتا ہے:**
- تمام items کی list (quantity, price, modifiers سمیت)
- Customer کا نام اور phone number
- Table number
- Restaurant کی information
- Order status (pending, accepted, preparing, ready, delivered)
- Customer کے special notes

#### API 2: Thermal Printer کے لیے Receipt (JSON Format)
```
GET /api/order/:orderId/receipt
```

**یہ دیتا ہے:**
- JSON format میں formatted receipt
- 48 characters wide (80mm thermal printer کے لیے)
- سب کچھ properly formatted

#### API 3: Direct Print کے لیے Plain Text
```
GET /api/order/:orderId/print
```

**یہ دیتا ہے:**
- Plain text format
- Seedha thermal printer پر بھیج سکتے ہیں
- Print کے لیے ready

## 🖨️ Receipt میں کیا کیا ہوتا ہے:

```
1. Restaurant کا نام اور address (اوپر)
2. Order number
3. Table number  
4. Date اور time
5. Customer کا نام اور phone
6. تمام ordered items:
   - Item کا نام
   - Quantity × Price
   - Modifiers (جیسے Large size, Extra cheese)
   - ہر item کا subtotal
7. Total amount (نیچے)
8. Customer کے notes (اگر ہوں)
9. Order status
10. Thank you message
```

## 📱 Vendor/Captain Panel میں استعمال:

### Step 1: سب Orders دیکھیں
```
GET /api/vendor/orders
```
سب pending orders کی list آ جائے گی

### Step 2: کسی Order کی Details دیکھیں
```
GET /api/order/1/details
```
Order #1 کی complete تفصیل

### Step 3: Print کریں
```
GET /api/order/1/print
```
Thermal printer پر print کے لیے

## 🔧 Thermal Printer سے Connect کیسے کریں:

### Android/iOS App میں:
```javascript
// Bluetooth printer سے
import BluetoothPrinter from 'react-native-thermal-printer';

async function printOrder(orderId) {
  // API سے receipt text لیں
  const response = await fetch(`/api/order/${orderId}/print`);
  const receiptText = await response.text();
  
  // Printer پر print کریں
  await BluetoothPrinter.connect(printerAddress);
  await BluetoothPrinter.print(receiptText);
}
```

### Web Dashboard میں:
```javascript
// Print button پر click کریں
function printReceipt(orderId) {
  window.open(`/api/order/${orderId}/print`, '_blank');
  // یا download کریں text file میں
}
```

## 📊 مثال Order:

**Order Details:**
- Restaurant: The Delicious Bistro
- Table: 5
- Customer: Ahmed Khan (+92-300-1234567)

**Items:**
1. Spaghetti Carbonara × 2 = Rs. 31.98
   - Size: Large
   - Extra: Extra cheese
2. Bruschetta × 1 = Rs. 8.99
3. Espresso × 2 = Rs. 4.98

**Total:** Rs. 45.95

**Customer Note:** "Please make it spicy"

## 🎯 فوائد:

### Vendor کے لیے:
✅ سب orders ایک جگہ دیکھ سکتے ہیں
✅ Print کر کے kitchen میں دے سکتے ہیں
✅ Customer کی requirements clear نظر آتی ہیں
✅ Order کو accept/reject کر سکتے ہیں

### Captain کے لیے:
✅ اپنی tables کے orders دیکھ سکتے ہیں
✅ فوری print کر سکتے ہیں
✅ Customers کو better serve کر سکتے ہیں

### Kitchen کے لیے:
✅ Thermal printer سے instant receipt
✅ تمام items کی clear list
✅ Special requests نظر آتے ہیں (Extra cheese, Spicy, وغیرہ)
✅ Table number معلوم ہوتا ہے

## 🖨️ Thermal Printer Models (تجویز کردہ):

### Bluetooth:
- Zebra ZQ220
- Epson TM-P20
- Star Micronics SM-L200

### WiFi/Network:
- Epson TM-T88VI
- Star TSP100

### USB:
- Epson TM-T20III
- Xprinter XP-58

## 📝 Testing کیسے کریں:

### 1. Order بنائیں (Mobile app سے):
```bash
POST /api/dinein/order
{
  "vendorId": 1,
  "tableId": 6,
  "items": [...],
  "totalAmount": "45.95",
  "customerName": "Ahmed Khan",
  "customerPhone": "+92-300-1234567"
}
```

### 2. Vendor Panel سے Orders دیکھیں:
```bash
GET /api/vendor/orders
```

### 3. Order Print کریں:
```bash
GET /api/order/1/print
```

## ⚙️ Settings:

### Printer Width بدلنے کے لیے:
- **58mm printer** (32 characters) = chota, portable
- **80mm printer** (48 characters) = standard restaurant receipt ✅ (current)

Code میں `server/routes.ts` file میں line number 1262 اور 1352 پر:
```typescript
const line = "================================"; // 32 chars
// یا
const line = "================================================"; // 48 chars
```

## 🔐 Important Notes:

1. **Authentication Required:** Vendor یا Captain login ہونا ضروری ہے
2. **Order ID:** ہر order کا unique ID ہوتا ہے (1, 2, 3, ...)
3. **Real-time:** جیسے ہی order آتا ہے، فوری print کر سکتے ہیں
4. **Customer Notes:** Special requests print میں show ہوتے ہیں

## 📚 تفصیلی Documentation:

- `THERMAL_PRINTER_GUIDE.md` - Complete English guide
- `THERMAL_RECEIPT_EXAMPLE.txt` - Sample receipt
- `MOBILE_API_DOCUMENTATION.md` - تمام APIs کی list

---

**خلاصہ:** جب customer order کرتا ہے، vendor اور captain دونوں دیکھ سکتے ہیں، اور thermal printer پر چھوٹی receipt print کر سکتے ہیں جس میں تمام items، quantities، prices، اور customer کے notes ہوتے ہیں! 🎉
