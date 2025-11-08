# QuickBiteQR Mobile API Test Guide

This guide provides test instructions for all mobile app APIs. All APIs are running on port 5000.

## Base URL
```
http://localhost:5000
```

## 1. Authentication APIs ✅

### 1.1 Register User
```bash
curl -X POST http://localhost:5000/api/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "phone": "+1234567890",
    "email": "test@example.com",
    "password": "password123",
    "confirm_password": "password123"
  }'
```

### 1.2 Send OTP
```bash
curl -X POST http://localhost:5000/api/send-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890"
  }'
```
**Expected**: Returns `{"success": true, "message": "OTP sent successfully", "otp": "123456"}` (in development)

### 1.3 Verify OTP
```bash
curl -X POST http://localhost:5000/api/verify-otp \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "otp": "123456"
  }'
```

### 1.4 Login with OTP
```bash
curl -X POST http://localhost:5000/api/login \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+1234567890",
    "otp": "123456"
  }'
```
**Response includes JWT token**:
```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "name": "Test User",
    "phone": "+1234567890",
    "email": "test@example.com"
  }
}
```

**IMPORTANT**: Save the `token` - it's required for all authenticated API calls!

## 2. Home Delivery APIs ✅

### 2.1 Get Nearby Restaurants
```bash
curl "http://localhost:5000/api/restaurants/nearby?latitude=37.7749&longitude=-122.4194"
```

### 2.2 Get Restaurant Menu (Two formats supported)
```bash
# Format 1: /api/restaurants/:vendorId/menu
curl http://localhost:5000/api/restaurants/1/menu

# Format 2: /restaurants/:restaurant_id/menu
curl http://localhost:5000/restaurants/1/menu
```

### 2.3 Cart Operations

#### Add to Cart (🔒 Requires Authentication)
```bash
curl -X POST http://localhost:5000/api/cart/add \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "item_id": 1,
    "quantity": 2
  }'
```
**Note**: User ID is automatically extracted from JWT token - no need to send user_id.

#### Get Cart (🔒 Requires Authentication)
```bash
curl -X GET http://localhost:5000/api/cart/get \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Update Cart Item (🔒 Requires Authentication)
```bash
curl -X PUT http://localhost:5000/api/cart/update/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "quantity": 3
  }'
```
**Note**: Automatically validates ownership using authenticated user ID from JWT token.

#### Remove Cart Item (🔒 Requires Authentication)
```bash
curl -X DELETE http://localhost:5000/api/cart/remove/1 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```
**Note**: Automatically validates ownership using authenticated user ID from JWT token.

#### Clear Cart (🔒 Requires Authentication)
```bash
curl -X DELETE http://localhost:5000/api/cart/clear \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### 2.4 Confirm Delivery Booking
```bash
curl -X POST http://localhost:5000/api/booking/confirm \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": 1,
    "restaurant_id": 1,
    "items": [
      {
        "itemId": 1,
        "name": "Pizza",
        "quantity": 2,
        "price": "12.99",
        "subtotal": "25.98"
      }
    ],
    "total_amount": "25.98",
    "delivery_address": "123 Main St, Apt 4B",
    "delivery_latitude": 37.7749,
    "delivery_longitude": -122.4194,
    "customer_notes": "Ring doorbell"
  }'
```

## 3. Dine-In QR APIs ✅

### 3.1 Scan QR Code
```bash
curl -X POST http://localhost:5000/api/table/scan \
  -H "Content-Type: application/json" \
  -d '{
    "qrData": "vendor:1:table:5"
  }'
```
**Expected**: Returns vendor and table information

### 3.2 Get Menu for Dine-In
Same as home delivery menu (2.2)

### 3.3 Place Dine-In Order
```bash
curl -X POST http://localhost:5000/api/dinein/order \
  -H "Content-Type: application/json" \
  -d '{
    "vendorId": 1,
    "tableId": 1,
    "items": "[{\"itemId\": 1, \"name\": \"Pizza\", \"quantity\": 1, \"price\": \"12.99\", \"subtotal\": \"12.99\"}]",
    "totalAmount": "12.99",
    "customerName": "John Doe",
    "customerPhone": "+1234567890",
    "customerNotes": "Extra cheese"
  }'
