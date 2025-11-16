// Multi-Vendor QR Ordering Platform API Routes
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isVendor, isCaptain, isAdmin, isOwner, isVendorOrOwner } from "./replitAuth";
import { z } from "zod";
import {
  insertVendorSchema,
  insertTableSchema,
  insertCaptainSchema,
  insertMenuCategorySchema,
  insertMenuSubcategorySchema,
  insertMenuItemSchema,
  insertOrderSchema,
  menuItems,
  menuCategories,
  cartItems,
  deliveryOrders,
  pickupOrders,
  kotTickets,
  type InsertMenuAddon,
  type InsertMenuCategory,
  type InsertMenuItem,
  type InsertMenuSubcategory,
  type InsertOrder,
  type Order,
  type KotTicket,
} from "@shared/schema";
import { db, pool } from "./db";
import { eq, inArray } from "drizzle-orm";
import { appUsers } from "@shared/schema";
import multer from "multer";
import path from "path";
import fs from "fs";
import express from "express";
import { NotificationService } from "./services/notifications";
import { firebaseService } from "./services/firebase";
import { verifyMobileAuth, generateToken, type MobileAuthRequest } from "./mobileAuth";
import { v4 as uuidv4 } from 'uuid';
import bcrypt from "bcryptjs";
import { users, vendors } from "@shared/schema"; // ✅ adjust the path

// Initialize notification services
const notificationService = new NotificationService();

// File upload configuration
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage_multer = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  },
});

const upload = multer({ 
  storage: storage_multer,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only images and PDFs are allowed'));
  },
});

const getAbsoluteUploadPath = (fileUrl?: string | null): string | null => {
  if (!fileUrl || typeof fileUrl !== "string") {
    return null;
  }

  if (!fileUrl.startsWith("/uploads/")) {
    return null;
  }

  const relativePath = fileUrl.replace(/^\//, "");
  return path.join(process.cwd(), relativePath);
};

const removeUploadFile = async (fileUrl?: string | null): Promise<void> => {
  const absolutePath = getAbsoluteUploadPath(fileUrl);
  if (!absolutePath) {
    return;
  }

  try {
    await fs.promises.unlink(absolutePath);
  } catch (error: any) {
    if (error?.code !== "ENOENT") {
      console.warn("Failed to remove upload file:", absolutePath, error);
    }
  }
};

const parseBoolean = (value: any): boolean | undefined => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "y", "on"].includes(normalized)) return true;
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
  }
  return undefined;
};

const parseNumber = (value: any): number | undefined => {
  if (value === null || value === undefined || value === "") return undefined;
  const num = Number(value);
  if (Number.isNaN(num)) return undefined;
  return num;
};

const normalizePrice = (value: any): { ok: true; value: string } | { ok: false } => {
  if (value === null || value === undefined || value === "") {
    return { ok: true, value: "0.00" };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return { ok: false };
    }
    return { ok: true, value: value.toFixed(2) };
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") {
      return { ok: true, value: "0.00" };
    }
    const numeric = Number(trimmed);
    if (Number.isNaN(numeric)) {
      return { ok: false };
    }
    return { ok: true, value: numeric.toFixed(2) };
  }

  return { ok: false };
};

const SINGLE_SESSION_ROLES = new Set(["vendor"]);

async function hasActiveSessionForUser(userId: string, excludeSid?: string): Promise<boolean> {
  const sql = `
    SELECT 1
    FROM sessions
    WHERE (sess::jsonb #>> '{passport,user,claims,sub}') = $1
      AND expire > NOW()
      AND ($2::text IS NULL OR sid <> $2)
    LIMIT 1
  `;
  const params: [string, string | null] = [userId, excludeSid ?? null];
  try {
    const result = await pool.query(sql, params);
    const rowCount = result.rowCount != null ? result.rowCount : 0;
    return rowCount > 0;
  } catch (error) {
    console.error("Failed to verify active sessions", { error, userId });
    return false;
  }
}

const manualOrderItemSchema = z.object({
  itemId: z.coerce.number().int().positive(),
  name: z.string().min(1, "Item name is required"),
  quantity: z.coerce.number().int().positive("Quantity must be at least 1"),
  price: z.union([z.number(), z.string()]),
  addons: z.any().optional(),
  modifiers: z.any().optional(),
  notes: z.string().optional(),
});

const manualOrderSchema = z.object({
  tableId: z.coerce.number().int().positive(),
  items: z.array(manualOrderItemSchema).min(1, "At least one item is required"),
  customerName: z.string().trim().optional(),
  customerPhone: z.string().trim().optional(),
  customerNotes: z.string().trim().optional(),
});

type ManualOrderInput = z.infer<typeof manualOrderSchema>;
type ManualOrderItemInput = z.infer<typeof manualOrderItemSchema>;

const toCurrencyString = (value: number) => value.toFixed(2);

const coercePrice = (value: ManualOrderItemInput["price"]) => {
  const price =
    typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Invalid item price");
  }
  return Number(price.toFixed(2));
};

type ManualOrderPayloadItem = {
  itemId: number;
  name: string;
  quantity: number;
  price: number;
  subtotal: number;
  addons: unknown[];
  modifiers: unknown[];
  notes: string | null;
  gstRate: number;
  gstMode: "include" | "exclude";
  gstAmount: number;
  unitPriceWithGst: number;
  subtotalWithGst: number;
  lineTotal: number;
};

const roundCurrency = (value: number) => {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Number(value.toFixed(2));
};

type OrderEvent =
  | {
      type: "order-created";
      orderId: number;
      vendorId: number;
      tableId?: number | null;
    }
  | {
      type: "order-status-changed";
      orderId: number;
      vendorId: number;
      status: string;
    }
  | {
      type: "kot-created";
      orderId: number;
      vendorId: number;
      kotId: number;
      ticketNumber: string;
    }
  | {
      type: "table-status-changed";
      tableId: number;
      vendorId: number;
      isActive: boolean;
    };

type OrderStreamClient = {
  res: express.Response;
  vendorId: number;
  role: "vendor" | "captain";
  heartbeat: NodeJS.Timeout;
};

const orderStreamClients = new Set<OrderStreamClient>();

const removeOrderStreamClient = (client: OrderStreamClient) => {
  if (!orderStreamClients.has(client)) {
    return;
  }
  clearInterval(client.heartbeat);
  orderStreamClients.delete(client);
  try {
    client.res.end();
  } catch {
    // no-op
  }
};

const broadcastOrderEvent = (event: OrderEvent) => {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of Array.from(orderStreamClients)) {
    if (client.vendorId !== event.vendorId) {
      continue;
    }
    try {
      client.res.write(payload);
    } catch (error) {
      console.error("Failed to deliver order event. Removing stream client.", error);
      removeOrderStreamClient(client);
    }
  }
};

const buildManualOrderPayload = async (
  vendorId: number,
  tableId: number,
  input: ManualOrderInput,
): Promise<InsertOrder> => {
  const normalizedItems: ManualOrderPayloadItem[] = [];

  for (const item of input.items) {
    const price = coercePrice(item.price);
    const quantity = item.quantity;
    const baseSubtotal = roundCurrency(price * quantity);

    const menuItemRecord = await storage.getMenuItem(item.itemId);
    if (!menuItemRecord || menuItemRecord.vendorId !== vendorId) {
      throw new Error("Invalid menu item");
    }

    const category = await storage.getMenuCategory(menuItemRecord.categoryId);
    const gstRateRaw = Number(category?.gstRate ?? 0);
    const gstRate = Number.isFinite(gstRateRaw) && gstRateRaw > 0 ? gstRateRaw : 0;
    const gstMode = category?.gstMode === "include" ? "include" : "exclude";

    let unitPriceWithGst = price;
    let subtotalWithGst = baseSubtotal;
    let gstAmount = 0;

    if (gstRate > 0) {
      if (gstMode === "include") {
        unitPriceWithGst = roundCurrency(price * (1 + gstRate / 100));
        subtotalWithGst = roundCurrency(unitPriceWithGst * quantity);
        gstAmount = roundCurrency(subtotalWithGst - baseSubtotal);
      } else {
        gstAmount = roundCurrency(baseSubtotal * (gstRate / 100));
        subtotalWithGst = roundCurrency(baseSubtotal + gstAmount);
      }
    }

    normalizedItems.push({
      itemId: item.itemId,
      name: item.name,
      quantity,
      price,
      subtotal: baseSubtotal,
      addons: item.addons ?? [],
      modifiers: item.modifiers ?? [],
      notes: item.notes ?? null,
      gstRate,
      gstMode,
      gstAmount,
      unitPriceWithGst,
      subtotalWithGst,
      lineTotal: subtotalWithGst,
    });
  }

  const totalAmount = normalizedItems.reduce((sum, entry) => {
    const subtotalWithGst = Number(entry.subtotalWithGst ?? entry.subtotal ?? 0);
    return sum + subtotalWithGst;
  }, 0);

  const customerName = input.customerName?.trim();
  const customerPhone = input.customerPhone?.trim();
  const customerNotes = input.customerNotes?.trim();

  return insertOrderSchema.parse({
    vendorId,
    tableId,
    items: normalizedItems,
    totalAmount: toCurrencyString(roundCurrency(totalAmount)),
    status: "pending",
    customerName: customerName && customerName.length > 0 ? customerName : null,
    customerPhone:
      customerPhone && customerPhone.length > 0 ? customerPhone : null,
    customerNotes:
      customerNotes && customerNotes.length > 0 ? customerNotes : null,
    vendorNotes: null,
  });
};

