// Multi-Vendor QR Ordering Platform API Routes
import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, isVendor, isCaptain, isAdmin } from "./replitAuth";
import { z } from "zod";
import { insertVendorSchema, insertTableSchema, insertCaptainSchema, insertMenuCategorySchema, insertMenuSubcategorySchema, insertMenuItemSchema, insertOrderSchema, menuItems, cartItems, appUsers, type InsertMenuAddon } from "@shared/schema";
import { db } from "./db";
import { eq, desc } from "drizzle-orm";
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

const updateVendorProfileSchema = z.object({
  restaurantName: z.string().min(2).max(255).optional(),
  address: z.string().max(1000).optional(),
  description: z.string().max(2000).optional(),
  cuisineType: z.string().max(100).optional(),
  phone: z.string().max(50).optional(),
  cnic: z.string().max(50).optional(),
  image: z.string().min(1).max(500).optional(),
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

  // Vendor stats
  app.get('/api/vendor/stats', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);
      
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

  // Vendor profile
  app.get('/api/vendor/profile', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const user = await storage.getUser(userId);
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

  app.put('/api/vendor/profile', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

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
        "image",
        "fullName",
        "phoneNumber",
      ] as const;

      simpleFields.forEach((field) => {
        if (body[field] !== undefined) {
          normalized[field] = body[field];
        }
      });

      if (body.isDeliveryEnabled !== undefined) {
        const parsed = parseBoolean(body.isDeliveryEnabled);
        if (parsed === undefined) {
          return res.status(400).json({ message: "Invalid value for isDeliveryEnabled" });
        }
        normalized.isDeliveryEnabled = parsed;
      }

      if (body.isPickupEnabled !== undefined) {
        const parsed = parseBoolean(body.isPickupEnabled);
        if (parsed === undefined) {
          return res.status(400).json({ message: "Invalid value for isPickupEnabled" });
        }
        normalized.isPickupEnabled = parsed;
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
        "image",
        "isDeliveryEnabled",
        "isPickupEnabled",
      ] as const;

      vendorFields.forEach((field) => {
        if (validated[field] !== undefined) {
          vendorUpdates[field] = validated[field];
        }
      });

      if (Object.keys(vendorUpdates).length > 0) {
        await storage.updateVendor(vendor.id, vendorUpdates as any);
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

      const updatedVendor = await storage.getVendor(vendor.id);
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
      res.json(tables);
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
      const startNumber = existingTables.length;
      const createdTables = [];

      // Create tables sequentially
      for (let i = 0; i < count; i++) {
        const tableNumber = startNumber + i;
        const table = await storage.createTable(vendor.id, tableNumber);
        createdTables.push(table);
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

      const table = await storage.createTable(vendor.id, parseInt(tableNumber));
      res.json({ message: "Manual table created successfully", table });
    } catch (error) {
      console.error("Error creating manual table:", error);
      res.status(500).json({ message: "Failed to create manual table" });
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

      const validatedData = insertMenuCategorySchema.parse({
        ...req.body,
        vendorId: vendor.id,
      });

      const category = await storage.createMenuCategory(validatedData);
      res.json(category);
    } catch (error: any) {
      console.error("Error creating category:", error);
      res.status(400).json({ message: error.message || "Failed to create category" });
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

        const [items, addons] = await Promise.all([
          storage.getMenuItems(vendor.id),
          storage.getMenuAddons(vendor.id),
        ]);
        const itemsWithAddons = items.map((item) => ({
          ...item,
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
  
  // Get vendor orders with vendor details
  app.get('/api/vendor/orders', isAuthenticated, isVendor, async (req: any, res) => {
    try {
      const userId = req.user.claims.sub;
      const vendor = await storage.getVendorByUserId(userId);

      if (!vendor) {
        return res.status(404).json({ message: "Vendor not found" });
      }

      const orders = await storage.getOrders(vendor.id);

      const vendorUser = await storage.getUser(vendor.userId);

      // Attach vendor details to each order
      const ordersWithVendor = orders.map((order: any) => ({
        ...order,
        vendorDetails: {
          name: vendor.restaurantName,
          address: vendor.address,
          phone: vendor.phone,
          email: vendorUser?.email ?? null,
        },
      }));

      res.json(ordersWithVendor);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });

  // Update order status
  app.put('/api/vendor/orders/:orderId/status', isAuthenticated, isVendor, async (req, res) => {
    try {
      const orderId = parseInt(req.params.orderId);
      const { status } = req.body;

      const order = await storage.updateOrderStatus(orderId, status);
      
      // Send notifications (SMS and Push) for order status updates
      try {
        if (order.customerPhone) {
          const vendor = await storage.getVendor(order.vendorId);
          if (vendor) {
            // Send SMS notification (non-blocking, don't fail request if notification fails)
            notificationService.sendOrderNotification(
              order.customerPhone,
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
    } catch (error) {
      console.error("Error updating order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });

  // ============================================
  // Captain Routes
  // ============================================
  
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

  // Get all mobile app users
  app.get('/api/admin/users', isAuthenticated, isAdmin, async (req, res) => {
    try {
      const users = await db.select().from(appUsers).orderBy(desc(appUsers.createdAt));
      res.json(users);
    } catch (error) {
      console.error("Error fetching app users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
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
      const { name, phone, email, password, confirm_password } = req.body;

      // Validate required fields
      if (!name || !phone) {
        return res.status(400).json({ message: "Name and phone are required" });
      }

      // If password is provided, check confirmation
      if (password && password !== confirm_password) {
        return res.status(400).json({ message: "Passwords do not match" });
      }

      // ✅ Step 1: Validate required fields
      if (!password || password.length < 4) {
        return res.status(400).json({
          message: "Password must be at least 4 characters long",
        });
      }

      // Check if phone already exists
      const existing = await storage.getAppUserByPhone(phone);
      if (existing) {
        return res.status(409).json({ message: "Phone number already registered" });
      }

      let hashedPassword = null;

      // Hash password only if provided
      if (password) {
        const bcrypt = await import('bcryptjs');
        hashedPassword = await bcrypt.hash(password, 10);
      }

      // Create user (email & password optional)
      const user = await storage.createAppUser({
        name,
        phone,
        email: email || null,
        password: hashedPassword,
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

      const order = await storage.createDeliveryOrder({
        userId: user_id,
        vendorId: restaurant_id,
        items: JSON.stringify(items),
        totalAmount: total_amount.toString(),
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

  // Get restaurant menu by vendor ID
  app.get('/api/restaurants/:vendorId/menu', async (req, res) => {
    try {
      const vendorId = parseInt(req.params.vendorId);
      
      const vendor = await storage.getVendor(vendorId);
      if (!vendor) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const [categories, items, addons] = await Promise.all([
        storage.getMenuCategories(vendorId),
        storage.getMenuItems(vendorId),
        storage.getMenuAddons(vendorId),
      ]);

      // Group items by category
      const categoriesWithItems = categories.map(category => ({
        ...category,
        items: items
          .filter(item => item.categoryId === category.id && item.isAvailable)
          .map(item => ({
            ...item,
            addons: addons.filter(addon => addon.itemId === item.id),
          })),
      }));

      res.json({
        restaurant: {
          id: vendor.id,
          restaurantName: vendor.restaurantName,
          address: vendor.address,
          cuisineType: vendor.cuisineType,
        },
        categories: categoriesWithItems,
      });
    } catch (error) {
      console.error("Error fetching menu:", error);
      res.status(500).json({ message: "Failed to fetch menu" });
    }
  });

  // Alias for consistency with mobile app documentation
  app.get('/restaurants/:restaurant_id/menu', async (req, res) => {
    try {
      const vendorId = parseInt(req.params.restaurant_id);
      
      const vendor = await storage.getVendor(vendorId);
      if (!vendor) {
        return res.status(404).json({ message: "Restaurant not found" });
      }

      const [categories, items, addons] = await Promise.all([
        storage.getMenuCategories(vendorId),
        storage.getMenuItems(vendorId),
        storage.getMenuAddons(vendorId),
      ]);

      // Group items by category
      const categoriesWithItems = categories.map(category => ({
        ...category,
        items: items
          .filter(item => item.categoryId === category.id && item.isAvailable)
          .map(item => ({
            ...item,
            addons: addons.filter(addon => addon.itemId === item.id),
          })),
      }));

      res.json({
        restaurant: {
          id: vendor.id,
          restaurantName: vendor.restaurantName,
          address: vendor.address,
          cuisineType: vendor.cuisineType,
        },
        categories: categoriesWithItems,
      });
    } catch (error) {
      console.error("Error fetching menu:", error);
      res.status(500).json({ message: "Failed to fetch menu" });
    }
  });

  // Place dine-in order
  app.post('/api/dinein/order', async (req, res) => {
    try {
      const validatedData = insertOrderSchema.parse(req.body);
      const order = await storage.createOrder(validatedData);
      
      // Get full order details for notification
      const fullOrder = await storage.getOrder(order.id);
      if (fullOrder) {
        // Get vendor and table details
        const vendor = await storage.getVendor(fullOrder.vendorId);
        const table = await storage.getTable(fullOrder.tableId);
        
        // Send notification to vendor (optional - SMS/Push)
        if (vendor && fullOrder.customerPhone) {
          notificationService.sendOrderNotification(
            fullOrder.customerPhone,
            'pending',
            vendor.restaurantName
          ).catch((err: any) => console.error('Failed to send order notification:', err));
        }
        
        console.log(`New order #${order.id} received at Table ${table?.tableNumber} for ${vendor?.restaurantName}`);
      }
      
      res.json(order);
    } catch (error: any) {
      console.error("Error creating order:", error);
      res.status(400).json({ message: error.message || "Failed to create order" });
    }
  });

  // Get dine-in order history
  app.get('/api/dinein/orders', async (req, res) => {
    try {
      const phone = req.query.phone as string;

      if (!phone) {
        return res.status(400).json({ message: "phone is required" });
      }

      const orders = await storage.getDineInOrdersByPhone(phone);
      res.json(orders);
    } catch (error) {
      console.error("Error fetching dine-in orders:", error);
      res.status(500).json({ message: "Failed to fetch dine-in orders" });
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
