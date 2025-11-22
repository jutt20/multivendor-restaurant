# QuickBiteQR - App User API Workflow Documentation

## Table of Contents
1. [Overview](#overview)
2. [Base URL & Authentication](#base-url--authentication)
3. [Authentication Workflow](#authentication-workflow)
4. [User Profile Management](#user-profile-management)
5. [Address Management](#address-management)
6. [Home Delivery Workflow](#home-delivery-workflow)
7. [Pickup Workflow](#pickup-workflow)
8. [Dine-In (QR Code) Workflow](#dine-in-qr-code-workflow)
9. [Order Tracking](#order-tracking)
10. [Error Handling](#error-handling)
11. [Complete Workflow Diagrams](#complete-workflow-diagrams)

---

## Overview

This document describes the complete API workflow for mobile app users in the QuickBiteQR platform. The system supports three main ordering methods:
- **Home Delivery**: Users browse nearby restaurants, add items to cart, and place delivery orders
- **Dine-In**: Users scan QR codes at restaurant tables to view menus and place orders
- **Pickup**: Users browse nearby restaurants, add items to cart, and place pickup orders for takeaway

---

## Base URL & Authentication

### Base URL
```
http://your-domain.com/api
```

### Authentication Methods

#### 1. JWT Token Authentication (Protected Endpoints)
After successful login, users receive a JWT token that must be included in the `Authorization` header:

```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Protected Endpoints:**
- All cart operations (`/api/cart/*`)
- User profile endpoints (`/api/user/profile`, `/api/app_user/update`)
- Address management (`/api/address/*`)

#### 2. Public Endpoints (No Authentication)
- Restaurant browsing (`/api/restaurants/nearby`)
- Menu viewing (`/api/restaurants/:vendorId/menu`)
- QR code scanning (`/api/table/scan`, `/api/table/scan-menu`)
- Order placement (some endpoints)

---

## Authentication Workflow

### Flow 1: New User Registration & Verification

```
Step 1: Register → Step 2: Send OTP → Step 3: Verify OTP → Step 4: Set Password (Optional) → Step 5: Login
```

#### 1.1 Register New User
**Endpoint:** `POST /api/register`

**Request:**
```json
{
  "name": "John Doe",
  "phone": "+1234567890",
  "email": "john@example.com"  // Optional
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

**Status Codes:**
- `200` - Registration successful
- `400` - Missing required fields (name, phone)
- `409` - Phone number already registered
- `500` - Server error

---

#### 1.2 Send OTP
**Endpoint:** `POST /api/send-otp`

**Request:**
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

**Notes:**
- OTP expires in 10 minutes
- In development, default OTP is "123456" (unless Twilio is configured)
- In production, OTP is sent via SMS if Twilio is configured

---

#### 1.3 Verify OTP
**Endpoint:** `POST /api/verify-otp`

**Request:**
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
  "message": "Phone number verified successfully",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "phone": "+1234567890",
    "email": "john@example.com"
  }
}
```

**Important:** Save the `token` - it's required for authenticated endpoints!

**Status Codes:**
- `200` - OTP verified, user phone marked as verified
- `400` - Missing phone or OTP
- `401` - Invalid or expired OTP
- `404` - User not found
- `500` - Server error

---

#### 1.4 Set Password (Optional)
**Endpoint:** `POST /api/set-password`

**Request:**
```json
{
  "phone": "+1234567890",
  "password": "securePassword123",
  "confirm_password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password set successfully",
  "user": {
    "id": 1,
    "name": "John Doe",
    "phone": "+1234567890",
    "email": "john@example.com"
  }
}
```

**Prerequisites:**
- User must be phone verified (`isPhoneVerified: true`)
- Password must be at least 4 characters

**Status Codes:**
- `200` - Password set successfully
- `400` - Passwords don't match or too short
- `403` - User not verified
- `404` - User not found

---

### Flow 2: Existing User Login

```
Step 1: Login with Phone + Password → Receive JWT Token
```

#### 2.1 Login
**Endpoint:** `POST /api/login`

**Request:**
```json
{
  "phone": "+1234567890",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "John Doe",
    "phone": "+1234567890",
    "email": "john@example.com",
    "state": "California",
    "city": "San Francisco"
  }
}
```

**Status Codes:**
- `200` - Login successful
- `400` - Missing phone or password
- `401` - Invalid credentials or password not set
- `500` - Server error

---

## User Profile Management

### 3.1 Get User Profile
**Endpoint:** `GET /api/user/profile`  
**Authentication:** Required (JWT Token)

**Request Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**
```json
{
  "success": true,
  "user": {
    "id": 1,
    "name": "John Doe",
    "phone": "+1234567890",
    "email": "john@example.com",
    "state": "California",
    "city": "San Francisco",
    "createdAt": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### 3.2 Update User Profile
**Endpoint:** `PUT /api/app_user/update`  
**Authentication:** Required (JWT Token)

**Request Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request Body:**
```json
{
  "name": "John Smith",      // Optional
  "email": "newemail@example.com",  // Optional
  "phone": "+1987654321",    // Optional
  "city": "Los Angeles",    // Optional
  "state": "California"     // Optional
}
```

**Response:**
```json
{
  "status": true,
  "message": "User updated successfully",
  "user": {
    "id": 1,
    "name": "John Smith",
    "phone": "+1987654321",
    "email": "newemail@example.com",
    "city": "Los Angeles",
    "state": "California"
  }
}
```

**Note:** At least one field must be provided for update.

---

## Address Management

All address endpoints require JWT authentication.

### 4.1 Create Address
**Endpoint:** `POST /api/address/create`  
**Authentication:** Required (JWT Token)

**Request:**
```json
{
  "type": "home",  // "home", "work", "other"
  "fullAddress": "123 Main Street, Apt 4B",
  "landmark": "Near Central Park",  // Optional
  "city": "New York",
  "zipCode": "10001",
  "latitude": 40.7128,  // Optional (can use "lat")
  "longitude": -74.0060,  // Optional (can use "long")
  "isDefault": false  // Optional, default: false
}
```

**Response:**
```json
{
  "success": true,
  "address": {
    "id": 1,
    "userId": 1,
    "type": "home",
    "fullAddress": "123 Main Street, Apt 4B",
    "landmark": "Near Central Park",
    "city": "New York",
    "zipCode": "10001",
    "latitude": "40.7128",
    "longitude": "-74.0060",
    "isDefault": true,
    "createdAt": "2025-01-15T10:30:00.000Z"
  }
}
```

---

### 4.2 List User Addresses
**Endpoint:** `GET /api/address/list`  
**Authentication:** Required (JWT Token)

**Response:**
```json
{
  "success": true,
  "addresses": [
    {
      "id": 1,
      "type": "home",
      "fullAddress": "123 Main Street, Apt 4B",
      "city": "New York",
      "zipCode": "10001",
      "isDefault": true
    },
    {
      "id": 2,
      "type": "work",
      "fullAddress": "456 Business Ave",
      "city": "New York",
      "zipCode": "10002",
      "isDefault": false
    }
  ]
}
```

---

### 4.3 Update Address
**Endpoint:** `PUT /api/address/update/:id`  
**Authentication:** Required (JWT Token)

**Request:**
```json
{
  "type": "home",
  "fullAddress": "Updated Address",
  "city": "New York",
  "zipCode": "10001",
  "isDefault": true
}
```

**Response:**
```json
{
  "success": true,
  "address": {
    "id": 1,
    "type": "home",
    "fullAddress": "Updated Address",
    "city": "New York",
    "zipCode": "10001",
    "isDefault": true
  }
}
```

---

### 4.4 Delete Address
**Endpoint:** `DELETE /api/address/delete/:id`  
**Authentication:** Required (JWT Token)

**Response:**
```json
{
  "success": true,
  "message": "Address deleted successfully"
}
```

---

### 4.5 Set Default Address
**Endpoint:** `POST /api/address/set-default/:id`  
**Authentication:** Required (JWT Token)

**Response:**
```json
{
  "success": true,
  "message": "Default address updated"
}
```

---

## Home Delivery Workflow

### Complete Flow Diagram

```
1. Browse Nearby Restaurants
   ↓
2. View Restaurant Menu
   ↓
3. Add Items to Cart (Authenticated)
   ↓
4. Manage Cart (View/Update/Remove)
   ↓
5. Place Delivery Order
   ↓
6. Edit Delivery Order (Optional, if status is pending)
   ↓
7. Track Order Status
```

---

### 5.1 Get Nearby Restaurants
**Endpoint:** `GET /api/restaurants/nearby`  
**Authentication:** Not Required

**Query Parameters:**
- `latitude` (float, required) - User's latitude
- `longitude` (float, required) - User's longitude

**Example:**
```
GET /api/restaurants/nearby?latitude=37.7749&longitude=-122.4194
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
    "image": "/uploads/restaurant-1.jpg",
    "isDeliveryEnabled": true,
    "isPickupEnabled": false
  },
  {
    "id": 2,
    "restaurantName": "Spice Garden",
    "address": "456 Oak Ave, New York, NY 10002",
    "cuisineType": "Indian",
    "rating": "4.75",
    "reviewCount": 89,
    "image": "/uploads/restaurant-2.jpg",
    "isDeliveryEnabled": true,
    "isPickupEnabled": true
  }
]
```

---

### 5.2 Get Restaurant Menu
**Endpoint:** `GET /api/restaurants/:vendorId/menu`  
**Authentication:** Not Required

**Alternative Endpoint:** `GET /restaurants/:restaurant_id/menu`

**Query Parameters (Optional):**
- `latitude` (float, optional) - User's latitude for distance calculation
- `longitude` (float, optional) - User's longitude for distance calculation

**Example:**
```
GET /api/restaurants/1/menu?latitude=37.7749&longitude=-122.4194
```

**Response:**
```json
{
  "success": true,
  "restaurant": {
    "id": 1,
    "restaurantName": "The Delicious Bistro",
    "address": "123 Main St, New York, NY 10001",
    "description": "Authentic Italian cuisine with a modern twist",
    "cuisineType": "Italian",
    "phone": "+1234567890",
    "gstin": "29ABCDE1234F1Z5",
    "image": "/uploads/restaurant-1.jpg",
    "rating": 4.5,
    "reviewCount": 120,
    "status": "approved",
    "location": {
      "latitude": 37.7749,
      "longitude": -122.4194
    },
    "services": {
      "isDeliveryEnabled": true,
      "isPickupEnabled": false,
      "isDeliveryAllowed": true,
      "isPickupAllowed": true
    },
    "payment": {
      "paymentQrCodeUrl": "https://example.com/payment-qr.jpg"
    },
    "distance": {
      "kilometers": 2.5,
      "formatted": "2.5km"
    },
    "metadata": {
      "createdAt": "2025-01-15T10:30:00.000Z",
      "updatedAt": "2025-01-20T15:45:00.000Z"
    }
  },
  "menu": {
    "categories": [
      {
        "id": 1,
        "name": "Appetizers",
        "description": "Start your meal",
        "displayOrder": 0,
        "isActive": true,
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z",
        // Items with NO subcategory (directly under category)
        "items": [
          {
            "id": 1,
            "name": "Bruschetta",
            "description": "Grilled bread with tomatoes and basil",
            "price": "8.99",
            "photo": "/uploads/item-1.jpg",
            "modifiers": null,
            "tags": ["popular", "vegetarian"],
            "isAvailable": true,
            "displayOrder": 0,
            "subCategoryId": null,
            "addons": [
              {
                "id": 1,
                "name": "Extra Cheese",
                "price": "2.00",
                "isRequired": false,
                "category": null
              }
            ],
            "createdAt": "2025-01-15T10:30:00.000Z",
            "updatedAt": "2025-01-15T10:30:00.000Z"
          }
        ],
        // Subcategories containing items WITH subcategory
        "subcategories": []
      },
      {
        "id": 2,
        "name": "Main Courses",
        "description": "Our signature dishes",
        "displayOrder": 1,
        "isActive": true,
        "createdAt": "2025-01-15T10:30:00.000Z",
        "updatedAt": "2025-01-15T10:30:00.000Z",
        // Items with NO subcategory (empty if all items have subcategories)
        "items": [],
        // Subcategories containing items WITH subcategory
        "subcategories": [
          {
            "id": 1,
            "categoryId": 2,
            "name": "Pasta",
            "description": "Handmade pasta dishes",
            "displayOrder": 0,
            "isActive": true,
            "createdAt": "2025-01-15T10:30:00.000Z",
            "updatedAt": "2025-01-15T10:30:00.000Z",
            // Items WITH subcategory (belonging to this subcategory)
            "items": [
              {
                "id": 3,
                "name": "Spaghetti Carbonara",
                "description": "Classic Italian pasta with bacon and cream",
                "price": "15.99",
                "photo": "/uploads/item-3.jpg",
                "modifiers": {
                  "size": ["Regular", "Large"],
                  "extras": ["Extra cheese", "Bacon"]
                },
                "tags": ["popular"],
                "isAvailable": true,
                "displayOrder": 0,
                "subCategoryId": 1,
                // Addons for items with subcategory
                "addons": [
                  {
                    "id": 5,
                    "name": "Extra Parmesan",
                    "price": "1.50",
                    "isRequired": false,
                    "category": "cheese"
                  },
                  {
                    "id": 6,
                    "name": "Extra Bacon",
                    "price": "2.00",
                    "isRequired": false,
                    "category": "meat"
                  }
                ],
                "createdAt": "2025-01-15T10:30:00.000Z",
                "updatedAt": "2025-01-15T10:30:00.000Z"
              }
            ]
          }
        ]
      }
    ],
    "summary": {
      "totalCategories": 2,
      "totalSubcategories": 1,
      "totalItems": 25,
      "totalAddons": 10,
      "availableItems": 25
    }
  },
  "generatedAt": "2025-01-15T10:30:00.000Z"
}
```

**Response Structure:**
- `success` (boolean) - Indicates if the request was successful
- `restaurant` (object) - Complete restaurant information including:
  - Basic details (name, address, description, cuisine type)
  - Contact information (phone)
  - Business details (GSTIN, image, rating, review count)
  - Status (approval status)
  - Location (latitude, longitude)
  - Services (delivery/pickup availability)
  - Payment (payment QR code URL)
  - Distance (calculated if user coordinates provided)
  - Metadata (created/updated timestamps)
- `menu` (object) - Organized menu structure (no redundant data):
  - `categories` (array) - Menu categories, each containing:
    - `items` (array) - **Items with NO subcategory** (directly under category)
      - Each item includes its `addons` array
    - `subcategories` (array) - Subcategories, each containing:
      - `items` (array) - **Items WITH subcategory** (belonging to this subcategory)
        - Each item includes its `addons` array
  - `summary` (object) - Menu statistics (counts)
- `generatedAt` (string) - ISO timestamp of when the response was generated

**Menu Structure Format:**
```
menu.categories[] = {
  items: [],           // Items with NO subcategory (subCategoryId = null)
  subcategories[] = {
    items: []          // Items WITH subcategory (subCategoryId = subcategory.id)
  }
}
```

**Important Notes:**
- Items in `categories[].items` have `subCategoryId: null` and include their addons
- Items in `categories[].subcategories[].items` have a `subCategoryId` value and include their addons
- All items (whether in category or subcategory) include their associated `addons` array

**Distance Calculation:**
- If `latitude` and `longitude` query parameters are provided, the API calculates the distance from the user's location to the restaurant
- Distance is returned in both kilometers (numeric) and formatted string (e.g., "2.5km" or "500m")
- If coordinates are not provided or restaurant location is missing, `distance` will be `null`

**Notes:**
- Only available items are included in the response
- Categories and items are sorted by `displayOrder`
- Subcategories are nested within their parent categories
- All items include their associated addons
- **No redundant data**: The response only contains the organized nested structure in `categories`. Flat lists of items, subcategories, and addons are not included to keep the response clean and efficient

---

### 5.3 Add to Cart
**Endpoint:** `POST /api/cart/add`  
**Authentication:** Required (JWT Token)

**Request:**
```json
{
  "item_id": 1,
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
    "itemId": 1,
    "vendorId": 1,
    "quantity": 2,
    "createdAt": "2025-01-15T10:30:00.000Z"
  }
}
```

**Notes:**
- User ID is automatically extracted from JWT token
- Cart can only contain items from one vendor at a time
- Adding items from a different vendor will replace existing cart items

---

### 5.4 Get Cart
**Endpoint:** `GET /api/cart/get`  
**Authentication:** Required (JWT Token)

**Response:**
```json
{
  "success": true,
  "items": [
    {
      "id": 10,
      "userId": 1,
      "itemId": 1,
      "vendorId": 1,
      "quantity": 2,
      "menuItem": {
        "id": 1,
        "name": "Bruschetta",
        "price": "8.99",
        "photo": "/uploads/item-1.jpg"
      }
    }
  ]
}
```

---

### 5.5 Update Cart Item
**Endpoint:** `PUT /api/cart/update/:itemId`  
**Authentication:** Required (JWT Token)

**Request:**
```json
{
  "quantity": 3
}
```

**Response:**
```json
{
  "success": true,
  "cart_item": {
    "id": 10,
    "userId": 1,
    "itemId": 1,
    "vendorId": 1,
    "quantity": 3
  }
}
```

**Note:** `itemId` in URL refers to the cart item ID, not the menu item ID.

---

### 5.6 Remove Cart Item
**Endpoint:** `DELETE /api/cart/remove/:itemId`  
**Authentication:** Required (JWT Token)

**Response:**
```json
{
  "success": true,
  "message": "Item removed from cart"
}
```

---

### 5.7 Clear Cart
**Endpoint:** `DELETE /api/cart/clear`  
**Authentication:** Required (JWT Token)

**Response:**
```json
{
  "success": true,
  "message": "Cart cleared successfully"
}
```

---

### 5.8 Place Delivery Order
**Endpoint:** `POST /api/booking/confirm`  
**Authentication:** Not Required (but user_id must be valid)

**Request:**
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
    },
    {
      "itemId": 3,
      "name": "Spaghetti Carbonara",
      "quantity": 1,
      "price": "15.99",
      "subtotal": "15.99"
    }
  ],
  "total_amount": "33.97",
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

**Notes:**
- Cart is automatically cleared after successful order placement
- Order status starts as "pending"

---

### 5.9 Edit Delivery Order
**Endpoint:** `PUT /api/booking/order/:orderId`  
**Authentication:** Required (JWT Token - user must own the order)

**URL Parameters:**
- `orderId` (integer, required) - Order ID to edit

**Request Headers:**
```
Authorization: Bearer YOUR_JWT_TOKEN
Content-Type: application/json
```

**Request:**
```json
{
  "user_id": 1,
  "restaurant_id": 1,
  "items": [
    {
      "itemId": 1,
      "name": "Bruschetta",
      "quantity": 3,
      "price": "8.99",
      "subtotal": "26.97"
    },
    {
      "itemId": 3,
      "name": "Spaghetti Carbonara",
      "quantity": 2,
      "price": "15.99",
      "subtotal": "31.98"
    }
  ],
  "total_amount": "58.95",
  "delivery_address": "789 New Street, Apt 5C",
  "delivery_latitude": 37.7849,
  "delivery_longitude": -122.4094,
  "customer_notes": "Ring doorbell twice"
}
```

**Request Fields:**
- `user_id` (integer, required) - User ID (must match authenticated user and order owner)
- `restaurant_id` (integer, required) - Restaurant/Vendor ID (must match original order)
- `items` (array, required) - Array of order items (must have at least one item)
- `total_amount` (string, required) - Total order amount
- `delivery_address` (string, required) - Delivery address
- `delivery_latitude` (float, optional) - Delivery latitude
- `delivery_longitude` (float, optional) - Delivery longitude
- `customer_notes` (string, optional) - Special instructions

**Response:**
```json
{
  "success": true,
  "order_id": 42,
  "message": "Delivery order updated successfully"
}
```

**Status Codes:**
- `200` - Order updated successfully
- `400` - Missing required fields or invalid data
- `401` - Unauthorized (missing or invalid JWT token)
- `403` - Order cannot be edited (not in editable status) or unauthorized access
- `404` - Order or restaurant not found
- `409` - Order cannot be edited (already accepted/preparing/completed)

**Restrictions:**
- Orders can only be edited when status is `pending`
- Orders with status `accepted`, `preparing`, `ready`, `out_for_delivery`, or `delivered` cannot be edited
- `user_id` must match the authenticated user and order owner
- `restaurant_id` must match the original order
- At least one menu item is required

---

### 5.10 Get Delivery Order History
**Endpoint:** `GET /api/booking/list`  
**Authentication:** Not Required

**Query Parameters:**
- `user_id` (integer, required) - User ID

**Example:**
```
GET /api/booking/list?user_id=1
```

**Response:**
```json
{
  "success": true,
  "orders": [
    {
      "id": 42,
      "userId": 1,
      "vendorId": 1,
      "items": "[{\"itemId\": 1, \"name\": \"Bruschetta\", \"quantity\": 2}]",
      "totalAmount": "33.97",
      "deliveryAddress": "456 Oak Street, Apt 3B",
      "status": "pending",
      "createdAt": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

---

## Pickup Workflow

### Complete Flow Diagram

```
1. Browse Nearby Restaurants (with pickup enabled)
   ↓
2. View Restaurant Menu
   ↓
3. Add Items to Cart (Authenticated)
   ↓
4. Manage Cart (View/Update/Remove)
   ↓
5. Place Pickup Order
   ↓
6. Edit Pickup Order (Optional, if status is pending)
   ↓
7. Track Order Status
```

---

### 6.1 Get Nearby Restaurants (Pickup Enabled)

Use the same endpoint as Home Delivery: `GET /api/restaurants/nearby`

**Response includes pickup availability:**
```json
[
  {
    "id": 1,
    "restaurantName": "The Delicious Bistro",
    "address": "123 Main St, New York, NY 10001",
    "cuisineType": "Italian",
    "rating": "4.50",
    "reviewCount": 120,
    "image": "/uploads/restaurant-1.jpg",
    "isDeliveryEnabled": true,
    "isPickupEnabled": true
  }
]
```

**Note:** Only restaurants with `isPickupEnabled: true` accept pickup orders.

---

### 6.2 Get Restaurant Menu

Use the same endpoint as Home Delivery: `GET /api/restaurants/:vendorId/menu`

The response includes pickup availability in the `services` object:
```json
{
  "restaurant": {
    "services": {
      "isDeliveryEnabled": true,
      "isPickupEnabled": true,
      "isDeliveryAllowed": true,
      "isPickupAllowed": true
    }
  }
}
```

---

### 6.3 Add to Cart

Use the same cart endpoints as Home Delivery:
- `POST /api/cart/add` - Add items to cart
- `GET /api/cart/get` - View cart
- `PUT /api/cart/update/:itemId` - Update quantities
- `DELETE /api/cart/remove/:itemId` - Remove items
- `DELETE /api/cart/clear` - Clear cart

**Note:** Cart operations require JWT authentication.

---

### 6.4 Place Pickup Order

**Endpoint:** `POST /api/pickup/order`  
**Authentication:** Not Required (but user_id must be valid)

**Request:**
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
    },
    {
      "itemId": 3,
      "name": "Spaghetti Carbonara",
      "quantity": 1,
      "price": "15.99",
      "subtotal": "15.99"
    }
  ],
  "total_amount": "33.97",
  "customer_phone": "+1234567890",
  "pickup_time": "2025-01-15T18:30:00Z",
  "customer_notes": "Please have ready by 6:30 PM"
}
```

**Request Fields:**
- `user_id` (integer, required) - User ID
- `restaurant_id` (integer, required) - Restaurant/Vendor ID
- `items` (array, required) - Array of order items
- `total_amount` (string, required) - Total order amount
- `customer_phone` (string, optional) - Customer phone number
- `pickup_time` (string, optional) - Preferred pickup time (ISO 8601 format)
- `customer_notes` (string, optional) - Special instructions

**Response:**
```json
{
  "success": true,
  "order_id": 42,
  "pickup_reference": "PICKUP-001",
  "message": "Pickup order placed successfully"
}
```

**Status Codes:**
- `200` - Order placed successfully
- `400` - Missing required fields
- `403` - Pickup service not available for this restaurant
- `404` - Restaurant not found
- `500` - Server error

**Notes:**
- Cart is automatically cleared after successful order placement
- Order status starts as "pending"
- A unique `pickup_reference` is generated for each order
- Restaurant must have `isPickupEnabled: true` to accept pickup orders

---

### 6.5 Edit Pickup Order
**Endpoint:** `PUT /api/pickup/order/:orderId`  
**Authentication:** Not Required (but user_id must match the order owner)

**URL Parameters:**
- `orderId` (integer, required) - Order ID to edit

**Request:**
```json
{
  "user_id": 1,
  "restaurant_id": 1,
  "items": [
    {
      "itemId": 1,
      "name": "Bruschetta",
      "quantity": 3,
      "price": "8.99",
      "subtotal": "26.97"
    },
    {
      "itemId": 3,
      "name": "Spaghetti Carbonara",
      "quantity": 2,
      "price": "15.99",
      "subtotal": "31.98"
    }
  ],
  "total_amount": "58.95",
  "customer_phone": "+1234567890",
  "pickup_time": "2025-01-15T18:30:00Z",
  "customer_notes": "Please have ready by 6:30 PM"
}
```

**Request Fields:**
- `user_id` (integer, required) - User ID (must match order owner)
- `restaurant_id` (integer, required) - Restaurant/Vendor ID (must match original order)
- `items` (array, required) - Array of order items (must have at least one item)
- `total_amount` (string, required) - Total order amount
- `customer_phone` (string, optional) - Customer phone number
- `pickup_time` (string, optional) - Preferred pickup time (ISO 8601 format)
- `customer_notes` (string, optional) - Special instructions

**Response:**
```json
{
  "success": true,
  "order_id": 42,
  "pickup_reference": "PICKUP-001",
  "message": "Pickup order updated successfully"
}
```

**Status Codes:**
- `200` - Order updated successfully
- `400` - Missing required fields or invalid data
- `403` - Order cannot be edited (not in editable status) or pickup service not available
- `404` - Order or restaurant not found
- `409` - Order cannot be edited (already accepted/preparing/completed)

**Restrictions:**
- Orders can only be edited when status is `pending`
- Orders with status `accepted`, `preparing`, `ready`, or `completed` cannot be edited
- `user_id` and `restaurant_id` must match the original order
- At least one menu item is required
- Restaurant must have `isPickupEnabled: true`

---

### 6.6 Get Pickup Order History

**Endpoint:** `GET /api/pickup/orders`  
**Authentication:** Not Required

**Query Parameters:**
- `user_id` (integer, required) - User ID

**Example:**
```
GET /api/pickup/orders?user_id=1
```

**Response:**
```json
{
  "success": true,
  "orders": [
    {
      "id": 42,
      "userId": 1,
      "vendorId": 1,
      "items": "[{\"itemId\": 1, \"name\": \"Bruschetta\", \"quantity\": 2}]",
      "totalAmount": "33.97",
      "pickupReference": "PICKUP-001",
      "pickupTime": "2025-01-15T18:30:00.000Z",
      "customerPhone": "+1234567890",
      "status": "pending",
      "acceptedAt": null,
      "preparingAt": null,
      "readyAt": null,
      "completedAt": null,
      "customerNotes": "Please have ready by 6:30 PM",
      "createdAt": "2025-01-15T17:00:00.000Z"
    }
  ]
}
```

---

## Dine-In (QR Code) Workflow

### Complete Flow Diagram

```
1. Scan QR Code at Table
   ↓
2. Get Restaurant & Menu Info (Optional: Combined endpoint)
   ↓
3. Browse Menu & Select Items
   ↓
4. Place Dine-In Order
   ↓
5. Edit Dine-In Order (Optional, if status is pending)
   ↓
6. Track Order Status
```

---

### 7.1 Scan QR Code
**Endpoint:** `POST /api/table/scan`  
**Authentication:** Not Required

**Request:**
```json
{
  "qrData": "vendor:1:table:5"
}
```

**QR Code Format:** `vendor:{vendorId}:table:{tableNumber}`

**Response:**
```json
{
  "vendorId": 1,
  "restaurantName": "The Delicious Bistro",
  "tableNumber": 5
}
```

---

### 7.2 Scan QR Code & Get Menu (Recommended)
**Endpoint:** `POST /api/table/scan-menu`  
**Authentication:** Not Required

**Description:** This endpoint combines QR scanning and menu retrieval in a single call, reducing latency.

**Request:**
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
          "tags": ["popular", "vegetarian"],
          "addons": [
            {
              "id": 1,
              "name": "Extra Cheese",
              "price": "2.00",
              "isRequired": false
            }
          ]
        }
      ]
    }
  ]
}
```

**Error Responses:**
- `400` - Invalid QR code format
- `403` - Restaurant not accepting orders
- `404` - Table or restaurant not found
- `500` - Server error

---

### 7.3 Place Dine-In Order
**Endpoint:** `POST /api/dinein/order`  
**Authentication:** Not Required

**Request:**
```json
{
  "vendorId": 1,
  "tableId": 5,
  "items": "[{\"itemId\": 1, \"name\": \"Bruschetta\", \"quantity\": 2, \"price\": \"8.99\", \"subtotal\": \"17.98\"}]",
  "totalAmount": "17.98",
  "customerName": "John Doe",
  "customerPhone": "+1234567890",
  "customerNotes": "Extra cheese please"
}
```

**Note:** `items` must be a JSON string, not an object.

**Response:**
```json
{
  "id": 15,
  "vendorId": 1,
  "tableId": 5,
  "status": "pending",
  "totalAmount": "17.98",
  "customerName": "John Doe",
  "customerPhone": "+1234567890",
  "createdAt": "2025-01-15T12:30:00.000Z"
}
```

---

### 7.4 Edit Dine-In Order
**Endpoint:** `PUT /api/dinein/order/:orderId`  
**Authentication:** Not Required (but user must own the order via customerPhone)

**URL Parameters:**
- `orderId` (integer, required) - Order ID to edit

**Request:**
```json
{
  "vendorId": 1,
  "tableId": 5,
  "items": "[{\"itemId\": 1, \"name\": \"Bruschetta\", \"quantity\": 3, \"price\": \"8.99\", \"subtotal\": \"26.97\"}]",
  "totalAmount": "26.97",
  "customerName": "John Doe",
  "customerPhone": "+1234567890",
  "customerNotes": "Extra cheese please"
}
```

**Note:** `items` must be a JSON string, not an object.

**Response:**
```json
{
  "id": 15,
  "vendorId": 1,
  "tableId": 5,
  "status": "pending",
  "totalAmount": "26.97",
  "customerName": "John Doe",
  "customerPhone": "+1234567890",
  "customerNotes": "Extra cheese please",
  "updatedAt": "2025-01-15T12:45:00.000Z"
}
```

**Status Codes:**
- `200` - Order updated successfully
- `400` - Missing required fields or invalid data
- `403` - Order cannot be edited (not in editable status)
- `404` - Order not found
- `409` - Order cannot be edited (already accepted/preparing/completed)

**Restrictions:**
- Orders can only be edited when status is `pending`
- Orders with status `accepted`, `preparing`, `ready`, `delivered`, or `completed` cannot be edited
- `vendorId`, `tableId`, and `customerPhone` must match the original order
- At least one menu item is required

---

### 7.5 Get Dine-In Order History
**Endpoint:** `GET /api/dinein/orders`  
**Authentication:** Not Required

**Query Parameters:**
- `phone` (string, required) - Customer phone number

**Example:**
```
GET /api/dinein/orders?phone=+1234567890
```

**Response:**
```json
[
  {
    "id": 15,
    "vendorId": 1,
    "tableId": 5,
    "userId": null,
    "status": "delivered",
    "totalAmount": "17.98",
    "customerName": "John Doe",
    "customerPhone": "+1234567890",
    "createdAt": "2025-01-15T12:30:00.000Z",
    "deliveredAt": "2025-01-15T13:15:00.000Z"
  }
]
```

---

## Order Tracking

### Order Status Flow

#### Delivery Orders:
```
pending → accepted → preparing → ready → out_for_delivery → delivered
```

#### Pickup Orders:
```
pending → accepted → preparing → ready → completed
```

#### Dine-In Orders:
```
pending → accepted → preparing → ready → delivered
```

### Status Descriptions

- **pending**: Order placed, awaiting restaurant confirmation
- **accepted**: Restaurant has accepted the order
- **preparing**: Order is being prepared
- **ready**: Order is ready for pickup/delivery
- **completed**: Order has been picked up (pickup orders only)
- **out_for_delivery**: Order is on the way (delivery only)
- **delivered**: Order has been delivered/completed
- **cancelled**: Order was cancelled

---

## Error Handling

### Standard Error Response Format

```json
{
  "message": "Error description"
}
```

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (missing or invalid parameters)
- `401` - Unauthorized (invalid credentials, expired OTP, or missing JWT token)
- `403` - Forbidden (valid auth but insufficient permissions or ownership)
- `404` - Not Found (resource doesn't exist)
- `409` - Conflict (phone number already registered, or order cannot be edited)
- `500` - Internal Server Error

### Common Error Scenarios

#### 1. Missing JWT Token
```json
{
  "message": "Unauthorized: JWT token required"
}
```

#### 2. Invalid/Expired Token
```json
{
  "message": "Invalid or expired token"
}
```

#### 3. Cart Ownership Error
```json
{
  "message": "Unauthorized to modify this cart item"
}
```

#### 4. Invalid OTP
```json
{
  "message": "Invalid or expired OTP"
}
```

#### 5. Order Cannot Be Edited
```json
{
  "message": "Completed orders cannot be edited"
}
```

#### 6. Order Not Found
```json
{
  "message": "Order not found"
}
```

---

## Complete Workflow Diagrams

### Workflow 1: New User - Home Delivery

```
1. POST /api/register
   → Register with name, phone, email
   
2. POST /api/send-otp
   → Request OTP for phone verification
   
3. POST /api/verify-otp
   → Verify OTP, receive JWT token
   
4. POST /api/set-password (Optional)
   → Set password for future logins
   
5. GET /api/restaurants/nearby?latitude=X&longitude=Y
   → Browse nearby restaurants
   
6. GET /api/restaurants/:vendorId/menu
   → View restaurant menu
   
7. POST /api/cart/add (with JWT)
   → Add items to cart
   
8. GET /api/cart/get (with JWT)
   → Review cart
   
9. POST /api/booking/confirm
   → Place delivery order
   
10. PUT /api/booking/order/:orderId (Optional, if status is pending)
    → Edit delivery order
    
11. GET /api/booking/list?user_id=X
    → Track order history
```

---

### Workflow 2: Existing User - Home Delivery

```
1. POST /api/login
   → Login with phone + password, receive JWT token
   
2. GET /api/restaurants/nearby?latitude=X&longitude=Y
   → Browse nearby restaurants
   
3. GET /api/restaurants/:vendorId/menu
   → View restaurant menu
   
4. POST /api/cart/add (with JWT)
   → Add items to cart
   
5. GET /api/cart/get (with JWT)
   → Review cart
   
6. PUT /api/cart/update/:itemId (with JWT)
   → Update quantities
   
7. POST /api/booking/confirm
   → Place delivery order
   
8. PUT /api/booking/order/:orderId (Optional, if status is pending)
   → Edit delivery order
   
9. GET /api/booking/list?user_id=X
   → Track order history
```

---

### Workflow 3: Dine-In via QR Code

```
1. Scan QR Code at Table
   → Extract QR data: "vendor:1:table:5"
   
2. POST /api/table/scan-menu
   → Get restaurant info, table info, and complete menu
   
3. User selects items from menu
   → (No cart needed for dine-in)
   
4. POST /api/dinein/order
   → Place order with items, customer info
   
5. PUT /api/dinein/order/:orderId (Optional, if status is pending)
   → Edit dine-in order
   
6. GET /api/dinein/orders?phone=+1234567890
   → Track order status by phone number
```

---

### Workflow 4: Pickup Order

```
1. POST /api/login (if not already logged in)
   → Login with phone + password, receive JWT token
   
2. GET /api/restaurants/nearby?latitude=X&longitude=Y
   → Browse nearby restaurants (filter by isPickupEnabled: true)
   
3. GET /api/restaurants/:vendorId/menu
   → View restaurant menu (check isPickupEnabled in services)
   
4. POST /api/cart/add (with JWT)
   → Add items to cart
   
5. GET /api/cart/get (with JWT)
   → Review cart
   
6. POST /api/pickup/order
   → Place pickup order
   
7. PUT /api/pickup/order/:orderId (Optional, if status is pending)
   → Edit pickup order
   
8. GET /api/pickup/orders?user_id=X
   → Track pickup order history
```

---

### Workflow 5: Address Management

```
1. POST /api/login
   → Login, receive JWT token
   
2. POST /api/address/create (with JWT)
   → Create new address
   
3. GET /api/address/list (with JWT)
   → List all user addresses
   
4. PUT /api/address/update/:id (with JWT)
   → Update address
   
5. POST /api/address/set-default/:id (with JWT)
   → Set default address
   
6. DELETE /api/address/delete/:id (with JWT)
   → Delete address
```

---

## Best Practices

### 1. Token Management
- Store JWT token securely (AsyncStorage, SecureStore, Keychain)
- Include token in `Authorization` header for all protected endpoints
- Handle 401 errors by redirecting to login
- Tokens expire after 30 days - implement token refresh logic

### 2. Error Handling
- Always check response status codes
- Display user-friendly error messages
- Handle network errors gracefully
- Implement retry logic for failed requests

### 3. Cart Management
- Clear cart after successful order placement
- Validate cart items before checkout
- Handle vendor changes (cart can only contain items from one vendor)

### 4. Order Tracking
- Poll order status endpoint periodically
- Use WebSocket/SSE if available for real-time updates
- Display order status clearly to users

### 5. QR Code Scanning
- Use `/api/table/scan-menu` for better performance (single API call)
- Validate QR code format before sending
- Handle invalid/expired QR codes gracefully

### 6. Order Editing
- Orders can only be edited when status is `pending`
- Check order status before attempting to edit
- Handle 409 errors gracefully when order is no longer editable
- Ensure `user_id`, `vendorId`, and `restaurant_id` match the original order
- Recalculate `total_amount` when updating items
- Display clear messages to users about edit restrictions

---

## Testing

### Development Environment
- Base URL: `http://localhost:5000`
- Default OTP: `123456` (if Twilio not configured)
- JWT Secret: Set `JWT_SECRET` environment variable

### Test Credentials
- Phone: `+1234567890`
- OTP: `123456` (development)
- Sample Restaurant ID: `1`
- Sample Menu Item IDs: `1-5`

### Example cURL Commands

#### Register User
```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{"name": "Test User", "phone": "+1234567890", "email": "test@example.com"}'
```

#### Login
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{"phone": "+1234567890", "password": "password123"}'
```

#### Add to Cart
```bash
curl -X POST http://localhost:5000/api/cart/add \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"item_id": 1, "quantity": 2}'
```

#### Edit Delivery Order
```bash
curl -X PUT http://localhost:5000/api/booking/order/42 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "restaurant_id": 1,
    "items": [{"itemId": 1, "name": "Bruschetta", "quantity": 3, "price": "8.99", "subtotal": "26.97"}],
    "total_amount": "26.97",
    "delivery_address": "789 New Street, Apt 5C",
    "customer_notes": "Ring doorbell twice"
  }'
```

#### Edit Pickup Order
```bash
curl -X PUT http://localhost:5000/api/pickup/order/42 \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "restaurant_id": 1,
    "items": [{"itemId": 1, "name": "Bruschetta", "quantity": 3, "price": "8.99", "subtotal": "26.97"}],
    "total_amount": "26.97",
    "customer_phone": "+1234567890",
    "pickup_time": "2025-01-15T18:30:00Z",
    "customer_notes": "Please have ready by 6:30 PM"
  }'
```

#### Edit Dine-In Order
```bash
curl -X PUT http://localhost:5000/api/dinein/order/15 \
  -H "Content-Type: application/json" \
  -d '{
    "vendorId": 1,
    "tableId": 5,
    "items": "[{\"itemId\": 1, \"name\": \"Bruschetta\", \"quantity\": 3, \"price\": \"8.99\", \"subtotal\": \"26.97\"}]",
    "totalAmount": "26.97",
    "customerName": "John Doe",
    "customerPhone": "+1234567890",
    "customerNotes": "Extra cheese please"
  }'
```

---

## Support & Resources

- **API Base URL**: Configure in your app settings
- **Documentation Updates**: Check this file for latest changes
- **Error Logs**: Check server logs for detailed error information
- **Support**: Contact platform administrator for API issues

---

## Changelog

### Version 1.1 (2025-01-15)
- Added order editing APIs for app users
  - Edit Dine-In Order: `PUT /api/dinein/order/:orderId` ✅ Implemented
  - Edit Pickup Order: `PUT /api/pickup/order/:orderId` ✅ Implemented
  - Edit Delivery Order: `PUT /api/booking/order/:orderId` ✅ Implemented
- Updated workflow diagrams to include order editing steps
- Added order editing best practices
- Added error handling scenarios for order editing
- Added cURL examples for order editing endpoints
- **Note:** Orders can only be edited when status is `pending`

### Version 1.0 (2025-01-15)
- Initial API workflow documentation
- Complete authentication flow
- Home delivery workflow
- Dine-in QR code workflow
- Pickup workflow
- Address management
- Order tracking

---

**Last Updated:** January 15, 2025  
**Document Version:** 1.1