// Normalize mobile (delivery/pickup) order items with GST based on vendor menu categories
const enrichOrderItemsWithGstForVendor = async (
  vendorId: number,
  rawItems: any[],
) => {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { items: [], totalAmount: 0 };
  }

  const [menuItemsForVendor, categories] = await Promise.all([
    storage.getMenuItems(vendorId),
    storage.getMenuCategories(vendorId),
  ]);

  const menuMap = new Map(menuItemsForVendor.map((item) => [item.id, item]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));

  const normalizedItems = rawItems.map((item) => {
    const quantityRaw = Number(item.quantity ?? 1);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

    const priceCandidates = [item.price, item.basePrice, item.unitPrice];
    let baseUnitPrice = 0;
    for (const candidate of priceCandidates) {
      if (candidate === null || candidate === undefined) continue;
      const numeric = Number.parseFloat(String(candidate));
      if (Number.isFinite(numeric)) {
        baseUnitPrice = numeric;
        break;
      }
    }
    baseUnitPrice = Number.isFinite(baseUnitPrice) ? roundCurrency(baseUnitPrice) : 0;

    let baseSubtotal = roundCurrency(
      Number.parseFloat(String(item.subtotal ?? "")) || baseUnitPrice * quantity,
    );

    const itemId = Number(
      item.itemId ?? item.id ?? item.productId ?? item.menuItemId ?? 0,
    );
    const menuItem = menuMap.get(itemId);
    const category = menuItem ? categoryMap.get(menuItem.categoryId) : undefined;

    let gstRate = 0;
    if (category?.gstRate != null) {
      const raw = Number(category.gstRate);
      if (Number.isFinite(raw) && raw > 0) {
        gstRate = Number(raw.toFixed(2));
      }
    }
    const gstMode: "include" | "exclude" =
      category?.gstMode === "include" ? "include" : "exclude";

    let gstAmount = 0;
    let lineTotal = baseSubtotal;

    if (gstRate > 0) {
      if (gstMode === "include") {
        // Price is GST-inclusive: baseSubtotal currently includes GST
        lineTotal = baseSubtotal;
        gstAmount = roundCurrency(lineTotal * (gstRate / (100 + gstRate)));
        baseSubtotal = roundCurrency(lineTotal - gstAmount);
      } else {
        // Price is GST-exclusive
        gstAmount = roundCurrency(baseSubtotal * (gstRate / 100));
        lineTotal = roundCurrency(baseSubtotal + gstAmount);
      }
    }

    return {
      ...item,
      itemId,
      quantity,
      price: baseUnitPrice,
      subtotal: baseSubtotal,
      gstRate,
      gstMode,
      gstAmount,
      subtotalWithGst: lineTotal,
      lineTotal,
    };
  });

  const totalAmount = normalizedItems.reduce((sum, entry) => {
    const value = Number(entry.lineTotal ?? entry.subtotal ?? 0);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  return {
    items: normalizedItems,
    totalAmount: roundCurrency(totalAmount),
  };
};

const handleOrderPostCreation = async (orderId: number) => {
  const fullOrder = await storage.getOrder(orderId);
  if (!fullOrder) {
    return;
  }

  const vendor = await storage.getVendor(fullOrder.vendorId);
  const table = await storage.getTable(fullOrder.tableId);
  const kotTicket = await storage.getKotByOrderId(orderId);

  if (vendor && fullOrder.customerPhone) {
    notificationService
      .sendOrderNotification(
        fullOrder.customerPhone,
        fullOrder.status ?? "pending",
        vendor.restaurantName,
      )
      .catch((err: any) =>
        console.error("Failed to send order notification:", err),
      );
  }

  console.log(
    `New order #${fullOrder.id} received at Table ${table?.tableNumber} for ${vendor?.restaurantName}`,
  );

  broadcastOrderEvent({
    type: "order-created",
    orderId: fullOrder.id,
    vendorId: fullOrder.vendorId,
    tableId: fullOrder.tableId,
  });
  
  // Broadcast table status change if order has a table
  if (fullOrder.tableId) {
    const updatedTable = await storage.getTable(fullOrder.tableId);
    if (updatedTable) {
      broadcastOrderEvent({
        type: "table-status-changed",
        tableId: updatedTable.id,
        vendorId: fullOrder.vendorId,
        isActive: updatedTable.isActive,
      });
    }
  }

  if (kotTicket) {
    broadcastOrderEvent({
      type: "kot-created",
      orderId: fullOrder.id,
      vendorId: fullOrder.vendorId,
      kotId: kotTicket.id,
      ticketNumber: kotTicket.ticketNumber,
    });
  }
};

const gstinUpdateSchema = z
  .union([z.string(), z.null()])
  .transform((value) => {
    if (value === null) {
      return null;
    }

    const trimmed = value.trim();
    if (trimmed === "") {
      return null;
    }

    return trimmed.toUpperCase();
  })
  .refine(
    (value) => value === null || /^[A-Z0-9]{1,20}$/.test(value),
    "GSTIN must be alphanumeric (max 20 characters)",
  );

const updateVendorProfileSchema = z.object({
  restaurantName: z.string().min(2).max(255).optional(),
  address: z.string().max(1000).optional(),
  description: z.string().max(2000).optional(),
  cuisineType: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
  cnic: z.string().max(50).optional(),
  gstin: gstinUpdateSchema.optional(),
  image: z.string().min(1).max(500).optional(),
  paymentQrCodeUrl: z.union([z.string().min(1).max(500), z.null()]).optional(),
  isDeliveryEnabled: z.boolean().optional(),
  isPickupEnabled: z.boolean().optional(),
  fullName: z.string().max(255).optional(),
  phoneNumber: z.string().max(50).optional(),
});

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // ============================================
  // Auth Routes
  // ============================================
  
  app.get('/api/auth/user', isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Email/Password login for vendors and admins
  app.post('/api/auth/email-login', async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password are required" });
      }

      const user = await storage.getUserByEmail(email);
      if (!user || !user.password) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      const bcrypt = await import('bcryptjs');
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: "Invalid email or password" });
      }

      if (SINGLE_SESSION_ROLES.has(user.role ?? "")) {
        const sessionId = (req as any).sessionID as string | undefined;
        const alreadyLoggedInElsewhere = await hasActiveSessionForUser(user.id, sessionId);
        if (alreadyLoggedInElsewhere) {
          return res.status(409).json({
            success: false,
            message: "Your account is already logged in elsewhere. Please log out from the other session before logging in here.",
            code: "SESSION_CONFLICT",
          });
        }
      }

      // Set session to mimic Replit Auth passport structure
      (req as any).session.passport = {
        user: {
          claims: {
            sub: user.id,
            email: user.email,
          },
          expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // 7 days
        }
      };

      await new Promise((resolve, reject) => {
        (req as any).session.save((err: any) => {
          if (err) reject(err);
          else resolve(null);
        });
      });

      res.json({ 
        success: true, 
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        }
      });
    } catch (error) {
      console.error('Email login error:', error);
      res.status(500).json({ message: "Login failed. Please try again." });
    }
  });

  // Captain login endpoint
  // Captain login endpoint
  app.post('/api/auth/captain/login', async (req, res) => {
    try {
      const { username, password } = req.body;
      const captain = await storage.getCaptainByUsername(username);
      if (!captain) return res.status(401).json({ message: "Invalid credentials" });

      const bcrypt = await import('bcrypt');
      const isValid = await bcrypt.compare(password, captain.password);
      if (!isValid) return res.status(401).json({ message: "Invalid credentials" });
      if (!captain.isActive) return res.status(403).json({ message: "Account is inactive" });

      if (captain.userId) {
        (req as any).session.passport = {
          user: {
            claims: {
              sub: captain.userId,
            },
            expires_at: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60), // ✅ add this
          }
        };

        await new Promise((resolve, reject) => {
          (req as any).session.save((err: any) => {
            if (err) reject(err);
            else resolve(null);
          });
        });

        const user = await storage.getUser(captain.userId);
        res.json({ success: true, user });
      } else {
        res.status(500).json({ message: "Captain account not properly configured" });
      }
    } catch (error) {
      console.error("Captain login error:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // ============================================
  // Vendor Routes
  // ============================================
  
  // Vendor registration with file uploads

  app.post(
    "/api/vendor/register",
    upload.fields([
      { name: "businessLicense", maxCount: 1 },
      { name: "taxCert", maxCount: 1 },
      { name: "idProof", maxCount: 1 },
      { name: "logo", maxCount: 1 },
    ]),
    async (req, res) => {
      try {
        const files = req.files as { [field: string]: Express.Multer.File[] };
        const {
          firstName,
          lastName,
          email,
          phone,
          password,
          cnic,
          restaurantName,
          address,
          description,
          cuisineType,
          latitude,
          longitude,
          gstin,
        } = req.body;

        // ✅ Step 1: Validate required fields
        if (!password || password.length < 4) {
          return res.status(400).json({
            message: "Password must be at least 4 characters long",
          });
        }

        // Step 1: Create user
        const userId = uuidv4();
        const hashed = await bcrypt.hash(password, 10);

        await db.insert(users).values({
          id: userId,
          fullName: `${firstName} ${lastName}`,
          email,
          phoneNumber: phone,
          password: hashed,
          role: "vendor",
        });

        // Step 2: Prepare document URLs
        const documents: Record<string, string> = {};
        Object.keys(files || {}).forEach((key) => {
          if (files[key]?.[0]) documents[key] = `/uploads/${files[key][0].filename}`;
        });

        // Step 3: Validate vendor data
        const deliveryToggle = parseBoolean(req.body?.isDeliveryEnabled ?? req.body?.deliveryEnabled ?? req.body?.offersDelivery);
        const pickupToggle = parseBoolean(req.body?.isPickupEnabled ?? req.body?.pickupEnabled ?? req.body?.offersPickup);

        const vendorPayload: Record<string, unknown> = {
          userId,
          restaurantName,
          address,
          description,
          cuisineType,
          phone,
          cnic,
          latitude,
          longitude,
          documents,
        };

        if (typeof gstin === "string" && gstin.trim()) {
          vendorPayload.gstin = gstin.trim().toUpperCase();
        }

        if (deliveryToggle !== undefined) {
          vendorPayload.isDeliveryEnabled = deliveryToggle;
        }
        if (pickupToggle !== undefined) {
          vendorPayload.isPickupEnabled = pickupToggle;
        }

        const validatedData = insertVendorSchema.parse(vendorPayload);

        await db.insert(vendors).values(validatedData);

        res.json({ success: true, message: "Vendor registered successfully" });
      } catch (error: any) {
        console.error("Vendor registration failed:", error);
        res.status(400).json({ message: error.message || "Failed to register vendor" });
      }
    }
  );

  // Serve uploaded files
  app.use('/uploads', (req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    next();
  });
  app.use('/uploads', express.static(uploadDir));

  // Helper function to get vendor for vendor or owner
  const getVendorForUser = async (userId: string, userRole: string) => {
    if (userRole === 'owner') {
      return await storage.getVendorByOwnerId(userId);
    } else {
      return await storage.getVendorByUserId(userId);
    }
  };

  // Vendor stats
  app.get('/api/vendor/stats', isAuthenticated, isVendorOrOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      const vendor = await getVendorForUser(userId, user.role);
      
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const stats = await storage.getVendorStats(vendor.id);
      res.json(stats);
    } catch (error) {
      console.error("Error fetching vendor stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get('/api/vendor/sales', isAuthenticated, isVendorOrOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const vendor = await getVendorForUser(userId, user.role);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const startDate =
        typeof req.query.startDate === "string" ? req.query.startDate : undefined;
      const endDate =
        typeof req.query.endDate === "string" ? req.query.endDate : undefined;

      const summary = await storage.getVendorSalesSummary(vendor.id, startDate, endDate);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching vendor sales summary:", error);
      res.status(500).json({ message: "Failed to fetch sales summary" });
    }
  });

  // Vendor profile
  app.get('/api/vendor/profile', isAuthenticated, isVendorOrOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const vendor = await getVendorForUser(userId, user.role);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      res.json({
        vendor,
        user: user
          ? {
              id: user.id,
              email: user.email,
              fullName: user.fullName,
              phoneNumber: user.phoneNumber,
            }
          : null,
      });
    } catch (error) {
      console.error("Error fetching vendor profile:", error);
      res.status(500).json({ message: "Failed to fetch vendor profile" });
    }
  });

  app.get('/api/vendor/customers', isAuthenticated, isVendorOrOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const vendor = await getVendorForUser(userId, user.role);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const customers = await storage.getVendorCustomersWithStats(vendor.id, search);

      res.json(customers);
    } catch (error) {
      console.error("Error fetching vendor customers:", error);
      res.status(500).json({ message: "Failed to fetch customers" });
    }
  });

  app.put('/api/vendor/profile', isAuthenticated, isVendorOrOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const vendor = await getVendorForUser(userId, user.role);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const body = req.body ?? {};
      const normalized: Record<string, unknown> = {};

      const simpleFields = [
        "restaurantName",
        "address",
        "description",
        "cuisineType",
        "phone",
        "cnic",
        "gstin",
        "image",
    "paymentQrCodeUrl",
        "fullName",
        "phoneNumber",
      ] as const;

      simpleFields.forEach((field) => {
        if (body[field] === undefined) {
          return;
        }

        if (field === "gstin") {
          const value = body[field];

          if (typeof value === "string") {
            const trimmed = value.trim();
            normalized[field] = trimmed === "" ? null : trimmed.toUpperCase();
          } else if (value === null) {
            normalized[field] = null;
          } else {
            normalized[field] = value;
          }

          return;
        }

        normalized[field] = body[field];
      });

      const deliveryAllowed = vendor.isDeliveryAllowed === true;
      const pickupAllowed = vendor.isPickupAllowed === true;

      if (body.isDeliveryEnabled !== undefined) {
        const parsed = parseBoolean(body.isDeliveryEnabled);
        if (parsed === undefined) {
          return res.status(400).json({ message: "Invalid value for isDeliveryEnabled" });
        }

        if (parsed && !deliveryAllowed) {
          return res
            .status(403)
            .json({ message: "Delivery service is disabled by the administrator" });
        }

        normalized.isDeliveryEnabled = deliveryAllowed ? parsed : false;
      }

      if (body.isPickupEnabled !== undefined) {
        const parsed = parseBoolean(body.isPickupEnabled);
        if (parsed === undefined) {
          return res.status(400).json({ message: "Invalid value for isPickupEnabled" });
        }

        if (parsed && !pickupAllowed) {
          return res
            .status(403)
            .json({ message: "Pickup service is disabled by the administrator" });
        }

        normalized.isPickupEnabled = pickupAllowed ? parsed : false;
      }

      if (Object.keys(normalized).length === 0) {
        return res.status(400).json({ message: "No changes provided" });
      }

      const validated = updateVendorProfileSchema.parse(normalized);

      const vendorUpdates: Record<string, unknown> = {};
      const vendorFields = [
        "restaurantName",
        "address",
        "description",
        "cuisineType",
        "phone",
        "cnic",
        "gstin",
        "image",
    "paymentQrCodeUrl",
        "isDeliveryEnabled",
        "isPickupEnabled",
      ] as const;

      vendorFields.forEach((field) => {
        if (validated[field] !== undefined) {
          vendorUpdates[field] = validated[field];
        }
      });

      let updatedVendorRecord = vendor;
      if (Object.keys(vendorUpdates).length > 0) {
        updatedVendorRecord = await storage.updateVendor(vendor.id, vendorUpdates as any);
        await storage.syncDuplicateVendors(userId, vendor.id, vendorUpdates as any);
      }

      const userUpdates: Record<string, unknown> = {};
      if (validated.fullName !== undefined) {
        userUpdates.fullName = validated.fullName;
      }
      if (validated.phoneNumber !== undefined) {
        userUpdates.phoneNumber = validated.phoneNumber;
      }

      if (Object.keys(userUpdates).length > 0) {
        await storage.updateUser(userId, userUpdates as any);
      }

      const updatedVendor = await storage.getVendor(updatedVendorRecord.id);
      const updatedUser = await storage.getUser(userId);

      res.json({
        message: "Profile updated successfully",
        vendor: updatedVendor,
        user: updatedUser
          ? {
              id: updatedUser.id,
              email: updatedUser.email,
              fullName: updatedUser.fullName,
              phoneNumber: updatedUser.phoneNumber,
            }
          : null,
      });
    } catch (error: any) {
      console.error("Error updating vendor profile:", error);
      if (error?.name === "ZodError") {
        return res.status(400).json({
          message: "Validation failed",
          issues: error.issues,
        });
      }
      res.status(500).json({ message: error?.message || "Failed to update vendor profile" });
    }
  });

  app.post(
    "/api/vendor/payment-qr",
    isAuthenticated,
    isVendor,
    upload.single("paymentQr"),
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          if (req.file) {
            await removeUploadFile(`/uploads/${req.file.filename}`);
          }
          return res.status(404).json({ message: "Vendor not found" });
        }

        const file = req.file;
        if (!file) {
          return res.status(400).json({ message: "Payment QR image is required" });
        }

        const newUrl = `/uploads/${file.filename}`;

        if (vendor.paymentQrCodeUrl && vendor.paymentQrCodeUrl !== newUrl) {
          await removeUploadFile(vendor.paymentQrCodeUrl);
        }

        await storage.updateVendor(vendor.id, {
          paymentQrCodeUrl: newUrl,
        });
        await storage.syncDuplicateVendors(userId, vendor.id, {
          paymentQrCodeUrl: newUrl,
        });

        const updatedVendor = await storage.getVendor(vendor.id);

        res.json({
          message: "Payment QR updated",
          paymentQrCodeUrl: updatedVendor?.paymentQrCodeUrl ?? null,
          vendor: updatedVendor ?? null,
        });
      } catch (error: any) {
        console.error("Error uploading payment QR:", error);
        res
          .status(500)
          .json({ message: error?.message || "Failed to upload payment QR code" });
      }
    },
  );

  app.delete("/api/vendor/payment-qr", isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      if (vendor.paymentQrCodeUrl) {
        await removeUploadFile(vendor.paymentQrCodeUrl);
      }

      await storage.updateVendor(vendor.id, {
        paymentQrCodeUrl: null,
      });
      await storage.syncDuplicateVendors(userId, vendor.id, {
        paymentQrCodeUrl: null,
      });

      const updatedVendor = await storage.getVendor(vendor.id);

      res.json({
        message: "Payment QR removed",
        paymentQrCodeUrl: updatedVendor?.paymentQrCodeUrl ?? null,
        vendor: updatedVendor ?? null,
      });
    } catch (error: any) {
      console.error("Error removing payment QR:", error);
      res
        .status(500)
        .json({ message: error?.message || "Failed to remove payment QR code" });
    }
  });

  // ============================================
  // Table Management Routes
  // ============================================
  
  // Get all tables for vendor
  app.get('/api/vendor/tables', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);
      
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const tables = await storage.getTables(vendor.id);

      const tableByNumber = new Map<number, (typeof tables)[number]>();
      tables.forEach((table) => {
        tableByNumber.set(table.tableNumber, table);
      });

      const autoTableIds = new Set<number>();
      let expectedNumber = 0;
      while (true) {
        const table = tableByNumber.get(expectedNumber);
        if (!table) {
          break;
        }
        autoTableIds.add(table.id);
        expectedNumber += 1;
      }

      const manualCandidates = tables.filter(
        (table) => table.isManual !== true && !autoTableIds.has(table.id),
      );

      if (manualCandidates.length > 0) {
        await Promise.all(
          manualCandidates.map(async (table) => {
            try {
              await storage.setTableManualStatus(table.id, true);
              table.isManual = true as any;
            } catch (error) {
              console.error(`Failed to mark table ${table.id} as manual`, error);
            }
          }),
        );
      }

      const normalizedTables = tables.map((table) => ({
        ...table,
        isManual: table.isManual === true,
      }));

      res.json(normalizedTables);
    } catch (error) {
      console.error("Error fetching tables:", error);
      res.status(500).json({ message: "Failed to fetch tables" });
    }
  });

  // Create table
  app.post('/api/vendor/tables', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);
      
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const { noOfTables } = req.body;

      // Validate input
      const count = parseInt(noOfTables, 10);
      if (isNaN(count) || count <= 0) {
        return res.status(400).json({ message: "Invalid number of tables" });
      }

      // Get the next table number
      const existingTables = await storage.getTables(vendor.id);
      const existingNumbers = new Set(existingTables.map((table) => table.tableNumber));
      let nextNumber = 0;
      while (existingNumbers.has(nextNumber)) {
        nextNumber++;
      }
      const createdTables = [];

      // Create tables sequentially
      for (let i = 0; i < count; i++) {
        while (existingNumbers.has(nextNumber)) {
          nextNumber++;
        }

        const table = await storage.createTable(vendor.id, nextNumber, false);
        createdTables.push(table);
        existingNumbers.add(nextNumber);
        nextNumber++;
      }

      res.json({
        message: `${createdTables.length} table(s) created successfully`,
        tables: createdTables,
      });
    } catch (error) {
      console.error("Error creating tables:", error);
      res.status(500).json({ message: "Failed to create tables" });
    }
  });

  // ✅ Create manual table
  app.post('/api/vendor/tables/manual', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const { tableNumber } = req.body;

      if (!tableNumber || isNaN(parseInt(tableNumber))) {
        return res.status(400).json({ message: "Invalid or missing table number" });
      }

      // Check if that number already exists
      const existingTables = await storage.getTables(vendor.id);
      if (existingTables.some(t => t.tableNumber === parseInt(tableNumber))) {
        return res.status(400).json({ message: "Table number already exists" });
      }

      const table = await storage.createTable(vendor.id, parseInt(tableNumber), true);
      const updatedTable = await storage.setTableManualStatus(table.id, true);
      res.json({ message: "Manual table created successfully", table: updatedTable });
    } catch (error) {
      console.error("Error creating manual table:", error);
      res.status(500).json({ message: "Failed to create manual table" });
    }
  });

  // Delete table
  app.delete('/api/vendor/tables/:tableId', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const tableId = parseInt(req.params.tableId, 10);

      if (isNaN(tableId)) {
        return res.status(400).json({ message: "Invalid table id" });
      }

      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      await storage.deleteTable(vendor.id, tableId);

      res.json({ message: "Table deleted successfully" });
    } catch (error: any) {
      if (error?.message === "Table not found") {
        return res.status(404).json({ message: "Table not found" });
      }

      console.error("Error deleting table:", error);
      res.status(500).json({ message: "Failed to delete table" });
    }
  });

  // Assign captain to table
  app.put('/api/vendor/tables/:tableId/assign', isAuthenticated, isVendor, async (req, res) => {
    try {
      const tableId = parseInt(req.params.tableId);
      const { captainId } = req.body;

      const table = await storage.assignCaptain(tableId, captainId);
      res.json(table);
    } catch (error) {
      console.error("Error assigning captain:", error);
      res.status(500).json({ message: "Failed to assign captain" });
    }
  });

  app.put('/api/vendor/tables/:tableId/status', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const tableId = parseInt(req.params.tableId, 10);
      const { status } = req.body ?? {};

      if (Number.isNaN(tableId)) {
        return res.status(400).json({ message: "Invalid table id" });
      }

      if (!["available", "booked"].includes(status)) {
        return res.status(400).json({ message: "Status must be 'available' or 'booked'" });
      }

      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const table = await storage.updateTableStatus(vendor.id, tableId, status);

      res.json({ message: "Table status updated", table });
    } catch (error) {
      console.error("Error updating table status:", error);
      res.status(500).json({ message: "Failed to update table status" });
    }
  });

  // ============================================
  // Captain Management Routes
  // ============================================
  
  // Get all captains for vendor
  app.get('/api/vendor/captains', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);
      
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const captains = await storage.getCaptains(vendor.id);
      res.json(captains);
    } catch (error) {
      console.error("Error fetching captains:", error);
      res.status(500).json({ message: "Failed to fetch captains" });
    }
  });

  // Create captain
  app.post('/api/vendor/captains', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);
      
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const { password } = req.body;

      // ✅ Password length validation
      if (!password || password.length < 4) {
        return res.status(400).json({
          message: "Password must be at least 4 characters long",
        });
      }

      const validatedData = insertCaptainSchema.parse({
        ...req.body,
        vendorId: vendor.id,
      });

      const captain = await storage.createCaptain(validatedData);
      res.json(captain);
    } catch (error: any) {
      console.error("Error creating captain:", error);
      res.status(400).json({ message: error.message || "Failed to create captain" });
    }
  });

  // Delete captain
  app.delete('/api/vendor/captains/:captainId', isAuthenticated, isVendor, async (req, res) => {
    try {
      const captainId = parseInt(req.params.captainId);
      await storage.deleteCaptain(captainId);
      res.json({ message: "Captain deleted successfully" });
    } catch (error) {
      console.error("Error deleting captain:", error);
      res.status(500).json({ message: "Failed to delete captain" });
    }
  });

  // ============================================
  // Menu Management Routes
  // ============================================
  
  // Get menu categories
  app.get('/api/vendor/menu/categories', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);
      
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const categories = await storage.getMenuCategories(vendor.id);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

  // Create menu category
  app.post('/api/vendor/menu/categories', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);
      
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const gstRateSource = req.body?.gstRate;
      const rawGstRate =
        typeof gstRateSource === "number"
          ? gstRateSource
          : typeof gstRateSource === "string"
            ? Number.parseFloat(gstRateSource)
            : undefined;
      const gstModeRaw =
        typeof req.body.gstMode === "string" ? req.body.gstMode.toLowerCase() : undefined;

      let normalizedGstRate = 0;
      if (rawGstRate !== undefined && Number.isFinite(rawGstRate) && rawGstRate > 0) {
        const limited = Math.min(rawGstRate, 100);
        normalizedGstRate = Number(limited.toFixed(2));
      }
      const normalizedGstMode = gstModeRaw === "include" ? "include" : "exclude";

      const validatedData = insertMenuCategorySchema.parse({
        ...req.body,
        vendorId: vendor.id,
        gstRate: normalizedGstRate,
        gstMode: normalizedGstMode,
      });

      const category = await storage.createMenuCategory(validatedData);
      res.json(category);
    } catch (error: any) {
      console.error("Error creating category:", error);
      res.status(400).json({ message: error.message || "Failed to create category" });
    }
  });

  app.put(
    "/api/vendor/menu/categories/:categoryId",
    isAuthenticated,
    isVendor,
    async (req: any, res) => {
      try {
        const categoryId = parseNumber(req.params.categoryId);
        if (categoryId === undefined) {
          return res.status(400).json({ message: "Invalid category id" });
        }

        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        const updates: Partial<InsertMenuCategory> = {};

        if (typeof req.body.name === "string") {
          const trimmed = req.body.name.trim();
          if (!trimmed) {
            return res.status(400).json({ message: "Category name cannot be empty" });
          }
          updates.name = trimmed;
        }

        if (req.body.description !== undefined) {
          if (req.body.description === null) {
            updates.description = null as any;
          } else if (typeof req.body.description === "string") {
            updates.description = req.body.description.trim();
          }
        }

        if (req.body.gstRate !== undefined) {
          const raw =
            typeof req.body.gstRate === "number"
              ? req.body.gstRate
              : Number.parseFloat(String(req.body.gstRate));
          if (!Number.isFinite(raw) || raw < 0 || raw > 100) {
            return res.status(400).json({ message: "GST % must be between 0 and 100" });
          }
          updates.gstRate = raw.toFixed(2);
        }

        if (req.body.gstMode !== undefined) {
          const mode = String(req.body.gstMode).toLowerCase();
          if (!["include", "exclude"].includes(mode)) {
            return res
              .status(400)
              .json({ message: "gstMode must be either include or exclude" });
          }
          updates.gstMode = mode as any;
        }

        if (req.body.displayOrder !== undefined) {
          const order = parseNumber(req.body.displayOrder);
          if (order === undefined || !Number.isInteger(order)) {
            return res
              .status(400)
              .json({ message: "displayOrder must be an integer number" });
          }
          updates.displayOrder = order;
        }

        if (req.body.isActive !== undefined) {
          const active = parseBoolean(req.body.isActive);
          if (active === undefined) {
            return res
              .status(400)
              .json({ message: "isActive must be a boolean value" });
          }
          updates.isActive = active;
        }

        if (Object.keys(updates).length === 0) {
          return res
            .status(400)
            .json({ message: "No valid fields provided for update" });
        }

        const updated = await storage.updateMenuCategory(categoryId, vendor.id, updates);
        res.json(updated);
      } catch (error: any) {
        console.error("Error updating category:", error);
        res.status(400).json({
          message: error?.message || "Failed to update category",
        });
      }
    },
  );

  app.delete(
    "/api/vendor/menu/categories/:categoryId",
    isAuthenticated,
    isVendor,
    async (req: any, res) => {
      try {
        const categoryId = parseNumber(req.params.categoryId);
        if (categoryId === undefined) {
          return res.status(400).json({ message: "Invalid category id" });
        }

        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        await storage.deleteMenuCategory(categoryId, vendor.id);
        res.json({ success: true });
      } catch (error: any) {
        console.error("Error deleting category:", error);
        res.status(400).json({
          message: error?.message || "Failed to delete category",
        });
      }
    },
  );

  app.get('/api/captain/menu/categories', isAuthenticated, isCaptain, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const captain = await storage.getCaptainByUserId(userId);

      if (!captain) {
        return res.status(404).json({ message: "Captain not found" });
      }

      const categories = await storage.getMenuCategories(captain.vendorId);
      res.json(categories);
    } catch (error) {
      console.error("Error fetching captain categories:", error);
      res.status(500).json({ message: "Failed to fetch categories" });
    }
  });

    /* -------------------------------------------------
  📋 Get all Subcategories (for vendor)
  -------------------------------------------------- */
  app.get(
    "/api/vendor/menu/subcategories",
    isAuthenticated,
    isVendor,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        const subcategories = await storage.getMenuSubcategories(vendor.id);
        res.json(subcategories);
      } catch (error) {
        console.error("Error fetching subcategories:", error);
        res.status(500).json({ message: "Failed to fetch subcategories" });
      }
    }
  );

    /* -------------------------------------------------
  🧩 Create a new Subcategory
  -------------------------------------------------- */
  app.post(
    "/api/vendor/menu/subcategories",
    isAuthenticated,
    isVendor,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        const validatedData = insertMenuSubcategorySchema.parse({
          ...req.body,
          vendorId: vendor.id,
        });

        const subcategory = await storage.createMenuSubcategory(validatedData);
        res.json(subcategory);
      } catch (error: any) {
        console.error("Error creating subcategory:", error);
        res.status(400).json({
          message: error.message || "Failed to create subcategory",
        });
      }
    }
  );

  app.put(
    "/api/vendor/menu/subcategories/:subCategoryId",
    isAuthenticated,
    isVendor,
    async (req: any, res) => {
      try {
        const subCategoryId = parseNumber(req.params.subCategoryId);
        if (subCategoryId === undefined) {
          return res.status(400).json({ message: "Invalid subcategory id" });
        }

        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        const updates: Partial<InsertMenuSubcategory> = {};

        if (typeof req.body.name === "string") {
          const trimmed = req.body.name.trim();
          if (!trimmed) {
            return res.status(400).json({ message: "Subcategory name cannot be empty" });
          }
          updates.name = trimmed;
        }

        if (req.body.description !== undefined) {
          if (req.body.description === null) {
            updates.description = null as any;
          } else if (typeof req.body.description === "string") {
            updates.description = req.body.description.trim();
          }
        }

        if (req.body.categoryId !== undefined) {
          const categoryId = parseNumber(req.body.categoryId);
          if (categoryId === undefined) {
            return res.status(400).json({ message: "Invalid categoryId" });
          }
          updates.categoryId = categoryId;
        }

        if (req.body.displayOrder !== undefined) {
          const displayOrder = parseNumber(req.body.displayOrder);
          if (displayOrder === undefined || !Number.isInteger(displayOrder)) {
            return res
              .status(400)
              .json({ message: "displayOrder must be an integer number" });
          }
          updates.displayOrder = displayOrder;
        }

        if (req.body.isActive !== undefined) {
          const active = parseBoolean(req.body.isActive);
          if (active === undefined) {
            return res
              .status(400)
              .json({ message: "isActive must be a boolean value" });
          }
          updates.isActive = active;
        }

        if (Object.keys(updates).length === 0) {
          return res
            .status(400)
            .json({ message: "No valid fields provided for update" });
        }

        const updated = await storage.updateMenuSubcategory(subCategoryId, vendor.id, updates);
        res.json(updated);
      } catch (error: any) {
        console.error("Error updating subcategory:", error);
        res.status(400).json({
          message: error?.message || "Failed to update subcategory",
        });
      }
    },
  );

  app.delete(
    "/api/vendor/menu/subcategories/:subCategoryId",
    isAuthenticated,
    isVendor,
    async (req: any, res) => {
      try {
        const subCategoryId = parseNumber(req.params.subCategoryId);
        if (subCategoryId === undefined) {
          return res.status(400).json({ message: "Invalid subcategory id" });
        }

        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        await storage.deleteMenuSubcategory(subCategoryId, vendor.id);
        res.json({ success: true });
      } catch (error: any) {
        console.error("Error deleting subcategory:", error);
        res.status(400).json({
          message: error?.message || "Failed to delete subcategory",
        });
      }
    },
  );

  /* -------------------------------------------------
  🍽️ Get all Menu Items
  -------------------------------------------------- */
  app.get(
    "/api/vendor/menu/items",
    isAuthenticated,
    isVendor,
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        const [items, addons, categories] = await Promise.all([
          storage.getMenuItems(vendor.id),
          storage.getMenuAddons(vendor.id),
          storage.getMenuCategories(vendor.id),
        ]);
        const categoryMap = new Map(categories.map((category) => [category.id, category]));
        const itemsWithAddons = items.map((item) => ({
          ...item,
          gstRate: categoryMap.get(item.categoryId ?? 0)?.gstRate ?? "0.00",
          gstMode: categoryMap.get(item.categoryId ?? 0)?.gstMode ?? "exclude",
          addons: addons.filter((addon) => addon.itemId === item.id),
        }));
        res.json(itemsWithAddons);
      } catch (error) {
        console.error("Error fetching menu items:", error);
        res.status(500).json({ message: "Failed to fetch menu items" });
      }
    }
  );

  /* -------------------------------------------------
  🍳 Create a Menu Item (with photo)
  -------------------------------------------------- */
  app.post(
    "/api/vendor/menu/items",
    isAuthenticated,
    isVendor,
    upload.single("photo"),
    async (req: any, res) => {
      try {
        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        // Handle both JSON or form-data submissions
        let source: any = {};
        if (req.body?.data) {
          try {
            source = JSON.parse(req.body.data);
          } catch (err) {
            console.error("Invalid JSON in 'data' field:", err);
            return res.status(400).json({ message: "Invalid JSON in 'data' field" });
          }
        } else {
          source = { ...req.body };
        }

        const photo = req.file ? `/uploads/${req.file.filename}` : null;

        // Helper: parse booleans flexibly
        const parseBoolean = (v: any) => {
          if (typeof v === "boolean") return v;
          if (typeof v === "number") return v !== 0;
          if (typeof v === "string") {
            const lower = v.toLowerCase().trim();
            if (["true", "1", "yes", "y"].includes(lower)) return true;
            if (["false", "0", "no", "n"].includes(lower)) return false;
          }
          return undefined;
        };

        const payload = {
          ...source,
          vendorId: vendor.id,
          photo,
        };

        // Coerce numeric & boolean fields
        if (payload.categoryId !== undefined) {
          const parsed = Number(payload.categoryId);
          if (Number.isNaN(parsed)) {
            return res.status(400).json({ message: "Invalid categoryId" });
          }
          payload.categoryId = parsed;
        }

        if (payload.subCategoryId !== undefined) {
          const parsed = Number(payload.subCategoryId);
          if (Number.isNaN(parsed)) {
            return res.status(400).json({ message: "Invalid subCategoryId" });
          }
          payload.subCategoryId = parsed;
        }

        if (payload.isAvailable !== undefined) {
          const parsedBool = parseBoolean(payload.isAvailable);
          if (parsedBool === undefined) {
            return res
              .status(400)
              .json({ message: "Invalid isAvailable: must be boolean" });
          }
          payload.isAvailable = parsedBool;
        }

        // Validate final data
        const validatedData = insertMenuItemSchema.parse(payload);

        const item = await storage.createMenuItem(validatedData);
        res.json(item);
      } catch (error: any) {
        console.error("Error creating menu item:", error);
        if (error?.name === "ZodError" && Array.isArray(error?.issues)) {
          return res.status(400).json({
            message: "Validation failed",
            issues: error.issues,
          });
        }
        res.status(400).json({
          message: error.message || "Failed to create menu item",
        });
      }
    }
  );

  app.put(
    "/api/vendor/menu/items/:itemId",
    isAuthenticated,
    isVendor,
    upload.single("photo"),
    async (req: any, res) => {
      try {
        const itemId = parseNumber(req.params.itemId);
        if (itemId === undefined) {
          return res.status(400).json({ message: "Invalid item id" });
        }

        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        let source: any = {};
        if (req.body?.data) {
          try {
            source = JSON.parse(req.body.data);
          } catch (err) {
            console.error("Invalid JSON in 'data' field:", err);
            return res.status(400).json({ message: "Invalid JSON in 'data' field" });
          }
        } else {
          source = { ...req.body };
        }

        const updates: Partial<InsertMenuItem> = {};

        if (req.file) {
          updates.photo = `/uploads/${req.file.filename}`;
        } else if (source.removePhoto !== undefined) {
          const shouldRemove = parseBoolean(source.removePhoto);
          if (shouldRemove === undefined) {
            return res
              .status(400)
              .json({ message: "removePhoto must be a boolean value" });
          }
          if (shouldRemove) {
            updates.photo = null as any;
          }
        }

        if (source.categoryId !== undefined) {
          const categoryId = parseNumber(source.categoryId);
          if (categoryId === undefined) {
            return res.status(400).json({ message: "Invalid categoryId" });
          }
          updates.categoryId = categoryId;
        }

        if (source.subCategoryId !== undefined) {
          if (source.subCategoryId === "" || source.subCategoryId === null) {
            updates.subCategoryId = null;
          } else {
            const subCategoryId = parseNumber(source.subCategoryId);
            if (subCategoryId === undefined) {
              return res.status(400).json({ message: "Invalid subCategoryId" });
            }
            updates.subCategoryId = subCategoryId;
          }
        }

        if (typeof source.name === "string") {
          const trimmed = source.name.trim();
          if (!trimmed) {
            return res.status(400).json({ message: "Item name cannot be empty" });
          }
          updates.name = trimmed;
        }

        if (source.description !== undefined) {
          if (source.description === null) {
            updates.description = null as any;
          } else if (typeof source.description === "string") {
            updates.description = source.description.trim();
          }
        }

        if (source.price !== undefined) {
          const normalizedPrice = normalizePrice(source.price);
          if (!normalizedPrice.ok) {
            return res.status(400).json({ message: "Invalid price value" });
          }
          updates.price = normalizedPrice.value;
        }

        if (source.isAvailable !== undefined) {
          const available = parseBoolean(source.isAvailable);
          if (available === undefined) {
            return res
              .status(400)
              .json({ message: "isAvailable must be a boolean value" });
          }
          updates.isAvailable = available;
        }

        if (source.modifiers !== undefined) {
          updates.modifiers = source.modifiers;
        }

        if (source.tags !== undefined) {
          updates.tags = source.tags;
        }

        if (Object.keys(updates).length === 0) {
          return res
            .status(400)
            .json({ message: "No valid fields provided for update" });
        }

        const updated = await storage.updateMenuItem(itemId, vendor.id, updates);
        res.json(updated);
      } catch (error: any) {
        console.error("Error updating menu item:", error);
        if (req.file?.path) {
          fs.promises.unlink(req.file.path).catch((unlinkError) => {
            console.error("Failed to remove uploaded file after error", unlinkError);
          });
        }
        res.status(400).json({
          message: error?.message || "Failed to update menu item",
        });
      }
    },
  );

  app.delete(
    "/api/vendor/menu/items/:itemId",
    isAuthenticated,
    isVendor,
    async (req: any, res) => {
      try {
        const itemId = parseNumber(req.params.itemId);
        if (itemId === undefined) {
          return res.status(400).json({ message: "Invalid item id" });
        }

        const userId = req.user.claims.sub;
        const vendor = await storage.getVendorByUserId(userId);

        if (!vendor) {
          return res.status(404).json({ message: "Vendor not found" });
        }

        await storage.deleteMenuItem(itemId, vendor.id);
        res.json({ success: true });
      } catch (error: any) {
        console.error("Error deleting menu item:", error);
        res.status(400).json({
          message: error?.message || "Failed to delete menu item",
        });
      }
    },
  );

  // ============================================
