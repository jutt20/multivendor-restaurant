# QR Code Scan API - Quick Start Guide

## Overview
This API endpoint allows mobile apps to scan a table QR code and receive the complete restaurant menu in a single API call.

## Endpoint
```
POST /api/table/scan-menu
```

## Request
```json
{
  "qrData": "vendor:1:table:5"
}
```

## Response Example
```json
{
  "success": true,
  "table": {
    "id": 6,
    "tableNumber": 5
  },
  "restaurant": {
    "id": 1,
    "restaurantName": "The Delicious Bistro",
    "address": "123 Main St, New York, NY 10001",
    "cuisineType": "Italian",
    "description": "Authentic Italian cuisine with fresh ingredients",
    "image": null,
    "rating": "4.50",
    "reviewCount": 120
  },
  "menu": [
    {
      "id": 1,
      "name": "Appetizers",
      "description": "Start your meal right",
      "displayOrder": 0,
      "items": [
        {
          "id": 1,
          "name": "Bruschetta",
          "description": "Grilled bread topped with fresh tomatoes, garlic, and basil",
          "price": "8.99",
          "photo": null,
          "modifiers": null,
          "tags": ["popular", "vegetarian"]
        },
        {
          "id": 2,
          "name": "Mozzarella Sticks",
          "description": "Golden fried mozzarella served with marinara sauce",
          "price": "7.99",
          "photo": null,
          "modifiers": null,
          "tags": ["vegetarian"]
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
          "id": 4,
          "name": "Spaghetti Carbonara",
          "description": "Classic Italian pasta with bacon, eggs, and parmesan",
          "price": "15.99",
          "photo": null,
          "modifiers": {
            "size": ["Regular", "Large"],
            "extras": ["Extra cheese", "Bacon"]
          },
          "tags": ["popular"]
        },
        {
          "id": 5,
          "name": "Margherita Pizza",
          "description": "Fresh mozzarella, tomato sauce, and basil",
          "price": "14.99",
          "photo": null,
          "modifiers": {
            "size": ["Small", "Medium", "Large"],
            "extras": ["Extra cheese", "Olives", "Mushrooms"]
          },
          "tags": ["popular", "vegetarian"]
        }
      ]
    }
  ]
}
```

## Features

### What You Get in One API Call:
1. **Table Information**: Table ID and table number
2. **Restaurant Details**: Full restaurant information including name, address, cuisine type, description, rating, and review count
3. **Complete Menu**: All available menu items organized by categories
   - Categories with descriptions and display order
   - Items with prices, descriptions, photos (if available)
   - Modifiers for customization (e.g., size, extras)
   - Tags for filtering (e.g., "popular", "vegetarian", "spicy")

### Smart Filtering:
- Only shows **approved** restaurants
- Only shows **active** categories
- Only shows **available** menu items
- Returns items sorted by display order

## Testing the API

### Using cURL:
```bash
curl -X POST http://localhost:5000/api/table/scan-menu \
  -H "Content-Type: application/json" \
  -d '{"qrData": "vendor:1:table:5"}'
```

### Sample QR Codes for Testing:
- Table 0: `vendor:1:table:0`
- Table 1: `vendor:1:table:1`
- Table 2: `vendor:1:table:2`
- Table 3: `vendor:1:table:3`
- Table 4: `vendor:1:table:4`
- Table 5: `vendor:1:table:5`

## Error Responses

### Invalid QR Code Format (400)
```json
{
  "message": "Invalid QR code format"
}
```

### Table Not Found (404)
```json
{
  "message": "Table not found"
}
```

### Restaurant Not Found (404)
```json
{
  "message": "Restaurant not found"
}
```

### Restaurant Not Accepting Orders (403)
```json
{
  "message": "Restaurant is not currently accepting orders"
}
```

## Mobile App Integration

### Flow:
1. User scans QR code at table
2. App extracts QR data string (e.g., "vendor:1:table:5")
3. App calls `/api/table/scan-menu` with the QR data
4. App receives complete restaurant and menu information
5. App displays menu to user
6. User selects items and places order using `/api/dinein/order`

### Advantages:
- **Single API call** reduces latency
- **Complete data** in one response
- **Efficient** for mobile apps with limited connectivity
- **User-friendly** - faster menu loading

## Related Endpoints

After viewing the menu, users can:
- **Place an order**: `POST /api/dinein/order`
- **View order history**: `GET /api/dinein/orders?user_id={userId}`

## Menu Item Structure

### Basic Item:
```json
{
  "id": 1,
  "name": "Bruschetta",
  "description": "Grilled bread topped with fresh tomatoes",
  "price": "8.99",
  "photo": null,
  "modifiers": null,
  "tags": ["popular", "vegetarian"]
}
```

### Item with Modifiers:
```json
{
  "id": 4,
  "name": "Spaghetti Carbonara",
  "description": "Classic Italian pasta",
  "price": "15.99",
  "photo": "/uploads/carbonara.jpg",
  "modifiers": {
    "size": ["Regular", "Large"],
    "extras": ["Extra cheese", "Bacon"]
  },
  "tags": ["popular"]
}
```

## Best Practices

1. **Cache the response** temporarily to reduce API calls if user revisits the menu
2. **Show loading state** while fetching menu
3. **Handle errors gracefully** with user-friendly messages
4. **Display items by category** to match the restaurant's organization
5. **Highlight popular items** using the tags
6. **Show modifiers clearly** so users can customize their orders

## Support

For issues or questions:
- Check the complete API documentation: `MOBILE_API_DOCUMENTATION.md`
- Test using the API test guide: `API_TEST_GUIDE.md`
- Contact platform administrator for support