```

### 3.4 Get Dine-In Order History
```bash
curl "http://localhost:5000/api/dinein/orders?user_id=1"
```

## API Status Summary

### ✅ Fully Implemented & Working:
- User Registration (`POST /api/register`)
- Send OTP (`POST /api/send-otp`)
- Verify OTP (`POST /api/verify-otp`)
- Login (`POST /api/login`)
- Get Nearby Restaurants (`GET /api/restaurants/nearby`)
- Get Restaurant Menu (`GET /api/restaurants/:vendorId/menu` and `/restaurants/:restaurant_id/menu`)
- Add to Cart (`POST /api/cart/add`)
- Get Cart (`GET /api/cart/get`)
- Update Cart Item (`PUT /api/cart/update/:itemId`)
- Remove Cart Item (`DELETE /api/cart/remove/:itemId`)
- Clear Cart (`DELETE /api/cart/clear`)
- Confirm Booking (`POST /api/booking/confirm`)
- Scan QR Code (`POST /api/table/scan`)
- Place Dine-In Order (`POST /api/dinein/order`)
- Get Order History (`GET /api/dinein/orders`)

### Frontend APIs (Dashboard Only):
- Vendor Authentication & Management
- Captain Authentication & Management
- Admin Vendor Approval
- Table Management
- Menu Management
- Order Status Updates

## Security & Authorization

### JWT Token Authentication
After successful login, you receive a JWT token that must be included in the `Authorization` header for all protected endpoints:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

### Protected Endpoints (🔒 Require JWT Token)
- `POST /api/cart/add` - Add item to cart
- `GET /api/cart/get` - Get user's cart
- `PUT /api/cart/update/:itemId` - Update cart item
- `DELETE /api/cart/remove/:itemId` - Remove cart item
- `DELETE /api/cart/clear` - Clear cart

**Security Features**:
- User ID is automatically extracted from the JWT token (server-side)
- Ownership validation prevents users from accessing other users' data
- Tokens expire after 30 days
- Prevents IDOR attacks and unauthorized access

**Important**: Never send user_id in request body for authenticated endpoints - it's automatically derived from the JWT token!

## Testing Notes

1. **Default OTP**: In development, OTP is always "123456" unless Twilio is configured
2. **JWT Token**: After login, save the token and include it in Authorization header for all cart operations
3. **JWT Secret**: Set `JWT_SECRET` environment variable in production (required for security)
4. **Token Expiry**: Tokens are valid for 30 days - re-login when expired
5. **Vendor IDs**: Must exist in database (create via vendor registration in dashboard)
6. **Item IDs**: Must exist in vendor's menu (create via menu management in vendor dashboard)
7. **Table IDs**: Must exist and be active (create via table management in vendor dashboard)
8. **Cart Operations**: ALL cart operations require JWT authentication - user ID is automatically derived from token

## Database Requirements

Ensure these tables exist and are populated:
- `app_users` - Mobile app users
- `otp_verifications` - OTP codes
- `vendors` - Restaurants
- `menu_categories` - Menu categories
- `menu_items` - Menu items
- `cart_items` - Shopping cart
- `orders` - Orders
- `tables` - Restaurant tables

## Error Handling

All APIs return consistent error format:
```json
{
  "message": "Error description"
}
```

HTTP Status Codes:
- `200` - Success
- `400` - Bad Request (invalid input)
- `401` - Unauthorized (invalid credentials/OTP)
- `403` - Forbidden (valid auth but insufficient permissions/ownership)
- `404` - Not Found (resource doesn't exist)
- `500` - Server Error

## Frontend Integration

### Authentication Flow
1. User logs in with phone + OTP
2. Store the JWT token securely (AsyncStorage, SecureStore, Keychain, etc.)
3. Include token in Authorization header for all protected API calls
4. Handle 401 errors by redirecting to login

### Example: React Native with Axios
```javascript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Login
const login = async (phone, otp) => {
  const response = await axios.post('/api/login', { phone, otp });
  const { token, user } = response.data;
  await AsyncStorage.setItem('jwt_token', token);
  return user;
};

// Get Cart (Protected)
const getCart = async () => {
  const token = await AsyncStorage.getItem('jwt_token');
  const response = await axios.get('/api/cart/get', {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response.data.items;
};
```

### Supported Platforms
All mobile APIs are CORS-enabled and can be called from:
- React Native apps
- Flutter apps
- Native iOS/Android apps
- Progressive Web Apps (PWA)

Use standard HTTP clients:
- **React Native**: `fetch` or `axios`
- **Flutter**: `http` or `dio`
- **iOS**: `URLSession` or `Alamofire`
- **Android**: `OkHttp` or `Retrofit`