// Menu Addon Routes
// ============================================

/* -------------------------------------------------
🧩 Get all Menu Addons for vendor
-------------------------------------------------- */
app.get(
  "/api/vendor/menu/addons",
  isAuthenticated,
  isVendor,
  async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const addons = await storage.getMenuAddons(vendor.id);
      res.json(addons);
    } catch (error) {
      console.error("Error fetching menu addons:", error);
      res.status(500).json({ message: "Failed to fetch menu addons" });
    }
  }
);

/* -------------------------------------------------
🍳 Create a Menu Addon
-------------------------------------------------- */
app.post(
  "/api/vendor/menu/addons",
  isAuthenticated,
  isVendor,
  async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const itemId = parseNumber(req.body.itemId ?? req.body.item_id);
      if (itemId === undefined) {
        return res.status(400).json({ message: "itemId is required" });
      }

      const menuItemsForVendor = await storage.getMenuItems(vendor.id);
      const targetItem = menuItemsForVendor.find((item) => item.id === itemId);
      if (!targetItem) {
        return res.status(404).json({ message: "Menu item not found for this vendor" });
      }

      const normalizedPriceResult = normalizePrice(req.body.price);
      if (!normalizedPriceResult.ok) {
        return res.status(400).json({ message: "Invalid price value" });
      }

      const isRequiredValue = req.body.isRequired ?? req.body.is_required;
      const isRequiredParsed = isRequiredValue !== undefined ? parseBoolean(isRequiredValue) : undefined;
      if (isRequiredValue !== undefined && isRequiredParsed === undefined) {
        return res.status(400).json({ message: "Invalid value for isRequired" });
      }

      const categoryValue = req.body.category;
      const name = typeof req.body.name === "string" ? req.body.name.trim() : "";
      if (!name) {
        return res.status(400).json({ message: "Addon name is required" });
      }

      const addon = await storage.createMenuAddon({
        vendorId: vendor.id,
        itemId,
        name,
        category: categoryValue === "" ? null : categoryValue ?? null,
        price: normalizedPriceResult.value,
        isRequired: isRequiredParsed ?? false,
      } as InsertMenuAddon);
      res.json(addon);
    } catch (error: any) {
      console.error("Error creating menu addon:", error);
      if (error?.name === "ZodError" && Array.isArray(error?.issues)) {
        return res.status(400).json({
          message: "Validation failed",
          issues: error.issues,
        });
      }
      res.status(400).json({ message: error.message || "Failed to create menu addon" });
    }
  }
);

