# QuickBiteQR Mobile App API Documentation

## Base URL
`http://your-domain.com/api`

---

## 1. Authentication APIs

### 1.1 Register New User
**Endpoint:** `POST /register`

**Request Body:**
```json
{
  "name": "John Doe",
  "phone": "+1234567890",
  "email": "john@example.com",
  "password": "securePassword123",
  "confirm_password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful",
  "user": {
    "id": 1,
    "name": "John Doe",
    "phone": "+1234567890",
    "email": "john@example.com"
  }
}
```

---

### 1.2 Login
**Endpoint:** `POST /login`

**Flow:**
1. First, call `/send-otp` with the phone number to receive an OTP
2. Then, call `/login` with phone and the OTP code

**Request Body:**
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "name": "John Doe",
    "phone": "+1234567890",
    "email": "john@example.com"
  }
}
```

**Note:** Users must first request an OTP via `/send-otp` before logging in.

---

### 1.3 Send OTP
**Endpoint:** `POST /send-otp`

**Request Body:**
```json
{
  "phone": "+1234567890"
}
```

**Response:**
```json
{
  "success": true,
  "message": "OTP sent successfully",
  "otp": "123456"  // Only in development mode
}
```

**Note:** Configure Twilio in Admin Settings for production SMS delivery.

---

### 1.4 Verify OTP
**Endpoint:** `POST /verify-otp`

**Request Body:**
```json
{
  "phone": "+1234567890",
  "otp": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Phone number verified successfully"
}
```

---

## 2. Home Delivery APIs

### 2.1 Get Nearby Restaurants
**Endpoint:** `GET /restaurants/nearby`

**Query Parameters:**
- `latitude` (float, required) - User's latitude
- `longitude` (float, required) - User's longitude

**Example:**
```
GET /restaurants/nearby?latitude=37.7749&longitude=-122.4194
```

**Response:**
```json
[
  {
    "id": 1,
    "restaurantName": "The Delicious Bistro",
    "address": "123 Main St, New York, NY 10001",
    "cuisineType": "Italian",
    "rating": "4.50",
    "reviewCount": 120,
    "image": "/uploads/restaurant-1.jpg"
  }
]
```

---

### 2.2 Get Restaurant Menu
**Endpoint:** `GET /restaurants/:restaurant_id/menu`

**Example:**
```
GET /restaurants/1/menu
```

**Response:**
```json
{
  "restaurant": {
    "id": 1,
    "restaurantName": "The Delicious Bistro",
    "address": "123 Main St",
    "cuisineType": "Italian"
  },
  "categories": [
    {
      "id": 1,
      "name": "Appetizers",
      "description": "Start your meal",
      "items": [
        {
          "id": 1,
          "name": "Bruschetta",
          "description": "Grilled bread with tomatoes",
          "price": "8.99",
          "photo": "/uploads/item-1.jpg",
          "tags": ["popular", "vegetarian"],
          "isAvailable": true
        }
      ]
    }
  ]
}
```

---

### 2.3 Add to Cart
**Endpoint:** `POST /cart/add`

**Request Body:**
```json
{
  "user_id": 1,
  "item_id": 5,
  "quantity": 2
}
```

**Response:**
```json
{
  "success": true,
  "cart_item": {
    "id": 10,
    "userId": 1,
    "itemId": 5,
    "quantity": 2,
    "vendorId": 1
  }
}
```

---

### 2.4 Confirm Delivery Booking
**Endpoint:** `POST /booking/confirm`

**Request Body:**
```json
{
  "user_id": 1,
  "restaurant_id": 1,
  "items": [
    {
      "itemId": 1,
      "name": "Bruschetta",
      "quantity": 2,
      "price": "8.99",
      "subtotal": "17.98"
    }
  ],
  "total_amount": "17.98",
  "delivery_address": "456 Oak Street, Apt 3B",
  "delivery_latitude": 37.7749,
  "delivery_longitude": -122.4194,
  "customer_notes": "Ring doorbell twice"
}
```

**Response:**
```json
{
  "success": true,
  "order_id": 42,
  "message": "Order placed successfully"
}
```

---

## 3. Dine-In (QR Code) APIs

### 3.1 Scan QR Code
**Endpoint:** `POST /table/scan`

**Request Body:**
```json
{
  "qrData": "vendor:1:table:5"
}
```

**Response:**
```json
{
  "vendorId": 1,
  "restaurantName": "The Delicious Bistro",
  "tableNumber": 5
}
```

---

### 3.2 Scan QR Code and Get Complete Menu (Recommended)
**Endpoint:** `POST /api/table/scan-menu`

**Description:** This is the recommended endpoint for mobile apps. It combines QR code scanning and menu retrieval in a single API call, reducing latency and providing all necessary information to display the restaurant menu after scanning a table QR code.

**Request Body:**
```json
{
  "qrData": "vendor:1:table:5"
}
```

**Response:**
```json
{
  "success": true,
  "table": {
    "id": 10,
    "tableNumber": 5
  },
  "restaurant": {
    "id": 1,
    "restaurantName": "The Delicious Bistro",
    "address": "123 Main St, New York, NY 10001",
    "cuisineType": "Italian",
    "description": "Authentic Italian cuisine",
    "image": "/uploads/restaurant-1.jpg",
    "rating": "4.50",
    "reviewCount": 120
  },
  "menu": [
    {
      "id": 1,
      "name": "Appetizers",
      "description": "Start your meal",
      "displayOrder": 0,
      "items": [
        {
          "id": 1,
          "name": "Bruschetta",
          "description": "Grilled bread with tomatoes",
          "price": "8.99",
          "photo": "/uploads/item-1.jpg",
          "modifiers": null,
          "tags": ["popular", "vegetarian"]
        }
      ]
    },
    {
      "id": 2,
      "name": "Main Courses",
      "description": "Our signature dishes",
      "displayOrder": 1,
      "items": [
        {
          "id": 3,
          "name": "Spaghetti Carbonara",
          "description": "Classic Italian pasta",
          "price": "15.99",
          "photo": "/uploads/item-3.jpg",
          "modifiers": {
            "size": ["Regular", "Large"],
            "extras": ["Extra cheese", "Bacon"]
          },
          "tags": ["popular"]
        }
      ]
    }
  ]
}
```

**Error Responses:**
- `400` - Invalid QR code format
- `403` - Restaurant is not currently accepting orders
- `404` - Table or restaurant not found
- `500` - Server error

---

### 3.3 Get Menu for Dine-In (Alternative)
**Endpoint:** `GET /restaurants/:vendorId/menu`

Same as home delivery menu endpoint (2.2). Use this if you already have the vendor ID.

---

### 3.4 Place Dine-In Order
**Endpoint:** `POST /dinein/order`

**Request Body:**
```json
{
  "vendorId": 1,
  "tableId": 5,
  "items": [
    {
      "itemId": 3,
      "name": "Spaghetti Carbonara",
      "quantity": 1,
      "price": "15.99",
      "subtotal": "15.99"
    }
  ],
  "totalAmount": "15.99",
  "customerName": "John Doe",
  "customerPhone": "+1234567890",
  "customerNotes": "Extra cheese please"
}
```

**Response:**
```json
{
  "id": 15,
  "vendorId": 1,
  "tableId": 5,
  "status": "pending",
  "totalAmount": "15.99",
  "createdAt": "2025-10-20T12:30:00.000Z"
}
```

---

### 3.5 Get Dine-In Order History
**Endpoint:** `GET /dinein/orders`

**Query Parameters:**
- `user_id` (integer, required) - User ID

**Example:**
```
GET /dinein/orders?user_id=1
```

**Response:**
```json
[
  {
    "id": 15,
    "vendorId": 1,
    "userId": 1,
    "status": "delivered",
    "totalAmount": "15.99",
    "createdAt": "2025-10-20T12:30:00.000Z",
    "deliveredAt": "2025-10-20T13:15:00.000Z"
  }
]
```

---

## Status Codes

- `200` - Success
- `400` - Bad Request (missing or invalid parameters)
- `401` - Unauthorized (invalid credentials or expired OTP)
- `404` - Not Found (restaurant, item, or order not found)
- `409` - Conflict (phone number already registered)
- `500` - Internal Server Error

---

## Order Status Flow

### Dine-In Orders:
`pending` → `accepted` → `preparing` → `ready` → `delivered`

### Delivery Orders:
`pending` → `accepted` → `preparing` → `ready` → `out_for_delivery` → `delivered`

---

## Integration Setup

### Twilio SMS (Admin Configuration)
1. Log in to Admin Dashboard
2. Go to Settings → Integrations
3. Enable Twilio
4. Add your Twilio credentials:
   - Account SID
   - Auth Token
   - Phone Number

### Firebase Push Notifications (Coming Soon)
Push notifications will be sent for:
- Order status updates
- New promotions
- Special offers

---

## Testing

All endpoints can be tested using:
- **Postman**: Import the API collection
- **cURL**: See examples above
- **Mobile App**: Use the provided SDKs

### Test Credentials
- **Mobile User**: Phone `+1234567890` (OTP-based login only)
- **Sample Restaurant ID**: `1`
- **Sample Menu Items**: IDs `1-5`

---

## Rate Limiting

Currently no rate limiting is enforced. For production:
- Authentication endpoints: 5 requests per minute
- General endpoints: 100 requests per minute

---

## Support

For API issues or questions:
- Check server logs in Admin Dashboard
- Contact platform administrator
- Review this documentation for updates
