// Multi-Vendor QR Ordering Platform Schema
// Reference: javascript_log_in_with_replit and javascript_database blueprints

import { sql } from 'drizzle-orm';
import { relations } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  varchar,
  boolean,
  serial,
  numeric,
  uuid,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// ============================================
// Session & User Tables (Required for Replit Auth)
// ============================================

export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: varchar("username").unique(), // Unique username for login
  email: varchar("email"), // No longer unique - vendors can register multiple accounts from same email
  password: text("password"), // bcrypt hashed password
  fullName: varchar("full_name"),
  phoneNumber: varchar("phone_number"),

  role: varchar("role", { length: 20 }).notNull().default('vendor'), // vendor, captain, admin, owner
  isActive: boolean("is_active").default(true),
  isVerified: boolean("is_verified").default(false),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export type UpsertUser = typeof users.$inferInsert;
export type User = typeof users.$inferSelect;

// ============================================
// Marketing Banners
// ============================================

export const banners = pgTable("banners", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  imageUrl: text("image_url").notNull(),
  linkUrl: text("link_url"),
  position: integer("position").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  isClickable: boolean("is_clickable").notNull().default(true),
  bannerType: varchar("banner_type", { length: 20 }).notNull().default("top"),
  validFrom: timestamp("valid_from"),
  validUntil: timestamp("valid_until"),
  createdBy: varchar("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertBannerSchema = createInsertSchema(banners).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertBanner = z.infer<typeof insertBannerSchema>;
export type Banner = typeof banners.$inferSelect;

// ============================================
// Vendor Tables
// ============================================

export const vendors = pgTable("vendors", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  ownerId: varchar("owner_id").references(() => users.id, { onDelete: 'set null' }), // One owner per vendor
  
  // Business Details
  restaurantName: varchar("restaurant_name", { length: 255 }).notNull(),
  address: text("address").notNull(),
  description: text("description"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default("0"),
  gstMode: varchar("gst_mode", { length: 10 }).notNull().default("exclude"),
  cuisineType: varchar("cuisine_type", { length: 100 }),
  phone: varchar("phone", { length: 50 }),
  cnic: varchar("cnic", { length: 50 }),
  gstin: varchar("gstin", { length: 20 }),
  paymentQrCodeUrl: text("payment_qr_code_url"),
  
  // Location for nearby search
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  
  // Restaurant metadata
  image: text("image"), // Restaurant cover image
  rating: numeric("rating", { precision: 3, scale: 2 }).default('0'), // Average rating
  reviewCount: integer("review_count").default(0),
  
  // Fulfillment toggles
  isDeliveryEnabled: boolean("is_delivery_enabled").notNull().default(true),
  isPickupEnabled: boolean("is_pickup_enabled").notNull().default(true),
  isDeliveryAllowed: boolean("is_delivery_allowed").notNull().default(false),
  isPickupAllowed: boolean("is_pickup_allowed").notNull().default(false),
  
  // Documents (stored as JSON with file paths/URLs)
  documents: jsonb("documents"), // { businessLicense: 'url', taxCert: 'url', idProof: 'url', logo: 'url' }
  
  // Approval Status
  status: varchar("status", { length: 20 }).notNull().default('pending'), // pending, approved, rejected, suspended
  rejectionReason: text("rejection_reason"),
  approvedAt: timestamp("approved_at"),
  approvedBy: varchar("approved_by").references(() => users.id),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vendorRelations = relations(vendors, ({ one, many }) => ({
  user: one(users, {
    fields: [vendors.userId],
    references: [users.id],
  }),
  owner: one(users, {
    fields: [vendors.ownerId],
    references: [users.id],
  }),
  tables: many(tables),
  captains: many(captains),
  menuCategories: many(menuCategories),
  orders: many(orders),
}));

export const insertVendorSchema = createInsertSchema(vendors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  approvedAt: true,
  approvedBy: true,
}).extend({
  isDeliveryEnabled: z.boolean().optional(),
  isPickupEnabled: z.boolean().optional(),
  isDeliveryAllowed: z.boolean().optional(),
  isPickupAllowed: z.boolean().optional(),
  paymentQrCodeUrl: z
    .string()
    .max(500)
    .or(z.null())
    .optional(),
  gstin: z
    .string()
    .regex(/^[A-Za-z0-9]{1,20}$/, "GSTIN must be alphanumeric (max 20 characters)")
    .optional(),
});

export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendors.$inferSelect;

// ============================================
// Menu Subcategories (Optional for All Categories)
// ============================================

export const menuSubcategories = pgTable("menu_subcategories", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id")
    .notNull()
    .references(() => menuCategories.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const menuSubcategoryRelations = relations(menuSubcategories, ({ one, many }) => ({
  category: one(menuCategories, {
    fields: [menuSubcategories.categoryId],
    references: [menuCategories.id],
  }),
  items: many(menuItems),
}));

export const insertMenuSubcategorySchema = createInsertSchema(menuSubcategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMenuSubcategory = z.infer<typeof insertMenuSubcategorySchema>;
export type MenuSubcategory = typeof menuSubcategories.$inferSelect;

// ============================================
// Table Management
// ============================================

export const tables = pgTable("tables", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  tableNumber: integer("table_number").notNull(), // Starts from 0 for each vendor
  qrData: text("qr_data").notNull(), // Encoded data: vendorId + tableId
  isManual: boolean("is_manual").notNull().default(false),
  captainId: integer("captain_id").references(() => captains.id, { onDelete: 'set null' }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const tableRelations = relations(tables, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [tables.vendorId],
    references: [vendors.id],
  }),
  captain: one(captains, {
    fields: [tables.captainId],
    references: [captains.id],
  }),
  orders: many(orders),
}));

export const insertTableSchema = createInsertSchema(tables).omit({
  id: true,
  qrData: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertTable = z.infer<typeof insertTableSchema>;
export type Table = typeof tables.$inferSelect;

// ============================================
// Captain Management
// ============================================

export const captains = pgTable("captains", {
  id: serial("id").primaryKey(),
  userId: varchar("user_id").references(() => users.id),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  password: text("password").notNull(), // bcrypt hashed
  phone: varchar("phone", { length: 50 }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const captainRelations = relations(captains, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [captains.vendorId],
    references: [vendors.id],
  }),
  assignedTables: many(tables),
}));

export const insertCaptainSchema = createInsertSchema(captains).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCaptain = z.infer<typeof insertCaptainSchema>;
export type Captain = typeof captains.$inferSelect;

// ============================================
// Menu Management
// ============================================

export const menuCategories = pgTable("menu_categories", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  gstRate: numeric("gst_rate", { precision: 5, scale: 2 }).notNull().default('0'),
  gstMode: varchar("gst_mode", { length: 10 }).notNull().default("exclude"),
  displayOrder: integer("display_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const menuCategoryRelations = relations(menuCategories, ({ one, many }) => ({
  vendor: one(vendors, {
    fields: [menuCategories.vendorId],
    references: [vendors.id],
  }),
  items: many(menuItems),
}));

export const insertMenuCategorySchema = createInsertSchema(menuCategories).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).extend({
  gstRate: z
    .union([z.string(), z.number()])
    .optional()
    .transform((value) => {
      if (value === undefined || value === null || value === "") {
        return "0.00";
      }

      const numeric = typeof value === "string" ? Number.parseFloat(value) : Number(value);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
        throw new Error("GST % must be a number between 0 and 100");
      }
      return numeric.toFixed(2);
    }),
  gstMode: z.enum(["include", "exclude"]).optional().default("exclude"),
});

export type InsertMenuCategory = z.infer<typeof insertMenuCategorySchema>;
export type MenuCategory = typeof menuCategories.$inferSelect;

export const menuItems = pgTable("menu_items", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").notNull().references(() => menuCategories.id, { onDelete: 'cascade' }),
  subCategoryId: integer("sub_category_id").references(() => menuSubcategories.id, { onDelete: "set null" }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  photo: text("photo"), // URL or path to image
  modifiers: jsonb("modifiers"), // Array of modifier options: [{ name: 'Size', options: ['Small', 'Medium', 'Large'] }]
  tags: jsonb("tags"), // ['popular', 'recommended', 'spicy', 'vegetarian']
  isAvailable: boolean("is_available").notNull().default(true),
  displayOrder: integer("display_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const menuItemRelations = relations(menuItems, ({ one }) => ({
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
  vendor: one(vendors, {
    fields: [menuItems.vendorId],
    references: [vendors.id],
  }),
}));

export const insertMenuItemSchema = createInsertSchema(menuItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMenuItem = z.infer<typeof insertMenuItemSchema>;
export type MenuItem = typeof menuItems.$inferSelect;

export const menuAddons = pgTable("menu_addons", {
  id: serial("id").primaryKey(),
  
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: "cascade" }),
  itemId: integer("item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  
  price: numeric("price", { precision: 10, scale: 2 }).notNull().default('0'), // 0 = free, >0 = paid
  isRequired: boolean("is_required").notNull().default(false), // necessary add-ons for paid items
  category: varchar("category", { length: 50 }), // optional, e.g., 'sides', 'extras', 'toppings'
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const menuAddonRelations = relations(menuAddons, ({ one }) => ({
  item: one(menuItems, {
    fields: [menuAddons.itemId],
    references: [menuItems.id],
  }),
  vendor: one(vendors, {
    fields: [menuAddons.vendorId],
    references: [vendors.id],
  }),
}));

export const insertMenuAddonSchema = createInsertSchema(menuAddons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertMenuAddon = z.infer<typeof insertMenuAddonSchema>;
export type MenuAddon = typeof menuAddons.$inferSelect;

// ============================================
// Order Management
// ============================================

export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  tableId: integer("table_id").notNull().references(() => tables.id, { onDelete: 'cascade' }),
  
  // Order Details
  items: jsonb("items").notNull(), // [{ itemId, name, quantity, price, modifiers, subtotal }]
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Customer Info (optional, from mobile app)
  customerName: varchar("customer_name", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  
  // Status Workflow: pending -> accepted -> preparing -> ready -> delivered
  status: varchar("status", { length: 20 }).notNull().default('pending'),
  
  // Timestamps for status changes
  acceptedAt: timestamp("accepted_at"),
  preparingAt: timestamp("preparing_at"),
  readyAt: timestamp("ready_at"),
  deliveredAt: timestamp("delivered_at"),
  
  // Notes
  customerNotes: text("customer_notes"),
  vendorNotes: text("vendor_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const orderRelations = relations(orders, ({ one }) => ({
  vendor: one(vendors, {
    fields: [orders.vendorId],
    references: [vendors.id],
  }),
  table: one(tables, {
    fields: [orders.tableId],
    references: [tables.id],
  }),
}));

export const insertOrderSchema = createInsertSchema(orders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  acceptedAt: true,
  preparingAt: true,
  readyAt: true,
  deliveredAt: true,
});

export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof orders.$inferSelect;

// ============================================
// Kitchen Order Tickets (KOT)
// ============================================

export const kotTickets = pgTable("kot_tickets", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" })
    .unique(),
  vendorId: integer("vendor_id")
    .notNull()
    .references(() => vendors.id, { onDelete: "cascade" }),
  tableId: integer("table_id")
    .notNull()
    .references(() => tables.id, { onDelete: "cascade" }),
  ticketNumber: varchar("ticket_number", { length: 50 }).notNull().unique(),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  items: jsonb("items").notNull(),
  customerNotes: text("customer_notes"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  printedAt: timestamp("printed_at"),
});

export const kotTicketRelations = relations(kotTickets, ({ one }) => ({
  order: one(orders, {
    fields: [kotTickets.orderId],
    references: [orders.id],
  }),
  vendor: one(vendors, {
    fields: [kotTickets.vendorId],
    references: [vendors.id],
  }),
  table: one(tables, {
    fields: [kotTickets.tableId],
    references: [tables.id],
  }),
}));

export const insertKotTicketSchema = createInsertSchema(kotTickets).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  printedAt: true,
});

export type InsertKotTicket = z.infer<typeof insertKotTicketSchema>;
export type KotTicket = typeof kotTickets.$inferSelect;

// ============================================
// Admin Configuration Settings
// ============================================

export const adminConfig = pgTable("admin_config", {
  id: serial("id").primaryKey(),
  key: varchar("key", { length: 100 }).notNull().unique(), // e.g., 'twilio_enabled', 'firebase_enabled'
  value: text("value"), // JSON string for complex values
  isEnabled: boolean("is_enabled").notNull().default(false),
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAdminConfigSchema = createInsertSchema(adminConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAdminConfig = z.infer<typeof insertAdminConfigSchema>;
export type AdminConfig = typeof adminConfig.$inferSelect;

// ============================================
// Mobile App Users (Customers)
// ============================================

export const appUsers = pgTable("app_users", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 255 }),
   // 🌆 New columns for location info
  state: varchar("state", { length: 100 }),
  city: varchar("city", { length: 100 }),
  password: text("password"), // bcrypt hashed (optional if OTP-only login)
  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
  fcmToken: text("fcm_token"), // Firebase Cloud Messaging token for push notifications
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAppUserSchema = createInsertSchema(appUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAppUser = z.infer<typeof insertAppUserSchema>;
export type AppUser = typeof appUsers.$inferSelect;

export const addresses = pgTable("addresses", {
  id: serial("id").primaryKey(),

  userId: integer("user_id")
    .notNull()
    .references(() => appUsers.id, { onDelete: "cascade" }),

  // Address Type: home, work, or other
  type: varchar("type", { length: 20 })
    .notNull()
    .default("home"), // ENUM-like behavior

  // Full address text (including street, house no, etc.)
  fullAddress: text("full_address").notNull(),

  // Optional landmark for easier navigation
  landmark: varchar("landmark", { length: 255 }),

  city: varchar("city", { length: 100 }).notNull(),
  zipCode: varchar("zip_code", { length: 20 }).notNull(),

  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),

  isDefault: boolean("is_default").notNull().default(false),

  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const addressRelations = relations(addresses, ({ one, many }) => ({
  user: one(appUsers, {
    fields: [addresses.userId],
    references: [appUsers.id],
  }),
  deliveryOrders: many(deliveryOrders),
}));

export const insertAddressSchema = createInsertSchema(addresses).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type Address = typeof addresses.$inferSelect;

// ============================================
// OTP Verifications
// ============================================

export const otpVerifications = pgTable("otp_verifications", {
  id: serial("id").primaryKey(),
  phone: varchar("phone", { length: 50 }).notNull(),
  otp: varchar("otp", { length: 10 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  isVerified: boolean("is_verified").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow(),
});

export type OtpVerification = typeof otpVerifications.$inferSelect;

// ============================================
// Shopping Cart
// ============================================

export const cartItems = pgTable("cart_items", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  itemId: integer("item_id").notNull().references(() => menuItems.id, { onDelete: 'cascade' }),
  quantity: integer("quantity").notNull().default(1),
  modifiers: jsonb("modifiers"), // Selected modifiers for this item
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const cartItemRelations = relations(cartItems, ({ one }) => ({
  user: one(appUsers, {
    fields: [cartItems.userId],
    references: [appUsers.id],
  }),
  vendor: one(vendors, {
    fields: [cartItems.vendorId],
    references: [vendors.id],
  }),
  item: one(menuItems, {
    fields: [cartItems.itemId],
    references: [menuItems.id],
  }),
}));

export const insertCartItemSchema = createInsertSchema(cartItems).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItems.$inferSelect;

// ============================================
// Home Delivery Orders
// ============================================

export const deliveryOrders = pgTable("delivery_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  
  // Order Details
  items: jsonb("items").notNull(), // [{ itemId, name, quantity, price, modifiers, subtotal }]
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Delivery Address
  deliveryAddress: text("delivery_address").notNull(),
  addressId: integer("address_id")
  .references(() => addresses.id, { onDelete: "set null" }),
  deliveryLatitude: numeric("delivery_latitude", { precision: 10, scale: 7 }),
  deliveryLongitude: numeric("delivery_longitude", { precision: 10, scale: 7 }),
  deliveryPhone: varchar("delivery_phone", { length: 50 }),
  
  // Status Workflow: pending -> accepted -> preparing -> ready -> out_for_delivery -> delivered
  status: varchar("status", { length: 30 }).notNull().default('pending'),
  
  // Timestamps for status changes
  acceptedAt: timestamp("accepted_at"),
  preparingAt: timestamp("preparing_at"),
  readyAt: timestamp("ready_at"),
  outForDeliveryAt: timestamp("out_for_delivery_at"),
  deliveredAt: timestamp("delivered_at"),
  
  // Notes
  customerNotes: text("customer_notes"),
  vendorNotes: text("vendor_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const deliveryOrderRelations = relations(deliveryOrders, ({ one }) => ({
  user: one(appUsers, {
    fields: [deliveryOrders.userId],
    references: [appUsers.id],
  }),
  vendor: one(vendors, {
    fields: [deliveryOrders.vendorId],
    references: [vendors.id],
  }),
  address: one(addresses, {
    fields: [deliveryOrders.addressId],
    references: [addresses.id],
  }),
}));

export const insertDeliveryOrderSchema = createInsertSchema(deliveryOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  acceptedAt: true,
  preparingAt: true,
  readyAt: true,
  outForDeliveryAt: true,
  deliveredAt: true,
});

export type InsertDeliveryOrder = z.infer<typeof insertDeliveryOrderSchema>;
export type DeliveryOrder = typeof deliveryOrders.$inferSelect;

// ============================================
// Pickup Orders
// ============================================

export const pickupOrders = pgTable("pickup_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => appUsers.id, { onDelete: 'cascade' }),
  vendorId: integer("vendor_id").notNull().references(() => vendors.id, { onDelete: 'cascade' }),
  
  // Order Details
  items: jsonb("items").notNull(), // [{ itemId, name, quantity, price, modifiers, subtotal }]
  totalAmount: numeric("total_amount", { precision: 10, scale: 2 }).notNull(),
  
  // Pickup Information
  pickupReference: varchar("pickup_reference", { length: 50 }),
  pickupTime: timestamp("pickup_time"),
  customerPhone: varchar("customer_phone", { length: 50 }),
  
  // Status Workflow: pending -> accepted -> preparing -> ready -> completed
  status: varchar("status", { length: 30 }).notNull().default('pending'),
  
  // Timestamps for status changes
  acceptedAt: timestamp("accepted_at"),
  preparingAt: timestamp("preparing_at"),
  readyAt: timestamp("ready_at"),
  completedAt: timestamp("completed_at"),
  
  // Notes
  customerNotes: text("customer_notes"),
  vendorNotes: text("vendor_notes"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const pickupOrderRelations = relations(pickupOrders, ({ one }) => ({
  user: one(appUsers, {
    fields: [pickupOrders.userId],
    references: [appUsers.id],
  }),
  vendor: one(vendors, {
    fields: [pickupOrders.vendorId],
    references: [vendors.id],
  }),
}));

export const insertPickupOrderSchema = createInsertSchema(pickupOrders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  acceptedAt: true,
  preparingAt: true,
  readyAt: true,
  completedAt: true,
});

export type InsertPickupOrder = z.infer<typeof insertPickupOrderSchema>;
export type PickupOrder = typeof pickupOrders.$inferSelect;

// ============================================
// Sales Analytics
// ============================================

const salesDailyRecordSchema = z.object({
  date: z.string(),
  totalOrders: z.number(),
  totalRevenue: z.string(),
});

export const salesSummarySchema = z.object({
  range: z.object({
    startDate: z.string(),
    endDate: z.string(),
    days: z.number(),
  }),
  totals: z.object({
    totalOrders: z.number(),
    totalRevenue: z.string(),
    averageOrderValue: z.string(),
  }),
  daily: z.array(salesDailyRecordSchema),
});

export type SalesSummary = z.infer<typeof salesSummarySchema>;

export const adminSalesSummarySchema = salesSummarySchema.extend({
  vendorBreakdown: z.array(
    z.object({
      vendorId: z.number(),
      vendorName: z.string(),
      totalOrders: z.number(),
      totalRevenue: z.string(),
    }),
  ),
});

export type AdminSalesSummary = z.infer<typeof adminSalesSummarySchema>;