/* -------------------------------------------------
🔧 Update a Menu Addon
-------------------------------------------------- */
app.put(
  "/api/vendor/menu/addons/:id",
  isAuthenticated,
  isVendor,
  async (req: any, res) => {
    try {
      const addonId = Number(req.params.id);
      if (Number.isNaN(addonId)) {
        return res.status(400).json({ message: "Invalid addon ID" });
      }

      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const updates: Record<string, unknown> = {};

      if (req.body.name !== undefined) {
        const trimmed = typeof req.body.name === "string" ? req.body.name.trim() : "";
        if (!trimmed) {
          return res.status(400).json({ message: "Addon name cannot be empty" });
        }
        updates.name = trimmed;
      }

      if (req.body.category !== undefined) {
        updates.category = req.body.category === "" ? null : req.body.category;
      }

      if (req.body.price !== undefined) {
        const normalizedPrice = normalizePrice(req.body.price);
        if (!normalizedPrice.ok) {
          return res.status(400).json({ message: "Invalid price value" });
        }
        updates.price = normalizedPrice.value;
      }

      if (req.body.isRequired !== undefined) {
        const parsed = parseBoolean(req.body.isRequired);
        if (parsed === undefined) {
          return res.status(400).json({ message: "Invalid value for isRequired" });
        }
        updates.isRequired = parsed;
      }

      if (req.body.itemId !== undefined || req.body.item_id !== undefined) {
        const newItemId = parseNumber(req.body.itemId ?? req.body.item_id);
        if (newItemId === undefined) {
          return res.status(400).json({ message: "Invalid value for itemId" });
        }

        const menuItemsForVendor = await storage.getMenuItems(vendor.id);
        const targetItem = menuItemsForVendor.find((item) => item.id === newItemId);
        if (!targetItem) {
          return res.status(404).json({ message: "Menu item not found for this vendor" });
        }

        updates.itemId = newItemId;
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ message: "No changes provided" });
      }

      const updatedAddon = await storage.updateMenuAddon(addonId, vendor.id, updates as any);
      res.json(updatedAddon);
    } catch (error: any) {
      console.error("Error updating menu addon:", error);
      if (error?.message === "Menu addon not found") {
        return res.status(404).json({ message: error.message });
      }
      if (error?.message && error.message.includes("not allowed")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(400).json({ message: error.message || "Failed to update menu addon" });
    }
  }
);

/* -------------------------------------------------
❌ Delete a Menu Addon
-------------------------------------------------- */
app.delete(
  "/api/vendor/menu/addons/:id",
  isAuthenticated,
  isVendor,
  async (req: any, res) => {
    try {
      const addonId = Number(req.params.id);
      if (Number.isNaN(addonId)) {
        return res.status(400).json({ message: "Invalid addon ID" });
      }

      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      await storage.deleteMenuAddon(addonId, vendor.id);
      res.json({ message: "Menu addon deleted successfully" });
    } catch (error) {
      console.error("Error deleting menu addon:", error);
      if (error instanceof Error && error.message === "Menu addon not found") {
        return res.status(404).json({ message: error.message });
      }
      if (error instanceof Error && error.message.includes("not allowed")) {
        return res.status(403).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to delete menu addon" });
    }
  }
);

/* -------------------------------------------------
🍽️ Get a single Menu Addon
-------------------------------------------------- */
app.get(
  "/api/vendor/menu/addons/:id",
  isAuthenticated,
  isVendor,
  async (req: any, res) => {
    try {
      const addonId = Number(req.params.id);
      if (Number.isNaN(addonId)) {
        return res.status(400).json({ message: "Invalid addon ID" });
      }

      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const addon = await storage.getMenuAddon(addonId);
      if (!addon) {
        return res.status(404).json({ message: "Menu addon not found" });
      }

      if (addon.vendorId !== vendor.id) {
        return res.status(403).json({ message: "You are not allowed to view this addon" });
      }

      res.json(addon);
    } catch (error) {
      console.error("Error fetching menu addon:", error);
      res.status(500).json({ message: "Failed to fetch menu addon" });
    }
  }
);

  // ============================================
  // Order Management Routes
  // ============================================
  
  // Create dine-in order manually (no QR scan required)
  app.post('/api/vendor/orders', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const parsed = manualOrderSchema.parse(req.body);

      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const table = await storage.getTable(parsed.tableId);
      if (!table || table.vendorId !== vendor.id) {
        return res.status(400).json({ message: "Invalid table selected" });
      }

      const orderPayload = await buildManualOrderPayload(vendor.id, table.id, parsed);
      const order = await storage.createOrder(orderPayload);

      await handleOrderPostCreation(order.id);

      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating manual order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", issues: error.issues });
      }
      if (error instanceof Error) {
        const knownMessages = new Set([
          "Invalid item price",
          "Menu item not found.",
          "One or more menu items are no longer available.",
          "Invalid menu item selected.",
        ]);
        if (knownMessages.has(error.message)) {
          return res.status(400).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Order updates stream (SSE) for vendors and captains
  app.get('/api/orders/stream', isAuthenticated, async (req: any, res) => {
    const userId = req.user?.claims?.sub;

    try {
      if (!userId) {
        res.status(401).json({ message: "Unauthorized" });
        return;
      }

      const userRecord = await storage.getUser(userId);
      if (!userRecord) {
        res.status(401).json({ message: "User not found" });
        return;
      }

      let vendorId: number | null = null;
      let role: "vendor" | "captain";

      if (userRecord.role === "vendor") {
        const vendor = await storage.getVendorByUserId(userId);
        if (!vendor) {
          res.status(404).json({ message: "Vendor not found" });
          return;
        }
        vendorId = vendor.id;
        role = "vendor";
      } else if (userRecord.role === "captain") {
        const captain = await storage.getCaptainByUserId(userId);
        if (!captain) {
          res.status(404).json({ message: "Captain not found" });
          return;
        }
        vendorId = captain.vendorId;
        role = "captain";
      } else {
        res.status(403).json({ message: "Unsupported role for order stream" });
        return;
      }

      if (vendorId === null) {
        res.status(500).json({ message: "Unable to resolve vendor for order stream" });
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      });

      if (typeof res.flushHeaders === "function") {
        res.flushHeaders();
      } else {
        res.write("\n");
      }

      let client!: OrderStreamClient;

      const heartbeat = setInterval(() => {
        try {
          res.write(": heartbeat\n\n");
        } catch (error) {
          console.error("Heartbeat failed for order stream client", error);
          removeOrderStreamClient(client);
        }
      }, 30000);

      client = {
        res,
        vendorId,
        role,
        heartbeat,
      };

      orderStreamClients.add(client);

      res.write(`data: ${JSON.stringify({ type: "connected" })}\n\n`);

      const cleanup = () => {
        removeOrderStreamClient(client);
      };

      req.on("close", cleanup);
      req.on("end", cleanup);
      req.on("error", cleanup);
    } catch (error) {
      console.error("Failed to open order stream:", error);
      if (!res.headersSent) {
        res.status(500).json({ message: "Failed to open order stream" });
      } else {
        res.end();
      }
    }
  });

  // Get vendor orders with vendor details
  app.get('/api/vendor/orders', isAuthenticated, isVendorOrOwner, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      const vendor = await getVendorForUser(userId, user.role);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;

      const parsedLimit = rawLimit ? Number.parseInt(String(rawLimit), 10) : NaN;
      const parsedPage = rawPage ? Number.parseInt(String(rawPage), 10) : NaN;

      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : null;
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
      const offset = limit ? (page - 1) * limit : 0;

      // Fetch dine-in orders, delivery orders, and pickup orders
      // Always fetch all orders first, then paginate after combining
      const allDineInOrders = await storage.getOrders(vendor.id);
      const allDeliveryOrders = await storage.getVendorDeliveryOrders(vendor.id);
      const allPickupOrders = await storage.getVendorPickupOrders(vendor.id);
      const totalDineInOrders = allDineInOrders.length;
      const totalDeliveryOrders = allDeliveryOrders.length;
      const totalPickupOrders = allPickupOrders.length;

      // Process dine-in orders and get KOT tickets
      const dineInOrderIds = allDineInOrders.map((order) => order.id);
      const kotTickets = await storage.getKotTicketsByOrderIds(dineInOrderIds);
      const kotMap = new Map(kotTickets.map((ticket) => [ticket.orderId, ticket]));

      // Get KOT tickets for delivery orders (they use special ticket number pattern)
      const deliveryOrderIds = allDeliveryOrders.map((order) => order.id);
      const deliveryKotMap = new Map<number, KotTicket>();
      
      // Query KOT tickets for delivery orders by ticket number pattern
      if (deliveryOrderIds.length > 0) {
        try {
          const deliveryKotTicketNumbers = deliveryOrderIds.map(id => `KOT-DEL-${vendor.id}-${id}`);
          
          // Get all KOT tickets for this vendor
          const allVendorKotTickets = await storage.getKotTicketsByVendorId(vendor.id);
          
          // Filter for delivery order KOT tickets
          const deliveryKotTickets = allVendorKotTickets.filter((t) => 
            t.ticketNumber && deliveryKotTicketNumbers.includes(t.ticketNumber)
          );
          
          // Map delivery order IDs to their KOT tickets
          for (const deliveryId of deliveryOrderIds) {
            const kot = deliveryKotTickets.find((t) => 
              t.ticketNumber === `KOT-DEL-${vendor.id}-${deliveryId}`
            );
            if (kot) {
              deliveryKotMap.set(deliveryId, kot);
            }
          }
        } catch (kotError) {
          // If KOT query fails, log but don't fail the whole request
          console.error("Error fetching delivery KOT tickets:", kotError);
        }
      }

      const vendorUser = await storage.getUser(vendor.userId);
      const tables = await storage.getTables(vendor.id);
      const tableMap = new Map(tables.map((table) => [table.id, table]));

      // Format dine-in orders
      const formattedDineInOrders = allDineInOrders.map((order: any) => ({
        ...order,
        orderType: 'dine-in',
        tableNumber: tableMap.get(order.tableId)?.tableNumber ?? null,
        vendorDetails: {
          name: vendor.restaurantName,
          address: vendor.address,
          phone: vendor.phone,
          email: vendorUser?.email ?? null,
          paymentQrCodeUrl: vendor.paymentQrCodeUrl,
          gstin: vendor.gstin ?? null,
        },
        kotTicket: kotMap.get(order.id) ?? null,
      }));

      // Format delivery orders (convert to similar structure)
      // Also create KOT for delivery orders that should have one but don't
      const formattedDeliveryOrders = await Promise.all(
        allDeliveryOrders.map(async (order: any) => {
          let kotTicket = deliveryKotMap.get(order.id) ?? null;
          
          // If order is accepted or beyond but doesn't have KOT, create it
          if (!kotTicket && order.status && 
              ['accepted', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'completed'].includes(order.status)) {
            try {
              kotTicket = await storage.createDeliveryKot(order);
              // Update the map so it's available for other orders
              deliveryKotMap.set(order.id, kotTicket);
              
              // Broadcast KOT creation event
              broadcastOrderEvent({
                type: "kot-created",
                orderId: order.id,
                vendorId: order.vendorId,
                kotId: kotTicket.id,
                ticketNumber: kotTicket.ticketNumber,
              });
            } catch (kotError) {
              // Log error but don't fail the request
              console.error(`Error creating KOT for delivery order #${order.id}:`, kotError);
            }
          }
          
          return {
            id: order.id,
            vendorId: order.vendorId,
            tableId: null, // Delivery orders don't have table
            items: order.items,
            totalAmount: order.totalAmount,
            customerName: order.customerName || null,
            customerPhone: order.customerPhone || order.deliveryPhone || null,
            status: order.status,
            orderType: 'delivery',
            deliveryAddress: order.deliveryAddress,
            deliveryLatitude: order.deliveryLatitude,
            deliveryLongitude: order.deliveryLongitude,
            customerNotes: order.customerNotes || null,
            acceptedAt: order.acceptedAt,
            preparingAt: order.preparingAt,
            readyAt: order.readyAt,
            outForDeliveryAt: order.outForDeliveryAt,
            deliveredAt: order.deliveredAt,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            tableNumber: null,
            vendorDetails: {
              name: vendor.restaurantName,
              address: vendor.address,
              phone: vendor.phone,
              email: vendorUser?.email ?? null,
              paymentQrCodeUrl: vendor.paymentQrCodeUrl,
              gstin: vendor.gstin ?? null,
            },
            kotTicket: kotTicket, // Get KOT for delivery order (created if missing)
          };
        })
      );

      // Get KOT tickets for pickup orders (they use special ticket number pattern)
      const pickupOrderIds = allPickupOrders.map((order) => order.id);
      const pickupKotMap = new Map<number, KotTicket>();
      
      // Query KOT tickets for pickup orders by ticket number pattern
      if (pickupOrderIds.length > 0) {
        try {
          const pickupKotTicketNumbers = pickupOrderIds.map(id => `KOT-PICKUP-${vendor.id}-${id}`);
          
          // Get all KOT tickets for this vendor
          const allVendorKotTickets = await storage.getKotTicketsByVendorId(vendor.id);
          
          // Filter for pickup order KOT tickets
          const pickupKotTickets = allVendorKotTickets.filter((t) => 
            t.ticketNumber && pickupKotTicketNumbers.includes(t.ticketNumber)
          );
          
          // Map pickup order IDs to their KOT tickets
          for (const pickupId of pickupOrderIds) {
            const kot = pickupKotTickets.find((t) => 
              t.ticketNumber === `KOT-PICKUP-${vendor.id}-${pickupId}`
            );
            if (kot) {
              pickupKotMap.set(pickupId, kot);
            }
          }
        } catch (kotError) {
          // If KOT query fails, log but don't fail the whole request
          console.error("Error fetching pickup KOT tickets:", kotError);
        }
      }

      // Format pickup orders (similar to delivery orders)
      // Also create KOT for pickup orders that should have one but don't
      const formattedPickupOrders = await Promise.all(
        allPickupOrders.map(async (order: any) => {
          let kotTicket = pickupKotMap.get(order.id) ?? null;
          
          // If order is accepted or beyond but doesn't have KOT, create it
          if (!kotTicket && order.status && 
              ['accepted', 'preparing', 'ready', 'completed'].includes(order.status)) {
            try {
              kotTicket = await storage.createPickupKot(order);
              // Update the map so it's available for other orders
              pickupKotMap.set(order.id, kotTicket);
              
              // Broadcast KOT creation event
              broadcastOrderEvent({
                type: "kot-created",
                orderId: order.id,
                vendorId: order.vendorId,
                kotId: kotTicket.id,
                ticketNumber: kotTicket.ticketNumber,
              });
            } catch (kotError) {
              // Log error but don't fail the request
              console.error(`Error creating KOT for pickup order #${order.id}:`, kotError);
            }
          }
          
          return {
            id: order.id,
            vendorId: order.vendorId,
            tableId: null, // Pickup orders don't have table
            items: order.items,
            totalAmount: order.totalAmount,
            customerName: null, // Pickup orders use userId, not customerName
            customerPhone: order.customerPhone || null,
            status: order.status,
            orderType: 'pickup',
            pickupReference: order.pickupReference,
            pickupTime: order.pickupTime,
            customerNotes: order.customerNotes || null,
            acceptedAt: order.acceptedAt,
            preparingAt: order.preparingAt,
            readyAt: order.readyAt,
            completedAt: order.completedAt,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt,
            tableNumber: null,
            vendorDetails: {
              name: vendor.restaurantName,
              address: vendor.address,
              phone: vendor.phone,
              email: vendorUser?.email ?? null,
              paymentQrCodeUrl: vendor.paymentQrCodeUrl,
              gstin: vendor.gstin ?? null,
            },
            kotTicket: kotTicket, // Get KOT for pickup order (created if missing)
          };
        })
      );

      // Combine and sort by creation date (newest first)
      const allOrders = [...formattedDineInOrders, ...formattedDeliveryOrders, ...formattedPickupOrders].sort((a, b) => {
        const dateA = new Date(a.createdAt).getTime();
        const dateB = new Date(b.createdAt).getTime();
        return dateB - dateA;
      });

      const totalOrders = totalDineInOrders + totalDeliveryOrders + totalPickupOrders;
      
      // Apply pagination after combining and sorting
      const ordersWithVendor = limit ? allOrders.slice(offset, offset + limit) : allOrders;

      if (limit) {
        const totalPages = limit > 0 ? Math.ceil(totalOrders / limit) : 1;
        res.json({
          data: ordersWithVendor,
          page,
          pageSize: limit,
          total: totalOrders,
          totalPages: totalPages || 1,
          hasNextPage: page < (totalPages || 1),
          hasPreviousPage: page > 1,
        });
      } else {
        res.json(ordersWithVendor);
      }
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Update order status (handles dine-in, delivery, and pickup orders)
  app.put('/api/vendor/orders/:orderId/status', isAuthenticated, isVendor, async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const { status, orderType } = req.body; // orderType: 'dine-in', 'delivery', or 'pickup' (optional, will auto-detect)

      let order: any;
      let customerPhone: string | null = null;
      let orderTypeDetected: 'dine-in' | 'delivery' | 'pickup' = 'dine-in';

      // Auto-detect order type if not provided
      if (orderType === 'delivery') {
        orderTypeDetected = 'delivery';
      } else if (orderType === 'pickup') {
        orderTypeDetected = 'pickup';
      } else if (orderType === 'dine-in') {
        orderTypeDetected = 'dine-in';
      } else {
        // Try to find in pickup orders first, then delivery orders, then dine-in orders
        try {
          const pickupOrder = await db.select().from(pickupOrders).where(eq(pickupOrders.id, orderId)).limit(1);
          if (pickupOrder.length > 0) {
            orderTypeDetected = 'pickup';
          } else {
            const deliveryOrder = await db.select().from(deliveryOrders).where(eq(deliveryOrders.id, orderId)).limit(1);
            if (deliveryOrder.length > 0) {
              orderTypeDetected = 'delivery';
            }
          }
        } catch {
          // If not found, assume dine-in
          orderTypeDetected = 'dine-in';
        }
      }

      // Update order based on type
      if (orderTypeDetected === 'pickup') {
        order = await storage.updatePickupOrderStatus(orderId, status);
        customerPhone = order.customerPhone || null;
        
        // Create KOT for pickup orders when status becomes 'accepted'
        if (status === 'accepted') {
          try {
            const kotTicket = await storage.createPickupKot(order);
            // Broadcast KOT creation event
            broadcastOrderEvent({
              type: "kot-created",
              orderId: order.id,
              vendorId: order.vendorId,
              kotId: kotTicket.id,
              ticketNumber: kotTicket.ticketNumber,
            });
          } catch (kotError) {
            // Log error but don't fail the status update
            console.error("Error creating KOT for pickup order:", kotError);
          }
        }
      } else if (orderTypeDetected === 'delivery') {
        order = await storage.updateDeliveryOrderStatus(orderId, status);
        customerPhone = order.customerPhone || order.deliveryPhone || null;
        
        // Create KOT for delivery orders when status becomes 'accepted'
        if (status === 'accepted') {
          try {
            const kotTicket = await storage.createDeliveryKot(order);
            // Broadcast KOT creation event
            broadcastOrderEvent({
              type: "kot-created",
              orderId: order.id,
              vendorId: order.vendorId,
              kotId: kotTicket.id,
              ticketNumber: kotTicket.ticketNumber,
            });
          } catch (kotError) {
            // Log error but don't fail the status update
            console.error("Error creating KOT for delivery order:", kotError);
          }
        }
      } else {
        order = await storage.updateOrderStatus(orderId, status);
        customerPhone = order.customerPhone || null;
        
        // Create KOT for dine-in orders when status becomes 'accepted'
        if (status === 'accepted') {
          try {
            const kotTicket = await storage.ensureKotTicket(order);
            // Broadcast KOT creation event
            broadcastOrderEvent({
              type: "kot-created",
              orderId: order.id,
              vendorId: order.vendorId,
              kotId: kotTicket.id,
              ticketNumber: kotTicket.ticketNumber,
            });
          } catch (kotError) {
            // Log error but don't fail the status update
            console.error("Error creating KOT for dine-in order:", kotError);
          }
        }
      }
      
      // Send notifications (SMS and Push) for order status updates
      try {
        if (customerPhone) {
          const vendor = await storage.getVendor(order.vendorId);
          if (vendor) {
            // Send SMS notification (non-blocking, don't fail request if notification fails)
            notificationService.sendOrderNotification(
              customerPhone,
              status,
              vendor.restaurantName
            ).catch(err => console.error('Failed to send SMS notification:', err));
            
            // TODO: Send push notification to customer when FCM token is stored
          }
        }
      } catch (notificationError) {
        // Log but don't fail the request
        console.error('Error sending notifications:', notificationError);
      }
      
      res.json(order);

      broadcastOrderEvent({
        type: "order-status-changed",
        orderId: order.id,
        vendorId: order.vendorId,
        status,
      });
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // ============================================
  // Captain Routes
  // ============================================
  
  // Captain manual order creation
  app.post('/api/captain/orders', isAuthenticated, isCaptain, async (req: any, res) => {
    try {
      const parsed = manualOrderSchema.parse(req.body);
      const userId = req.user.claims.sub;
      const captain = await storage.getCaptainByUserId(userId);

      if (!captain) {
        return res.status(404).json({ message: "Captain not found" });
      }

      const table = await storage.getTable(parsed.tableId);
      if (!table || table.vendorId !== captain.vendorId) {
        return res.status(400).json({ message: "Invalid table selected" });
      }

      if (table.captainId !== captain.id) {
        return res.status(403).json({ message: "You are not assigned to this table" });
      }

      if (table.isActive === false) {
        return res.status(409).json({ message: "This table is currently marked as booked. Please choose another table." });
      }

      const orderPayload = await buildManualOrderPayload(captain.vendorId, table.id, parsed);
      const order = await storage.createOrder(orderPayload);

      await handleOrderPostCreation(order.id);

      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating captain order:", error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid order data", issues: error.issues });
      }
      if (error instanceof Error) {
        const knownMessages = new Set([
          "Invalid item price",
          "Menu item not found.",
          "One or more menu items are no longer available.",
          "Invalid menu item selected.",
        ]);
        if (knownMessages.has(error.message)) {
          return res.status(400).json({ message: error.message });
        }
      }
      res.status(500).json({ message: "Failed to create order" });
    }
  });

  // Captain orders overview
  app.get('/api/captain/orders', isAuthenticated, isCaptain, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const captain = await storage.getCaptainByUserId(userId);

      if (!captain) {
        return res.status(404).json({ message: "Captain not found" });
      }

      const [ordersForCaptain, vendor] = await Promise.all([
        storage.getCaptainOrders(captain.id),
        storage.getVendor(captain.vendorId),
      ]);

      const orderIds = ordersForCaptain.map((order) => order.id);
      const kotTickets = await storage.getKotTicketsByOrderIds(orderIds);
      const kotMap = new Map(kotTickets.map((ticket) => [ticket.orderId, ticket]));

      const vendorDetails = vendor
        ? {
            name: vendor.restaurantName,
            address: vendor.address,
            phone: vendor.phone,
            paymentQrCodeUrl: vendor.paymentQrCodeUrl,
          }
        : null;

      const payload = ordersForCaptain.map((order) => ({
        ...order,
        vendorDetails,
        kotTicket: kotMap.get(order.id) ?? null,
      }));

      res.json(payload);
    } catch (error) {
      console.error("Error fetching captain orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Captain view of menu items
  app.get('/api/captain/menu/items', isAuthenticated, isCaptain, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const captain = await storage.getCaptainByUserId(userId);

      if (!captain) {
        return res.status(404).json({ message: "Captain not found" });
      }

      const [items, addons, categories] = await Promise.all([
        storage.getMenuItems(captain.vendorId),
        storage.getMenuAddons(captain.vendorId),
        storage.getMenuCategories(captain.vendorId),
      ]);

      const categoryMap = new Map(categories.map((category) => [category.id, category]));
      const itemsWithAddons = items.map((item) => ({
        ...item,
        gstRate: categoryMap.get(item.categoryId ?? 0)?.gstRate ?? "0.00",
        gstMode: categoryMap.get(item.categoryId ?? 0)?.gstMode ?? "exclude",
        addons: addons.filter((addon) => addon.itemId === item.id),
      }));

      res.json(itemsWithAddons);
    } catch (error) {
      console.error("Error fetching captain menu items:", error);
      res.status(500).json({ message: "Failed to fetch menu items" });
    }
  });

  // Get captain's assigned tables with current orders
  app.get('/api/captain/tables', isAuthenticated, isCaptain, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      
      // Get captain by userId
      const captain = await storage.getCaptainByUserId(userId);
      
      if (!captain) {
        return res.status(404).json({ message: "Captain not found" });
      }

      const tables = await storage.getCaptainTables(captain.id);
      res.json(tables);
    } catch (error) {
      console.error("Error fetching captain tables:", error);
      res.status(500).json({ message: "Failed to fetch tables" });
    }
  });

  // ============================================
  // Admin Routes
  // ============================================
  
  // Get admin stats
  app.get('/api/admin/stats', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const stats = await storage.getAdminStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching admin stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  app.get('/api/admin/sales', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const startDate =
        typeof req.query.startDate === "string" ? req.query.startDate : undefined;
      const endDate =
        typeof req.query.endDate === "string" ? req.query.endDate : undefined;

      const summary = await storage.getAdminSalesSummary(startDate, endDate);
      res.json(summary);
    } catch (error) {
      console.error("Error fetching admin sales summary:", error);
      res.status(500).json({ message: "Failed to fetch sales summary" });
    }
  });

  app.get('/api/admin/orders', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const rawLimit = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
      const rawPage = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;

      const parsedLimit = rawLimit ? Number.parseInt(String(rawLimit), 10) : NaN;
      const parsedPage = rawPage ? Number.parseInt(String(rawPage), 10) : NaN;

      const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 10;
      const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
      const offset = (page - 1) * limit;

      const { orders, total } = await storage.getAdminOrdersPaginated(limit, offset);
      const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;

      res.json({
        data: orders,
        page,
        pageSize: limit,
        total,
        totalPages: totalPages || 1,
        hasNextPage: page < (totalPages || 1),
        hasPreviousPage: page > 1,
      });
    } catch (error) {
      console.error("Error fetching admin orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Get all vendors
  app.get('/api/admin/vendors', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const vendors = await storage.getAllVendors();
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching vendors:", error);
      res.status(500).json({ message: "Failed to fetch vendors" });
    }
  });

  // Get pending vendors
  app.get('/api/admin/vendors/pending', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const vendors = await storage.getPendingVendors();
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching pending vendors:", error);
      res.status(500).json({ message: "Failed to fetch pending vendors" });
    }
  });

  // Update vendor status (approve/reject/suspend)
  app.put('/api/admin/vendors/:vendorId/status', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      const { status, rejectionReason } = req.body;
      const adminUserId = req.user.claims.sub;

      const vendor = await storage.updateVendorStatus(vendorId, status, rejectionReason, adminUserId);
      res.json(vendor);
    } catch (error) {
      console.error("Error updating vendor status:", error);
      res.status(500).json({ message: "Failed to update vendor status" });
    }
  });

  app.put('/api/admin/vendors/:vendorId/fulfillment', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      if (Number.isNaN(vendorId)) {
        return res.status(400).json({ message: "Invalid vendor ID" });
      }

      const vendor = await storage.getVendor(vendorId);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const body = req.body ?? {};
      const updates: Record<string, unknown> = {};
      let hasUpdates = false;

      if (body.isDeliveryAllowed !== undefined) {
        const parsed = parseBoolean(body.isDeliveryAllowed);
        if (parsed === undefined) {
          return res.status(400).json({ message: "Invalid value for isDeliveryAllowed" });
        }
        updates.isDeliveryAllowed = parsed;
        hasUpdates = true;

        if (!parsed && vendor.isDeliveryEnabled) {
          updates.isDeliveryEnabled = false;
        }
      }

      if (body.isPickupAllowed !== undefined) {
        const parsed = parseBoolean(body.isPickupAllowed);
        if (parsed === undefined) {
          return res.status(400).json({ message: "Invalid value for isPickupAllowed" });
        }
        updates.isPickupAllowed = parsed;
        hasUpdates = true;

        if (!parsed && vendor.isPickupEnabled) {
          updates.isPickupEnabled = false;
        }
      }

      if (!hasUpdates) {
        return res.status(400).json({ message: "No changes provided" });
      }

      const updatedVendorRecord = await storage.updateVendor(vendorId, updates as any);
      await storage.syncDuplicateVendors(vendor.userId, vendorId, updates as any);
      const refreshedVendor = await storage.getVendor(updatedVendorRecord.id);

      res.json(refreshedVendor);
    } catch (error) {
      console.error("Error updating vendor fulfillment access:", error);
      res.status(500).json({ message: "Failed to update vendor fulfillment access" });
    }
  });

  // Get all mobile app users
  app.get('/api/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const isPhoneVerified = typeof req.query.isPhoneVerified === "string"
        ? req.query.isPhoneVerified === "true"
        : undefined;
      const city = typeof req.query.city === "string" ? req.query.city : undefined;
      const state = typeof req.query.state === "string" ? req.query.state : undefined;

      const usersWithStats = await storage.getAppUsersWithStats({
        search,
        isPhoneVerified,
        city,
        state,
      });
      res.json(usersWithStats);
    } catch (error) {
      console.error("Error fetching app users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get all system users (vendor, captain, admin)
  app.get('/api/admin/system-users', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const role = typeof req.query.role === "string" ? req.query.role : undefined;
      const isActive = typeof req.query.isActive === "string" 
        ? req.query.isActive === "true" 
        : undefined;
      const isVerified = typeof req.query.isVerified === "string"
        ? req.query.isVerified === "true"
        : undefined;
      const search = typeof req.query.search === "string" ? req.query.search : undefined;

      const systemUsers = await storage.getAllSystemUsers({
        role,
        isActive,
        isVerified,
        search,
      });
      res.json(systemUsers);
    } catch (error) {
      console.error("Error fetching system users:", error);
      res.status(500).json({ message: "Failed to fetch system users" });
    }
  });

  // Create system user
  app.post('/api/admin/system-users', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const { fullName, email, phoneNumber, role, password, isActive, isVerified, vendorId } = req.body;

      // Validation
      if (!email || typeof email !== "string" || !email.trim()) {
        return res.status(400).json({ message: "Email is required" });
      }

      if (!password || typeof password !== "string" || password.length < 6) {
        return res.status(400).json({ message: "Password is required and must be at least 6 characters" });
      }

      if (!role || !["admin", "vendor", "captain", "owner"].includes(role)) {
        return res.status(400).json({ message: "Valid role is required (admin, vendor, captain, or owner)" });
      }

      // Check if email already exists
      const existingUser = await storage.getUserByEmail(email.trim());
      if (existingUser) {
        return res.status(400).json({ message: "Email already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user
      const newUser = await storage.upsertUser({
        id: uuidv4(),
        email: email.trim(),
        password: hashedPassword,
        fullName: fullName?.trim() || null,
        phoneNumber: phoneNumber?.trim() || null,
        role: role,
        isActive: isActive !== undefined ? (isActive === true || isActive === "true") : true,
        isVerified: isVerified !== undefined ? (isVerified === true || isVerified === "true") : false,
      });

      // If role is owner, handle vendor assignment
      if (role === "owner" && vendorId !== undefined) {
        const parsedVendorId = typeof vendorId === "string" 
          ? Number.parseInt(vendorId, 10) 
          : typeof vendorId === "number" 
          ? vendorId 
          : null;
        
        if (parsedVendorId && !Number.isNaN(parsedVendorId)) {
          const vendor = await storage.getVendor(parsedVendorId);
          if (vendor) {
            // Update vendor to set this user as owner
            await storage.updateVendor(parsedVendorId, { ownerId: newUser.id });
          }
        }
      }

      res.status(201).json(newUser);
    } catch (error: any) {
      console.error("Error creating system user:", error);
      res.status(500).json({ message: error?.message || "Failed to create system user" });
    }
  });

  // Update system user
  app.put('/api/admin/system-users/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = req.params.id;
      const updates: Partial<{ fullName: string; email: string; phoneNumber: string; role: string; isActive: boolean; isVerified: boolean }> = {};

      if (req.body.fullName !== undefined) {
        updates.fullName = typeof req.body.fullName === "string" ? req.body.fullName.trim() : null;
      }
      if (req.body.email !== undefined) {
        updates.email = typeof req.body.email === "string" ? req.body.email.trim() || null : null;
      }
      if (req.body.phoneNumber !== undefined) {
        updates.phoneNumber = typeof req.body.phoneNumber === "string" ? req.body.phoneNumber.trim() || null : null;
      }
      if (req.body.role !== undefined && ["admin", "vendor", "captain", "owner"].includes(req.body.role)) {
        updates.role = req.body.role;
      }
      if (req.body.isActive !== undefined) {
        updates.isActive = req.body.isActive === true || req.body.isActive === "true";
      }
      if (req.body.isVerified !== undefined) {
        updates.isVerified = req.body.isVerified === true || req.body.isVerified === "true";
      }

      const updatedUser = await storage.updateUser(userId, updates);
      
      // If role is owner, handle vendor assignment
      if (req.body.role === "owner" && req.body.vendorId !== undefined) {
        const vendorId = typeof req.body.vendorId === "string" 
          ? Number.parseInt(req.body.vendorId, 10) 
          : typeof req.body.vendorId === "number" 
          ? req.body.vendorId 
          : null;
        
        if (vendorId && !Number.isNaN(vendorId)) {
          const vendor = await storage.getVendor(vendorId);
          if (vendor) {
            // Update vendor to set this user as owner
            await storage.updateVendor(vendorId, { ownerId: userId });
          }
        }
      }
      
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating system user:", error);
      res.status(500).json({ message: "Failed to update system user" });
    }
  });

  // Delete system user (soft delete - set isActive to false)
  app.delete('/api/admin/system-users/:id', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const currentUserId = req.user && req.user.claims ? req.user.claims.sub : null;
      
      // Prevent deleting yourself
      if (userId === currentUserId) {
        return res.status(400).json({ message: "You cannot delete your own account" });
      }

      // Soft delete by setting isActive to false
      const updatedUser = await storage.updateUser(userId, { isActive: false });
      res.json({ message: "User deactivated successfully", user: updatedUser });
    } catch (error) {
      console.error("Error deleting system user:", error);
      res.status(500).json({ message: "Failed to delete system user" });
    }
  });

  // Toggle system user status
  app.patch('/api/admin/system-users/:id/status', isAuthenticated, isAdmin, async (req: any, res) => {
    try {
      const userId = req.params.id;
      const isActive = req.body.isActive === true || req.body.isActive === "true";
      const currentUserId = req.user && req.user.claims ? req.user.claims.sub : null;
      
      // Prevent deactivating yourself
      if (!isActive && userId === currentUserId) {
        return res.status(400).json({ message: "You cannot deactivate your own account" });
      }

      const updatedUser = await storage.updateUser(userId, { isActive });
      res.json({ message: `User ${isActive ? "activated" : "deactivated"} successfully`, user: updatedUser });
    } catch (error) {
      console.error("Error updating system user status:", error);
      res.status(500).json({ message: "Failed to update user status" });
    }
  });

  // Update app user
  app.put('/api/admin/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const updates: Partial<{ name: string; email: string; phone: string; city: string; state: string; isPhoneVerified: boolean }> = {};

      if (req.body.name !== undefined) {
        updates.name = typeof req.body.name === "string" ? req.body.name.trim() : null;
      }
      if (req.body.email !== undefined) {
        updates.email = typeof req.body.email === "string" ? req.body.email.trim() || null : null;
      }
      if (req.body.phone !== undefined) {
        updates.phone = typeof req.body.phone === "string" ? req.body.phone.trim() : null;
      }
      if (req.body.city !== undefined) {
        updates.city = typeof req.body.city === "string" ? req.body.city.trim() || null : null;
      }
      if (req.body.state !== undefined) {
        updates.state = typeof req.body.state === "string" ? req.body.state.trim() || null : null;
      }
      if (req.body.isPhoneVerified !== undefined) {
        updates.isPhoneVerified = req.body.isPhoneVerified === true || req.body.isPhoneVerified === "true";
      }

      const updatedUser = await storage.updateAppUser(userId, updates);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating app user:", error);
      res.status(500).json({ message: "Failed to update app user" });
    }
  });

  // Delete app user
  app.delete('/api/admin/users/:id', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      // For app users, we can do a hard delete since they're just customers
      // But first check if they have orders - if so, we might want to soft delete
      // For now, let's do a hard delete
      await db.delete(appUsers).where(eq(appUsers.id, userId));
      res.json({ message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting app user:", error);
      res.status(500).json({ message: "Failed to delete app user" });
    }
  });

  // Toggle app user verification
  app.patch('/api/admin/users/:id/verification', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (Number.isNaN(userId)) {
        return res.status(400).json({ message: "Invalid user ID" });
      }

      const isPhoneVerified = req.body.isPhoneVerified === true || req.body.isPhoneVerified === "true";
      const updatedUser = await storage.updateAppUser(userId, { isPhoneVerified });
      res.json({ message: `User ${isPhoneVerified ? "verified" : "unverified"} successfully`, user: updatedUser });
    } catch (error) {
      console.error("Error updating app user verification:", error);
      res.status(500).json({ message: "Failed to update user verification" });
    }
  });

  app.delete('/api/admin/sessions', isAuthenticated, isAdmin, async (_req, res) => {
    try {
      const result = await pool.query("DELETE FROM sessions");
      res.json({
        success: true,
        message: "All sessions cleared successfully",
        clearedCount: result.rowCount ?? 0,
      });
    } catch (error) {
      console.error("Error clearing sessions:", error);
      res.status(500).json({ message: "Failed to clear sessions" });
    }
  });

  // ============================================
  // Admin Configuration Routes
  // ============================================
  
  // Get all configuration settings
  app.get('/api/admin/config', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const configs = await storage.getAllConfig();
      res.json(configs);
    } catch (error) {
      console.error("Error fetching config:", error);
      res.status(500).json({ message: "Failed to fetch configuration" });
    }
  });

  // Update configuration setting
  app.put('/api/admin/config', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const config = await storage.upsertConfig(req.body);
      res.json(config);
    } catch (error) {
      console.error("Error updating config:", error);
      res.status(500).json({ message: "Failed to update configuration" });
    }
  });

  // ============================================
  // Mobile App Authentication APIs
  // ============================================

  // Register new mobile app user
  app.post('/api/register', async (req, res) => {
    try {
      const { name, phone, email} = req.body;

      // Validate required fields
      if (!name || !phone) {
        return res.status(400).json({ message: "Name and phone are required" });
      }

      // Check if phone already exists
      const existing = await storage.getAppUserByPhone(phone);
      if (existing) {
        return res.status(409).json({ message: "Phone number already registered" });
      }

      // Create user (email & password optional)
      const user = await storage.createAppUser({
        name,
        phone,
        email: email || null,
        isPhoneVerified: false,
      });

      res.json({
        success: true,
        message: "Registration successful",
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
        },
      });
    } catch (error) {
      console.error("Registration error:", error);
      res.status(500).json({ message: "Registration failed" });
    }
  });

  app.post('/api/set-password', async (req, res) => {
    try {
      const { phone, password, confirm_password } = req.body;

      // Validate required fields
      if (!phone || !password || !confirm_password) {
        return res.status(400).json({ message: "Phone, password, and confirm_password are required" });
      }

      // Check if passwords match
      if (password !== confirm_password) {
        return res.status(400).json({ message: "Passwords do not match" });
      }

      // ✅ Step 1: Validate required fields
      if (!password || password.length < 4) {
        return res.status(400).json({
          message: "Password must be at least 4 characters long",
        });
      }

      // Find user by phone
      const user = await storage.getAppUserByPhone(phone);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check if user is verified
      if (!user.isPhoneVerified) {
        return res.status(403).json({ message: "User is not verified. Please verify your phone first." });
      }

      // Hash new password
      const bcrypt = await import('bcryptjs');
      const hashedPassword = await bcrypt.hash(password, 10);

      // Update user password
      const updatedUser = await storage.updateAppUser(user.id, {
        password: hashedPassword,
      });

      res.json({
        success: true,
        message: "Password set successfully",
        user: {
          id: updatedUser.id,
          name: updatedUser.name,
          phone: updatedUser.phone,
          email: updatedUser.email,
        },
      });
    } catch (error) {
      console.error("Set password error:", error);
      res.status(500).json({ message: "Failed to set password" });
    }
  });

  // Login with phone only (OTP will be sent)
  app.post('/api/login', async (req, res) => {
    try {
      const { phone, password } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      if(!password) {
        return res.status(400).json({ message: "Password is required" });
      }

      const user = await storage.getAppUserByPhone(phone);
      if (!user) {
        return res.status(401).json({ message: "User not found. Please register first." });
      }

      if (!user.password) {
        return res.status(401).json({ message: "Password is not set for this user" });
      }

      const bcrypt = await import('bcryptjs');

      const isMatch = await bcrypt.compare(password, user.password);

      if (isMatch) {
        // Generate JWT token for mobile authentication
        const token = generateToken(user.id);

        return res.json({
          success: true,
          token,
          user: { id: user.id, name: user.name, phone: user.phone, email: user.email, state: user.state, city:user.city },
        });
      } else {
        return res.status(401).json({ message: "Invalid password" });
      }

    } catch (error) {
      console.error("Login error:", error);
      res.status(500).json({ message: "Login error" });
    }
  });

  app.get('/api/user/profile', verifyMobileAuth, async (req: any, res) => {
    try {
      const userId = req.userId;
      const user = await storage.getAppUser(userId);

      if (!user) {
        return res.status(404).json({ message: 'User not found' });
      }

      res.json({
        success: true,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          email: user.email,
          state: user.state,
          city: user.city,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      console.error('Profile fetch error:', error);
      res.status(500).json({ message: 'Error fetching user profile' });
    }
  });

  // Verify OTP
  app.post('/api/verify-otp', async (req, res) => {
    try {
      const { phone, otp } = req.body;

      if (!phone || !otp) {
        return res.status(400).json({ message: "Phone and OTP are required" });
      }

      const verification = await storage.getValidOtp(phone, otp);
      if (!verification) {
        return res.status(401).json({ message: "Invalid or expired OTP" });
      }

      await storage.markOtpVerified(verification.id);

      const user = await storage.getAppUserByPhone(phone);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      if (!user.isPhoneVerified) {
        await storage.updateAppUser(user.id, { isPhoneVerified: true });
      }

      const token = generateToken(user.id);

      return res.json({
        success: true,
        message: "Phone number verified successfully",
        token,
        user: { id: user.id, name: user.name, phone: user.phone, email: user.email },
      });
    } catch (error) {
      console.error("OTP verification error:", error);
      res.status(500).json({ message: "Verification failed" });
    }
  });

  app.put('/api/app_user/update', verifyMobileAuth, async (req: any, res) => {
    try {
      const userId = req.userId!;
      const { name, email, phone, city, state } = req.body;

      if (!name && !email && !phone && !city && !state) {
        return res.status(400).json({ message: "At least one field is required to update." });
      }

      const updatedUser = await storage.updateAppUser(userId, {
        ...(name && { name }),
        ...(email && { email }),
        ...(phone && { phone }),
        ...(city && { city }),
        ...(state && { state }),
      });

      if (!updatedUser) {
        return res.status(404).json({ message: "User not found or update failed." });
      }

      res.json({
        status: true,
        message: "User updated successfully",
        user: updatedUser,
      });
    } catch (error: any) {
      console.error("Error updating user:", error);
      res.status(500).json({
        status: false,
        message: "Failed to update user",
        error: error.message,
      });
    }
  });

  // Send OTP
  app.post('/api/send-otp', async (req, res) => {
    try {
      const { phone } = req.body;

      if (!phone) {
        return res.status(400).json({ message: "Phone number is required" });
      }

      const twilioConfig = await storage.getConfig('twilio');
      let smsSent = false;
      // Initialize with default OTP
      let otp: string = process.env.DEFAULT_OTP || "123456";
      
      // Check if SMS service is available
      const smsAvailable = twilioConfig && twilioConfig.isEnabled;
      
      if (smsAvailable) {
        // Generate random OTP when SMS is available
        otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        try {
          const config = twilioConfig.value as any;
          const twilio = (await import('twilio')).default;
          const client = twilio(config.accountSid, config.authToken);
          
          await client.messages.create({
            body: `Your QuickBiteQR verification code is: ${otp}. Valid for 10 minutes.`,
            from: config.phoneNumber,
            to: phone,
          });
          smsSent = true;
          console.log(`SMS sent to ${phone}`);
        } catch (twilioError) {
          console.error("Twilio error:", twilioError);
          smsSent = false;
        }
      }
      
      // If SMS is not available or failed, use default OTP
      if (!smsSent) {
        // Use default OTP from environment variable or fallback to "123456"
        otp = process.env.DEFAULT_OTP || "123456";
        console.log(`[SMS NOT AVAILABLE] Using default OTP for ${phone}: ${otp}`);
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await storage.createOtp(phone, otp, expiresAt);

      res.json({
        success: true,
        message: "OTP sent successfully",
        ...(process.env.NODE_ENV === 'development' && { otp }),
      });
    } catch (error) {
      console.error("Send OTP error:", error);
      res.status(500).json({ message: "Failed to send OTP" });
    }
  });

  // ============================================
  // Address APIs (requires verifyMobileAuth)
  // ============================================

  // Create a new address
  app.post("/api/address/create", verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const userId = req.userId!;
      const {
        type,
        fullAddress,
        landmark,
        city,
        zipCode,
        latitude,
        longitude,
        lat,
        long,
        isDefault,
      } = req.body;

      if (!type || !fullAddress || !city || !zipCode) {
        return res.status(400).json({ message: "type, fullAddress, city, and zipCode are required" });
      }

      const address = await storage.createAddress({
        userId,
        type,
        fullAddress,
        landmark,
        city,
        zipCode,
        latitude: latitude ?? lat ?? null,
        longitude: longitude ?? long ?? null,
        isDefault: isDefault ?? false,
      });

      if (isDefault) {
        await storage.setDefaultAddress(userId, address.id);
      }

      res.json({ success: true, address });
    } catch (error) {
      console.error("Create address error:", error);
      res.status(500).json({ message: "Failed to create address" });
    }
  });

  // Get all addresses for logged-in user
  app.get("/api/address/list", verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const userId = req.userId!;
      const addresses = await storage.getUserAddresses(userId);
      res.json({ success: true, addresses });
    } catch (error) {
      console.error("List addresses error:", error);
      res.status(500).json({ message: "Failed to retrieve addresses" });
    }
  });

  // Update address
  app.put("/api/address/update/:id", verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const userId = req.userId!;
      const id = parseInt(req.params.id);
      const updates = req.body;

      // Verify ownership
      const existing = await storage.getAddress(id);
      if (!existing) return res.status(404).json({ message: "Address not found" });
      if (existing.userId !== userId) return res.status(403).json({ message: "Unauthorized" });

      const updated = await storage.updateAddress(id, updates);

      // If new address set as default
      if (updates.isDefault) {
        await storage.setDefaultAddress(userId, id);
      }

      res.json({ success: true, address: updated });
    } catch (error) {
      console.error("Update address error:", error);
      res.status(500).json({ message: "Failed to update address" });
    }
  });

  // Delete address
  app.delete("/api/address/delete/:id", verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const userId = req.userId!;
      const id = parseInt(req.params.id);

      const existing = await storage.getAddress(id);
      if (!existing) return res.status(404).json({ message: "Address not found" });
      if (existing.userId !== userId) return res.status(403).json({ message: "Unauthorized" });

      await storage.deleteAddress(id);
      res.json({ success: true, message: "Address deleted successfully" });
    } catch (error) {
      console.error("Delete address error:", error);
      res.status(500).json({ message: "Failed to delete address" });
    }
  });

  // Set address as default
  app.post("/api/address/set-default/:id", verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const userId = req.userId!;
      const id = parseInt(req.params.id);

      const existing = await storage.getAddress(id);
      if (!existing) return res.status(404).json({ message: "Address not found" });
      if (existing.userId !== userId) return res.status(403).json({ message: "Unauthorized" });

      await storage.setDefaultAddress(userId, id);
      res.json({ success: true, message: "Default address updated" });
    } catch (error) {
      console.error("Set default address error:", error);
      res.status(500).json({ message: "Failed to set default address" });
    }
  });

  // ============================================
  // Home Delivery APIs
  // ============================================

  // Get nearby restaurants
  app.get('/api/restaurants/nearby', async (req, res) => {
    try {
      const latitude = parseFloat(req.query.latitude as string);
      const longitude = parseFloat(req.query.longitude as string);

      if (isNaN(latitude) || isNaN(longitude)) {
        return res.status(400).json({ message: "Valid latitude and longitude are required" });
      }

      const vendors = await storage.getNearbyVendors(latitude, longitude);
      res.json(vendors);
    } catch (error) {
      console.error("Error fetching nearby restaurants:", error);
      res.status(500).json({ message: "Failed to fetch restaurants" });
    }
  });

  // Add to cart (with JWT authentication)
  app.post('/api/cart/add', verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const userId = req.userId!;
      const { item_id, quantity } = req.body;

      if (!item_id || !quantity) {
        return res.status(400).json({ message: "item_id and quantity are required" });
      }

      const item = await db.select().from(menuItems).where(eq(menuItems.id, item_id)).limit(1);
      if (!item.length) {
        return res.status(404).json({ message: "Menu item not found" });
      }

      const cartItem = await storage.addToCart({
        userId,
        vendorId: item[0].vendorId,
        itemId: item_id,
        quantity,
      });

      res.json({ success: true, cart_item: cartItem });
    } catch (error) {
      console.error("Add to cart error:", error);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });

  // Get cart items (with JWT authentication)
  app.get('/api/cart/get', verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const userId = req.userId!;
      const cart = await storage.getCart(userId);
      res.json({ success: true, items: cart });
    } catch (error) {
      console.error("Get cart error:", error);
      res.status(500).json({ message: "Failed to retrieve cart" });
    }
  });

  // Update cart item quantity (with JWT authentication and ownership validation)
  app.put('/api/cart/update/:itemId', verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const { quantity } = req.body;
      const userId = req.userId!;

      if (!quantity || quantity < 1) {
        return res.status(400).json({ message: "Valid quantity is required" });
      }

      // Verify ownership before updating
      const [existing] = await db
        .select()
        .from(cartItems)
        .where(eq(cartItems.id, itemId));

      if (!existing) {
        return res.status(404).json({ message: "Cart item not found" });
      }

      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized to modify this cart item" });
      }

      const [updated] = await db
        .update(cartItems)
        .set({ quantity })
        .where(eq(cartItems.id, itemId))
        .returning();

      res.json({ success: true, cart_item: updated });
    } catch (error) {
      console.error("Update cart error:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });

  // Remove cart item (with JWT authentication and ownership validation)
  app.delete('/api/cart/remove/:itemId', verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const itemId = parseInt(req.params.itemId);
      const userId = req.userId!;

      // Verify ownership before deleting
      const [existing] = await db
        .select()
        .from(cartItems)
        .where(eq(cartItems.id, itemId));

      if (!existing) {
        return res.status(404).json({ message: "Cart item not found" });
      }

      if (existing.userId !== userId) {
        return res.status(403).json({ message: "Unauthorized to delete this cart item" });
      }

      await db.delete(cartItems).where(eq(cartItems.id, itemId));
      res.json({ success: true, message: "Item removed from cart" });
    } catch (error) {
      console.error("Remove cart error:", error);
      res.status(500).json({ message: "Failed to remove cart item" });
    }
  });

  // Clear cart (with JWT authentication)
  app.delete('/api/cart/clear', verifyMobileAuth, async (req: MobileAuthRequest, res) => {
    try {
      const userId = req.userId!;
      await storage.clearCart(userId);
      res.json({ success: true, message: "Cart cleared successfully" });
    } catch (error) {
      console.error("Clear cart error:", error);
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });

  // Confirm delivery booking
  app.post('/api/booking/confirm', async (req, res) => {
    try {
      const { user_id, restaurant_id, items, total_amount, delivery_address, delivery_latitude, delivery_longitude, customer_notes } = req.body;

      if (!user_id || !restaurant_id || !items || !total_amount || !delivery_address) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const vendorId = Number(restaurant_id);
      if (!Number.isFinite(vendorId) || vendorId <= 0) {
        return res.status(400).json({ message: "Invalid restaurant_id" });
      }

      // Normalize items with GST based on vendor configuration
      const { items: normalizedItems, totalAmount } =
        await enrichOrderItemsWithGstForVendor(vendorId, items);

      const order = await storage.createDeliveryOrder({
        userId: user_id,
        vendorId,
        items: JSON.stringify(normalizedItems),
        totalAmount: toCurrencyString(totalAmount),
        deliveryAddress: delivery_address,
        deliveryLatitude: delivery_latitude?.toString(),
        deliveryLongitude: delivery_longitude?.toString(),
        customerNotes: customer_notes,
        status: 'pending',
      });

      await storage.clearCart(user_id);

      res.json({ success: true, order_id: order.id, message: "Order placed successfully" });
    } catch (error) {
      console.error("Booking error:", error);
      res.status(500).json({ message: "Failed to place order" });
    }
  });

  // Get delivery bookings for a user
  app.get('/api/booking/list', async (req, res) => {
    try {
      const userId = parseInt(req.query.user_id as string);

      if (!userId) {
        return res.status(400).json({ message: "user_id is required" });
      }

      const orders = await storage.getDeliveryOrders(userId);
      res.json({ success: true, orders });
    } catch (error) {
      console.error("Error fetching delivery orders:", error);
      res.status(500).json({ message: "Failed to fetch delivery orders" });
    }
  });

  // ============================================
  // Mobile API Routes (Dine-In via QR)
  // ============================================
  
  // Scan QR code to get vendor and table info
  app.post('/api/table/scan', async (req, res) => {
    try {
      const { qrData } = req.body;
      
      // Parse QR data (format: vendor:X:table:Y)
      const parts = qrData.split(':');
      if (parts.length !== 4 || parts[0] !== 'vendor' || parts[2] !== 'table') {
        return res.status(400).json({ message: "Invalid QR code format" });
      }

      const vendorId = parseInt(parts[1]);
      const tableNumber = parseInt(parts[3]);

      const vendor = await storage.getVendor(vendorId);
      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      res.json({
        vendorId: vendor.id,
        restaurantName: vendor.restaurantName,
        tableNumber,
      });
    } catch (error) {
      console.error("Error scanning QR code:", error);
      res.status(500).json({ message: "Failed to scan QR code" });
    }
  });

  // Enhanced: Scan QR code and get complete menu in one API call
  app.post('/api/table/scan-menu', async (req, res) => {
    try {
      const { qrData } = req.body;
      
      // Parse QR data (format: vendor:X:table:Y)
      const parts = qrData.split(':');
      if (parts.length !== 4 || parts[0] !== 'vendor' || parts[2] !== 'table') {
        return res.status(400).json({ message: "Invalid QR code format" });
      }

      const vendorId = parseInt(parts[1]);
      const tableNumber = parseInt(parts[3]);
      
      // Get table to verify it exists
      const allTables = await storage.getTables(vendorId);
      const table = allTables.find(t => t.tableNumber === tableNumber);
      
      if (!table) {
        return res.status(404).json({ message: "Table not found" });
      }

      // Get vendor info
      const vendor = await storage.getVendor(vendorId);
      if (!vendor) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      // Check if vendor is approved
      if (vendor.status !== 'approved') {
        return res.status(403).json({ message: "Restaurant is not currently accepting orders" });
      }

      // Get menu categories, items, and addons
      const [categories, items, addons] = await Promise.all([
        storage.getMenuCategories(vendorId),
        storage.getMenuItems(vendorId),
        storage.getMenuAddons(vendorId),
      ]);

      // Group items by category and filter only available items
      const categoriesWithItems = categories
        .filter(cat => cat.isActive)
        .map(category => ({
          id: category.id,
          name: category.name,
          description: category.description,
          displayOrder: category.displayOrder,
          items: items
            .filter(item => item.categoryId === category.id && item.isAvailable)
            .map(item => ({
              id: item.id,
              name: item.name,
              description: item.description,
              price: item.price,
              photo: item.photo,
              modifiers: item.modifiers,
              tags: item.tags,
              addons: addons.filter(addon => addon.itemId === item.id),
            })),
        }))
        .filter(cat => cat.items.length > 0); // Only include categories with available items

      res.json({
        success: true,
        table: {
          id: table.id,
          tableNumber: table.tableNumber,
        },
        restaurant: {
          id: vendor.id,
          restaurantName: vendor.restaurantName,
          address: vendor.address,
          cuisineType: vendor.cuisineType,
          description: vendor.description,
          image: vendor.image,
          rating: vendor.rating,
          reviewCount: vendor.reviewCount,
        },
        menu: categoriesWithItems,
      });
    } catch (error) {
      console.error("Error scanning QR code and fetching menu:", error);
      res.status(500).json({ message: "Failed to load restaurant menu" });
    }
  });

  // Helper function to calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in kilometers
  };

  const buildMenuResponse = async (vendorId: number, userLatitude?: number, userLongitude?: number) => {
    const vendor = await storage.getVendor(vendorId);
    if (!vendor) {
      return null;
    }

    const [categories, subcategories, items, addons] = await Promise.all([
      storage.getMenuCategories(vendorId),
      storage.getMenuSubcategories(vendorId),
      storage.getMenuItems(vendorId),
      storage.getMenuAddons(vendorId),
    ]);

    const availableItems = items.filter((item) => item.isAvailable);

    const addonMap = new Map<number, typeof addons>();
    for (const addon of addons) {
      const entry = addonMap.get(addon.itemId);
      if (entry) {
        entry.push(addon);
      } else {
        addonMap.set(addon.itemId, [addon]);
      }
    }

    const subcategoryNodes = new Map<
      number,
      {
        id: number;
        categoryId: number;
        name: string;
        description: string | null;
        displayOrder: number;
        isActive: boolean;
        createdAt: Date | null;
        updatedAt: Date | null;
        items: any[];
      }
    >();
    const subcategoriesByCategory = new Map<number, any[]>();

    for (const sub of subcategories) {
      const node = {
        id: sub.id,
        categoryId: sub.categoryId,
        name: sub.name,
        description: sub.description,
        displayOrder: sub.displayOrder,
        isActive: sub.isActive,
        createdAt: sub.createdAt,
        updatedAt: sub.updatedAt,
        items: [] as any[],
      };
      subcategoryNodes.set(sub.id, node);

      const list = subcategoriesByCategory.get(sub.categoryId);
      if (list) {
        list.push(node);
      } else {
        subcategoriesByCategory.set(sub.categoryId, [node]);
      }
    }

    const categoryItems = new Map<number, any[]>();

    for (const item of availableItems) {
      const itemPayload = {
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        photo: item.photo,
        modifiers: item.modifiers,
        tags: item.tags,
        isAvailable: item.isAvailable,
        displayOrder: item.displayOrder,
        subCategoryId: item.subCategoryId,
        addons: addonMap.get(item.id) ?? [],
        createdAt: item.createdAt,
        updatedAt: item.updatedAt,
      };

      if (item.subCategoryId) {
        const subNode = subcategoryNodes.get(item.subCategoryId);
        if (subNode) {
          subNode.items.push(itemPayload);
          continue;
        }
      }

      const list = categoryItems.get(item.categoryId);
      if (list) {
        list.push(itemPayload);
      } else {
        categoryItems.set(item.categoryId, [itemPayload]);
      }
    }

    // Build category payload with proper structure:
    // - items: items with no subcategory (directly under category)
    // - subcategories: subcategories containing items with subcategory
    const categoryPayload = categories
      .map((category) => {
        // Items without subcategory (directly under this category)
        const itemsForCategory = categoryItems.get(category.id) ?? [];
        itemsForCategory.sort((a, b) => a.displayOrder - b.displayOrder);

        // Subcategories for this category (with their items)
        const subsForCategory = subcategoriesByCategory.get(category.id) ?? [];
        // Sort items within each subcategory
        subsForCategory.forEach((sub) => {
          sub.items.sort((a: any, b: any) => a.displayOrder - b.displayOrder);
        });
        // Sort subcategories by display order
        subsForCategory.sort((a, b) => a.displayOrder - b.displayOrder);

        return {
          id: category.id,
          name: category.name,
          description: category.description,
          displayOrder: category.displayOrder,
          isActive: category.isActive,
          createdAt: category.createdAt,
          updatedAt: category.updatedAt,
          // GST details from category (used by client for correct pricing display)
          gst: {
            rate: category.gstRate != null ? Number(category.gstRate) : 0,
            mode: category.gstMode === "include" ? "include" : "exclude",
          },
          // Items with no subcategory (directly under category)
          items: itemsForCategory,
          // Subcategories containing items with subcategory
          subcategories: subsForCategory,
        };
      })
      .sort((a, b) => a.displayOrder - b.displayOrder);

    // Flat list of subcategories (for reference, but main structure is nested in categories)
    const subcategoryPayload = Array.from(subcategoryNodes.values()).map((sub) => ({
      id: sub.id,
      categoryId: sub.categoryId,
      name: sub.name,
      description: sub.description,
      displayOrder: sub.displayOrder,
      isActive: sub.isActive,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt,
      items: [...sub.items].sort((a: any, b: any) => a.displayOrder - b.displayOrder),
    }));

    // Flat list of all items (for reference/search purposes)
    const flatItemPayload = availableItems.map((item) => ({
      id: item.id,
      categoryId: item.categoryId,
      subCategoryId: item.subCategoryId,
      name: item.name,
      description: item.description,
      price: item.price,
      photo: item.photo,
      modifiers: item.modifiers,
      tags: item.tags,
      isAvailable: item.isAvailable,
      displayOrder: item.displayOrder,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      addons: addonMap.get(item.id) ?? [],
    }));

    // Calculate distance if user coordinates are provided
    let distance: number | null = null;
    let distanceFormatted: string | null = null;
    if (userLatitude && userLongitude && vendor.latitude && vendor.longitude) {
      const vendorLat = parseFloat(vendor.latitude as string);
      const vendorLon = parseFloat(vendor.longitude as string);
      distance = calculateDistance(userLatitude, userLongitude, vendorLat, vendorLon);
      
      // Format distance
      if (distance < 1) {
        distanceFormatted = `${Math.round(distance * 1000)}m`;
      } else {
        distanceFormatted = `${distance.toFixed(1)}km`;
      }
    }

    // Build organized response
    return {
      success: true,
      restaurant: {
        id: vendor.id,
        restaurantName: vendor.restaurantName,
        address: vendor.address,
        description: vendor.description,
        cuisineType: vendor.cuisineType,
        phone: vendor.phone,
        gstin: vendor.gstin,
        image: vendor.image,
        rating: vendor.rating ? parseFloat(vendor.rating as string) : 0,
        reviewCount: vendor.reviewCount || 0,
        status: vendor.status,
        location: {
          latitude: vendor.latitude ? parseFloat(vendor.latitude as string) : null,
          longitude: vendor.longitude ? parseFloat(vendor.longitude as string) : null,
        },
        services: {
          isDeliveryEnabled: vendor.isDeliveryEnabled,
          isPickupEnabled: vendor.isPickupEnabled,
          isDeliveryAllowed: vendor.isDeliveryAllowed,
          isPickupAllowed: vendor.isPickupAllowed,
        },
        payment: {
          paymentQrCodeUrl: vendor.paymentQrCodeUrl,
        },
        distance: distance ? {
          kilometers: parseFloat(distance.toFixed(2)),
          formatted: distanceFormatted,
        } : null,
        metadata: {
          createdAt: vendor.createdAt,
          updatedAt: vendor.updatedAt,
        },
      },
      menu: {
        // Main menu structure: categories containing items (no subcategory) and subcategories (with items)
        categories: categoryPayload,
        // Summary statistics
        summary: {
          totalCategories: categoryPayload.length,
          totalSubcategories: subcategoryPayload.length,
          totalItems: flatItemPayload.length,
          totalAddons: addons.length,
          availableItems: flatItemPayload.length,
        },
      },
      generatedAt: new Date().toISOString(),
    };
  };

  // Get restaurant menu by vendor ID
  app.get('/api/restaurants/:vendorId/menu', async (req, res) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      
      // Optional query parameters for distance calculation
      const userLatitude = req.query.latitude ? parseFloat(req.query.latitude as string) : undefined;
      const userLongitude = req.query.longitude ? parseFloat(req.query.longitude as string) : undefined;
      
      // Validate coordinates if provided
      if ((userLatitude !== undefined && isNaN(userLatitude)) || 
          (userLongitude !== undefined && isNaN(userLongitude))) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid latitude or longitude values" 
        });
      }
      
      const payload = await buildMenuResponse(vendorId, userLatitude, userLongitude);

      if (!payload) {
        return res.status(404).json({ 
          success: false,
          message: "Restaurant not found" 
        });
      }

      res.json(payload);
    } catch (error) {
      console.error("Error fetching menu:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to fetch menu" 
      });
    }
  });

  // Alias for consistency with mobile app documentation
  app.get('/restaurants/:restaurant_id/menu', async (req, res) => {
    try {
      const vendorId = parseInt(req.params.restaurant_id);
      
      // Optional query parameters for distance calculation
      const userLatitude = req.query.latitude ? parseFloat(req.query.latitude as string) : undefined;
      const userLongitude = req.query.longitude ? parseFloat(req.query.longitude as string) : undefined;
      
      // Validate coordinates if provided
      if ((userLatitude !== undefined && isNaN(userLatitude)) || 
          (userLongitude !== undefined && isNaN(userLongitude))) {
        return res.status(400).json({ 
          success: false,
          message: "Invalid latitude or longitude values" 
        });
      }
      
      const payload = await buildMenuResponse(vendorId, userLatitude, userLongitude);

      if (!payload) {
        return res.status(404).json({ 
          success: false,
          message: "Restaurant not found" 
        });
      }

      res.json(payload);
    } catch (error) {
      console.error("Error fetching menu:", error);
      res.status(500).json({ 
        success: false,
        message: "Failed to fetch menu" 
      });
    }
  });

  // Place dine-in order
  app.post('/api/dinein/order', async (req, res) => {
    try {
      const validatedData = insertOrderSchema.parse(req.body);
      const order = await storage.createOrder(validatedData);
      await handleOrderPostCreation(order.id);
      res.json(order);
    } catch (error: any) {
      console.error("Error creating order:", error);
      res.status(400).json({ message: error.message || "Failed to create order" });
    }
  });

  // Get dine-in order history
  app.get('/api/dinein/orders', async (req, res) => {
    try {
      let phone = req.query.phone as string;

      if (!phone) {
        return res.status(400).json({ message: "phone is required" });
      }

      // Handle URL encoding: + in URLs is often interpreted as space, so we need to handle both
      // First decode any %2B (encoded +), then replace spaces with + if they appear at the start
      phone = decodeURIComponent(phone.trim());
      
      // If the phone starts with a space (because + was converted to space), replace it
      // This handles the case where curl sends +1234567890 and it becomes " 1234567890"
      if (phone.startsWith(' ') && phone.length > 1) {
        phone = '+' + phone.trim();
      }
      
      console.log(`[DEBUG] Raw query param: "${req.query.phone}"`);
      console.log(`[DEBUG] After decodeURIComponent: "${phone}"`);
      console.log(`[DEBUG] Searching for orders with phone: "${phone}"`);

      const orders = await storage.getDineInOrdersByPhone(phone);
      
      console.log(`[DEBUG] Found ${orders.length} orders for phone: "${phone}"`);
      if (orders.length > 0) {
        console.log(`[DEBUG] Sample order customerPhone: "${orders[0].customerPhone}"`);
      }
      
      res.json(orders);
    } catch (error) {
      console.error("Error fetching dine-in orders:", error);
      res.status(500).json({ message: "Failed to fetch dine-in orders" });
    }
  });

  // ============================================
  // Mobile API Routes (Pickup Orders)
  // ============================================
  
  // Place pickup order
  app.post('/api/pickup/order', async (req, res) => {
    try {
      const { user_id, restaurant_id, items, total_amount, customer_phone, pickup_time, customer_notes } = req.body;

      if (!user_id || !restaurant_id || !items || !total_amount) {
        return res.status(400).json({ message: "Missing required fields" });
      }

      const vendorId = Number(restaurant_id);
      if (!Number.isFinite(vendorId) || vendorId <= 0) {
        return res.status(400).json({ message: "Invalid restaurant_id" });
      }

      // Validate vendor has pickup enabled
      const vendor = await storage.getVendor(vendorId);
      if (!vendor) {
        return res.status(404).json({ message: "Restaurant not found" });
      }
      if (!vendor.isPickupEnabled) {
        return res.status(403).json({ message: "Pickup service is not available for this restaurant" });
      }

      // Generate pickup reference (e.g., PICKUP-001)
      const existingPickupOrders = await storage.getVendorPickupOrders(vendorId);
      const pickupReference = `PICKUP-${String(existingPickupOrders.length + 1).padStart(3, '0')}`;

      // Normalize items with GST based on vendor configuration
      const { items: normalizedItems, totalAmount } =
        await enrichOrderItemsWithGstForVendor(vendorId, items);

      const order = await storage.createPickupOrder({
        userId: user_id,
        vendorId,
        items: JSON.stringify(normalizedItems),
        totalAmount: toCurrencyString(totalAmount),
        customerPhone: customer_phone || null,
        pickupReference: pickupReference,
        pickupTime: pickup_time ? new Date(pickup_time) : null,
        customerNotes: customer_notes || null,
        status: 'pending',
      });

      await storage.clearCart(user_id);

      res.json({ success: true, order_id: order.id, pickup_reference: pickupReference, message: "Pickup order placed successfully" });
    } catch (error: any) {
      console.error("Pickup order error:", error);
      res.status(500).json({ message: error.message || "Failed to place pickup order" });
    }
  });

  // Get pickup orders for a user
  app.get('/api/pickup/orders', async (req, res) => {
    try {
      const userId = parseInt(req.query.user_id as string);

      if (!userId) {
        return res.status(400).json({ message: "user_id is required" });
      }

      const orders = await storage.getPickupOrders(userId);
      res.json({ success: true, orders });
    } catch (error) {
      console.error("Error fetching pickup orders:", error);
      res.status(500).json({ message: "Failed to fetch pickup orders" });
    }
  });

  // ============================================
  // Order Details & Thermal Printing APIs
  // ============================================

  // Get order details with full item information (for Vendor & Captain)
  app.get('/api/order/:orderId/details', isAuthenticated, async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get vendor, table information
      const vendor = await storage.getVendor(order.vendorId);
      const table = await storage.getTable(order.tableId);
      const kotTicket = await storage.getKotByOrderId(order.id);

      res.json({
        order: {
          id: order.id,
          status: order.status,
          totalAmount: order.totalAmount,
          customerName: order.customerName,
          customerPhone: order.customerPhone,
          customerNotes: order.customerNotes,
          vendorNotes: order.vendorNotes,
          createdAt: order.createdAt,
          acceptedAt: order.acceptedAt,
          preparingAt: order.preparingAt,
          readyAt: order.readyAt,
          deliveredAt: order.deliveredAt,
        },
        restaurant: {
          id: vendor?.id,
          name: vendor?.restaurantName,
          address: vendor?.address,
          phone: vendor?.phone,
        },
        table: {
          id: table?.id,
          tableNumber: table?.tableNumber,
        },
        items: order.items, // All order items with quantities, prices, modifiers
        kotTicket: kotTicket ?? null,
      });
    } catch (error) {
      console.error("Error fetching order details:", error);
      res.status(500).json({ message: "Failed to fetch order details" });
    }
  });

  // Get thermal printer formatted receipt
  app.get('/api/order/:orderId/receipt', isAuthenticated, async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      // Get vendor and table information
      const vendor = await storage.getVendor(order.vendorId);
      const table = await storage.getTable(order.tableId);

      // Format receipt for thermal printer (48 characters wide)
      const line = "================================================";
      const centerText = (text: string) => {
        const padding = Math.floor((48 - text.length) / 2);
        return " ".repeat(padding) + text;
      };

      let receipt = "";
      receipt += line + "\n";
      receipt += centerText(vendor?.restaurantName || "Restaurant") + "\n";
      receipt += centerText(vendor?.address || "") + "\n";
      receipt += centerText(`Phone: ${vendor?.phone || ""}`) + "\n";
      receipt += line + "\n";
      receipt += centerText(`ORDER #${order.id}`) + "\n";
      receipt += centerText(`Table: ${table?.tableNumber}`) + "\n";
      receipt += centerText(new Date(order.createdAt || new Date()).toLocaleString()) + "\n";
      receipt += line + "\n";
      
      // Customer info
      if (order.customerName || order.customerPhone) {
        receipt += "Customer Information:\n";
        if (order.customerName) receipt += `  Name: ${order.customerName}\n`;
        if (order.customerPhone) receipt += `  Phone: ${order.customerPhone}\n`;
        receipt += line + "\n";
      }

      // Items
      receipt += "ITEMS:\n";
      receipt += line + "\n";
      
      const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
      let itemTotal = 0;
      
      if (Array.isArray(items)) {
        items.forEach((item: any, index: number) => {
          receipt += `${index + 1}. ${item.name}\n`;
          receipt += `   Qty: ${item.quantity} x ${item.price}\n`;
          
          // Show modifiers if present
          if (item.modifiers) {
            receipt += `   Modifiers: ${JSON.stringify(item.modifiers)}\n`;
          }
          
          receipt += `   Subtotal: Rs. ${item.subtotal || (item.quantity * parseFloat(item.price))}\n`;
          receipt += "\n";
          
          itemTotal += parseFloat(item.subtotal || (item.quantity * parseFloat(item.price)));
        });
      }
      
      receipt += line + "\n";
      receipt += `TOTAL: Rs. ${order.totalAmount}`.padStart(48) + "\n";
      receipt += line + "\n";
      
      // Customer notes
      if (order.customerNotes) {
        receipt += "Customer Notes:\n";
        receipt += `${order.customerNotes}\n`;
        receipt += line + "\n";
      }
      
      // Order status
      receipt += `Status: ${order.status.toUpperCase()}\n`;
      receipt += line + "\n";
      receipt += centerText("Thank you for your order!") + "\n";
      receipt += line + "\n";

      res.json({
        orderId: order.id,
        receipt: receipt,
        plainText: receipt, // Same as receipt, for compatibility
      });
    } catch (error) {
      console.error("Error generating receipt:", error);
      res.status(500).json({ message: "Failed to generate receipt" });
    }
  });

  // Get thermal printer plain text (for direct printing)
  app.get('/api/order/:orderId/print', isAuthenticated, async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const order = await storage.getOrder(orderId);
      
      if (!order) {
        return res.status(404).json({ message: "Order not found" });
      }

      const vendor = await storage.getVendor(order.vendorId);
      const table = await storage.getTable(order.tableId);

      const line = "================================================";
      const centerText = (text: string) => {
        const padding = Math.floor((48 - text.length) / 2);
        return " ".repeat(padding) + text;
      };

      let receipt = "";
      receipt += line + "\n";
      receipt += centerText(vendor?.restaurantName || "Restaurant") + "\n";
      receipt += centerText(vendor?.address || "") + "\n";
      receipt += centerText(`Phone: ${vendor?.phone || ""}`) + "\n";
      receipt += line + "\n";
      receipt += centerText(`ORDER #${order.id}`) + "\n";
      receipt += centerText(`Table: ${table?.tableNumber}`) + "\n";
      receipt += centerText(new Date(order.createdAt || new Date()).toLocaleString()) + "\n";
      receipt += line + "\n";
      
      if (order.customerName || order.customerPhone) {
        receipt += "Customer Information:\n";
        if (order.customerName) receipt += `  Name: ${order.customerName}\n`;
        if (order.customerPhone) receipt += `  Phone: ${order.customerPhone}\n`;
        receipt += line + "\n";
      }

      receipt += "ITEMS:\n";
      receipt += line + "\n";
      
      const items = typeof order.items === 'string' ? JSON.parse(order.items) : order.items;
      
      if (Array.isArray(items)) {
        items.forEach((item: any, index: number) => {
          receipt += `${index + 1}. ${item.name}\n`;
          receipt += `   Qty: ${item.quantity} x Rs. ${item.price}\n`;
          
          if (item.modifiers) {
            receipt += `   Modifiers: ${JSON.stringify(item.modifiers)}\n`;
          }
          
          receipt += `   Subtotal: Rs. ${item.subtotal || (item.quantity * parseFloat(item.price))}\n`;
          receipt += "\n";
        });
      }
      
      receipt += line + "\n";
      receipt += `TOTAL: Rs. ${order.totalAmount}`.padStart(48) + "\n";
      receipt += line + "\n";
      
      if (order.customerNotes) {
        receipt += "Customer Notes:\n";
        receipt += `${order.customerNotes}\n`;
        receipt += line + "\n";
      }
      
      receipt += `Status: ${order.status.toUpperCase()}\n`;
      receipt += line + "\n";
      receipt += centerText("Thank you for your order!") + "\n";
      receipt += line + "\n";

      // Return as plain text for direct printing
      res.setHeader('Content-Type', 'text/plain');
      res.send(receipt);
    } catch (error) {
      console.error("Error generating print receipt:", error);
      res.status(500).json({ message: "Failed to generate receipt" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
