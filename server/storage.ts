// Reference: javascript_database and javascript_log_in_with_replit blueprints
import {
  users,
  vendors,
  tables,
  captains,
  menuCategories,
  menuItems,
  orders,
  adminConfig,
  appUsers,
  otpVerifications,
  cartItems,
  deliveryOrders,
  menuSubcategories,
  type User,
  type UpsertUser,
  type Vendor,
  type InsertVendor,
  type Table,
  type InsertTable,
  type Captain,
  type InsertCaptain,
  type MenuCategory,
  type InsertMenuCategory,
  type MenuItem,
  type MenuAddon,
  type InsertMenuAddon,
  type InsertMenuItem,
  type Order,
  type InsertOrder,
  type AdminConfig,
  type InsertAdminConfig,
  type AppUser,
  type InsertAppUser,
  type OtpVerification,
  type CartItem,
  type InsertCartItem,
  type DeliveryOrder,
  type InsertDeliveryOrder,
  type InsertMenuSubcategory,
  type MenuSubcategory,
  menuAddons,
} from "@shared/schema";
import { addresses, type Address, type InsertAddress } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, inArray } from "drizzle-orm";
import bcrypt from "bcrypt";

const ACTIVE_TABLE_LOCK_STATUSES = ["pending", "accepted", "preparing", "ready"] as const;

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User>;
  
  // Vendor operations
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  getVendor(id: number): Promise<Vendor | undefined>;
  getVendorByUserId(userId: string): Promise<Vendor | undefined>;
  getAllVendors(): Promise<Vendor[]>;
  getPendingVendors(): Promise<Vendor[]>;
  updateVendorStatus(id: number, status: string, rejectionReason?: string, approvedBy?: string): Promise<Vendor>;
  updateVendor(id: number, updates: Partial<InsertVendor>): Promise<Vendor>;
  
  // Table operations
  createTable(vendorId: number, tableNumber: number): Promise<Table>;
  getTables(vendorId: number): Promise<Table[]>;
  getTable(id: number): Promise<Table | undefined>;
  assignCaptain(tableId: number, captainId: number | null): Promise<Table>;
  
  // Captain operations
  createCaptain(captain: InsertCaptain): Promise<Captain>;
  getCaptains(vendorId: number): Promise<Captain[]>;
  getCaptain(id: number): Promise<Captain | undefined>;
  getCaptainByUsername(username: string): Promise<Captain | undefined>;
  getCaptainByUserId(userId: string): Promise<Captain | undefined>;
  deleteCaptain(id: number): Promise<void>;
  getCaptainTables(captainId: number): Promise<any[]>;
  
  // Menu operations
  createMenuCategory(category: InsertMenuCategory): Promise<MenuCategory>;
  getMenuCategories(vendorId: number): Promise<MenuCategory[]>;
  createMenuItem(item: InsertMenuItem): Promise<MenuItem>;
  getMenuItems(vendorId: number): Promise<MenuItem[]>;
  updateMenuItemAvailability(id: number, isAvailable: boolean): Promise<MenuItem>;

  // addonoperations
  createMenuAddon(addon: InsertMenuAddon): Promise<MenuAddon>;
  getMenuAddons(vendorId: number): Promise<MenuAddon[]>;
  getMenuAddon(id: number): Promise<MenuAddon | undefined>;
  updateMenuAddon(id: number, vendorId: number, updates: Partial<InsertMenuAddon>): Promise<MenuAddon>;
  deleteMenuAddon(id: number, vendorId: number): Promise<void>;

  // Subcategory operations
  createMenuSubcategory(data: InsertMenuSubcategory): Promise<MenuSubcategory>;
  getMenuSubcategories(vendorId: number): Promise<MenuSubcategory[]>;
  getMenuSubcategoriesByCategory(categoryId: number): Promise<MenuSubcategory[]>;
  updateMenuSubcategory(id: number, updates: Partial<InsertMenuSubcategory>): Promise<MenuSubcategory>;
  deleteMenuSubcategory(id: number): Promise<void>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  getOrders(vendorId: number): Promise<Order[]>;
  getOrder(id: number): Promise<Order | undefined>;
  getDineInOrdersByPhone(phone: string): Promise<Order[]>;
  updateOrderStatus(id: number, status: string): Promise<Order>;
  
  // Admin stats
  getVendorStats(vendorId: number): Promise<any>;
  getAdminStats(): Promise<any>;
  
  // Admin config operations
  getConfig(key: string): Promise<AdminConfig | undefined>;
  getAllConfig(): Promise<AdminConfig[]>;
  upsertConfig(config: InsertAdminConfig): Promise<AdminConfig>;
  deleteConfig(key: string): Promise<void>;
  
  // Mobile App User operations
  createAppUser(user: InsertAppUser): Promise<AppUser>;
  getAppUser(id: number): Promise<AppUser | undefined>;
  getAppUserByPhone(phone: string): Promise<AppUser | undefined>;
  updateAppUser(id: number, updates: Partial<InsertAppUser>): Promise<AppUser>;
  
  // OTP operations
  createOtp(phone: string, otp: string, expiresAt: Date): Promise<OtpVerification>;
  getValidOtp(phone: string, otp: string): Promise<OtpVerification | undefined>;
  markOtpVerified(id: number): Promise<void>;
  
  // Cart operations
  addToCart(item: InsertCartItem): Promise<CartItem>;
  getCart(userId: number): Promise<any[]>;
  clearCart(userId: number): Promise<void>;

    // Address operations
  createAddress(address: InsertAddress): Promise<Address>;
  getUserAddresses(userId: number): Promise<Address[]>;
  getAddress(id: number): Promise<Address | undefined>;
  updateAddress(id: number, updates: Partial<InsertAddress>): Promise<Address>;
  deleteAddress(id: number): Promise<void>;
  setDefaultAddress(userId: number, addressId: number): Promise<void>;
  
  // Delivery Order operations
  createDeliveryOrder(order: InsertDeliveryOrder): Promise<DeliveryOrder>;
  getDeliveryOrders(userId: number): Promise<DeliveryOrder[]>;
  updateDeliveryOrderStatus(id: number, status: string): Promise<DeliveryOrder>;
  
  // Public API operations
  getNearbyVendors(latitude: number, longitude: number, radiusKm?: number): Promise<Vendor[]>;
  getVendorMenu(vendorId: number): Promise<any>;
}

export class DatabaseStorage implements IStorage {
  private async lockTable(tableId: number): Promise<void> {
    await db
      .update(tables)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(tables.id, tableId));
  }

  private async refreshTableAvailability(tableId: number): Promise<void> {
    const openOrder = await db
      .select({ id: orders.id })
      .from(orders)
      .where(
        and(
          eq(orders.tableId, tableId),
          inArray(orders.status, [...ACTIVE_TABLE_LOCK_STATUSES] as string[]),
        ),
      )
      .limit(1);

    const isActive = openOrder.length === 0;

    await db
      .update(tables)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(tables.id, tableId));
  }

  // User operations (required for Replit Auth)
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<UpsertUser>): Promise<User> {
    const { id: _ignoreId, ...rest } = updates;
    const [user] = await db
      .update(users)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(users.id, id))
      .returning();
    return user;
  }

  // Vendor operations
  async createVendor(vendor: InsertVendor): Promise<Vendor> {
    const [newVendor] = await db
      .insert(vendors)
      .values(vendor)
      .returning();
    return newVendor;
  }

  async getVendor(id: number): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.id, id));
    return vendor;
  }

  async updateVendor(id: number, updates: Partial<InsertVendor>): Promise<Vendor> {
    const { userId: _ignore, id: _ignoreId, createdAt: _ignoreCreated, approvedAt: _ignoreApproved, approvedBy: _ignoreApprovedBy, ...rest } = updates as any;
    const [vendor] = await db
      .update(vendors)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(vendors.id, id))
      .returning();
    return vendor;
  }

  async getVendorByUserId(userId: string): Promise<Vendor | undefined> {
    const [vendor] = await db.select().from(vendors).where(eq(vendors.userId, userId));
    return vendor;
  }

  async getAllVendors(): Promise<Vendor[]> {
    return await db.select().from(vendors).orderBy(desc(vendors.createdAt));
  }

  async getPendingVendors(): Promise<Vendor[]> {
    return await db.select().from(vendors).where(eq(vendors.status, 'pending'));
  }

  async updateVendorStatus(id: number, status: string, rejectionReason?: string, approvedBy?: string): Promise<Vendor> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'approved') {
      updateData.approvedAt = new Date();
      if (approvedBy) updateData.approvedBy = approvedBy;
    }

    if (status === 'rejected' && rejectionReason) {
      updateData.rejectionReason = rejectionReason;
    }

    const [vendor] = await db
      .update(vendors)
      .set(updateData)
      .where(eq(vendors.id, id))
      .returning();
    
    return vendor;
  }

  // Table operations
  async createTable(vendorId: number, tableNumber: number): Promise<Table> {
    const qrData = `vendor:${vendorId}:table:${tableNumber}`;
    const [table] = await db
      .insert(tables)
      .values({
        vendorId,
        tableNumber,
        qrData,
      })
      .returning();
    return table;
  }

  async getTables(vendorId: number): Promise<Table[]> {
    return await db.select().from(tables).where(eq(tables.vendorId, vendorId));
  }

  async getTable(id: number): Promise<Table | undefined> {
    const [table] = await db.select().from(tables).where(eq(tables.id, id));
    return table;
  }

  async assignCaptain(tableId: number, captainId: number | null): Promise<Table> {
    const [table] = await db
      .update(tables)
      .set({ captainId, updatedAt: new Date() })
      .where(eq(tables.id, tableId))
      .returning();
    return table;
  }

  // Captain operations
  async createCaptain(captain: InsertCaptain): Promise<Captain> {
    const hashedPassword = await bcrypt.hash(captain.password, 10);
    
    // First create a user account for the captain
    const userId = `captain_${captain.username}_${Date.now()}`;
    await db.insert(users).values({
      id: userId,
      role: 'captain',
    });
    
    // Then create the captain record with userId link
    const [newCaptain] = await db
      .insert(captains)
      .values({
        ...captain,
        userId,
        password: hashedPassword,
      })
      .returning();
    return newCaptain;
  }

  async getCaptains(vendorId: number): Promise<Captain[]> {
    return await db.select().from(captains).where(eq(captains.vendorId, vendorId));
  }

  async getCaptain(id: number): Promise<Captain | undefined> {
    const [captain] = await db.select().from(captains).where(eq(captains.id, id));
    return captain;
  }

  async getCaptainByUsername(username: string): Promise<Captain | undefined> {
    const [captain] = await db.select().from(captains).where(eq(captains.username, username));
    return captain;
  }

  async getCaptainByUserId(userId: string): Promise<Captain | undefined> {
    const [captain] = await db.select().from(captains).where(eq(captains.userId, userId));
    return captain;
  }

  async deleteCaptain(id: number): Promise<void> {
    await db.delete(captains).where(eq(captains.id, id));
  }

  async getCaptainTables(captainId: number): Promise<any[]> {
    // Get all tables assigned to this captain
    const assignedTables = await db
      .select()
      .from(tables)
      .where(eq(tables.captainId, captainId));

    // For each table, get current active orders (all except delivered/cancelled)
    const tablesWithOrders = await Promise.all(
      assignedTables.map(async (table) => {
        const currentOrders = await db
          .select()
          .from(orders)
          .where(eq(orders.tableId, table.id))
          .orderBy(desc(orders.createdAt));

        // Filter to only active orders (not delivered or cancelled)
        const activeOrders = currentOrders.filter(
          (order) => !['delivered', 'cancelled'].includes(order.status)
        );

        return {
          ...table,
          currentOrders: activeOrders,
        };
      })
    );

    return tablesWithOrders;
  }

  // Menu operations
  async createMenuCategory(category: InsertMenuCategory): Promise<MenuCategory> {
    const [newCategory] = await db
      .insert(menuCategories)
      .values(category)
      .returning();
    return newCategory;
  }

  async getMenuCategories(vendorId: number): Promise<MenuCategory[]> {
    return await db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.vendorId, vendorId))
      .orderBy(menuCategories.displayOrder);
  }

  // Menu Subcategory Operations
  async createMenuSubcategory(data: InsertMenuSubcategory): Promise<MenuSubcategory> {
    const [subcategory] = await db.insert(menuSubcategories).values(data).returning();
    return subcategory;
  }

  async getMenuSubcategories(vendorId: number): Promise<MenuSubcategory[]> {
    // Fetch all subcategories for a vendor
    return await db
      .select({
        id: menuSubcategories.id,
        categoryId: menuSubcategories.categoryId,
        name: menuSubcategories.name,
        description: menuSubcategories.description,
        displayOrder: menuSubcategories.displayOrder,
        isActive: menuSubcategories.isActive,
        createdAt: menuSubcategories.createdAt,
        updatedAt: menuSubcategories.updatedAt,
      })
      .from(menuSubcategories)
      .leftJoin(menuCategories, eq(menuSubcategories.categoryId, menuCategories.id))
      .where(eq(menuCategories.vendorId, vendorId))
      .orderBy(menuSubcategories.displayOrder);
  }

  async getMenuSubcategoriesByCategory(categoryId: number): Promise<MenuSubcategory[]> {
    return await db
      .select()
      .from(menuSubcategories)
      .where(eq(menuSubcategories.categoryId, categoryId))
      .orderBy(menuSubcategories.displayOrder);
  }

  async updateMenuSubcategory(id: number, updates: Partial<InsertMenuSubcategory>): Promise<MenuSubcategory> {
    const [subcategory] = await db
      .update(menuSubcategories)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(menuSubcategories.id, id))
      .returning();
    return subcategory;
  }

  async deleteMenuSubcategory(id: number): Promise<void> {
    await db.delete(menuSubcategories).where(eq(menuSubcategories.id, id));
  }

  async createMenuItem(item: InsertMenuItem): Promise<MenuItem> {
    const [newItem] = await db
      .insert(menuItems)
      .values(item)
      .returning();
    return newItem;
  }

  async createMenuAddon(addon: InsertMenuAddon): Promise<MenuAddon> {
    const [newAddon] = await db
      .insert(menuAddons)
      .values(addon)
      .returning();
    return newAddon;
  }

  async getMenuAddons(vendorId: number): Promise<MenuAddon[]> {
    return await db
      .select()
      .from(menuAddons)
      .where(eq(menuAddons.vendorId, vendorId))
      // menuAddons does not have a displayOrder field in the schema; order by creation time
      .orderBy(menuAddons.createdAt);
  }

  async getMenuAddon(id: number): Promise<MenuAddon | undefined> {
    const [addon] = await db
      .select()
      .from(menuAddons)
      .where(eq(menuAddons.id, id));
    return addon;
  }

  async updateMenuAddon(id: number, vendorId: number, updates: Partial<InsertMenuAddon>): Promise<MenuAddon> {
    const existing = await this.getMenuAddon(id);
    if (!existing) {
      throw new Error("Menu addon not found");
    }
    if (existing.vendorId !== vendorId) {
      throw new Error("You are not allowed to modify this addon");
    }

    const {
      vendorId: _ignoreVendorId,
      id: _ignoreId,
      createdAt: _ignoreCreatedAt,
      updatedAt: _ignoreUpdatedAt,
      ...rest
    } = updates as any;

    const [addon] = await db
      .update(menuAddons)
      .set({ ...rest, updatedAt: new Date() })
      .where(eq(menuAddons.id, id))
      .returning();
    return addon;
  }

  async deleteMenuAddon(id: number, vendorId: number): Promise<void> {
    const existing = await this.getMenuAddon(id);
    if (!existing) {
      throw new Error("Menu addon not found");
    }
    if (existing.vendorId !== vendorId) {
      throw new Error("You are not allowed to delete this addon");
    }
    await db.delete(menuAddons).where(eq(menuAddons.id, id));
  }

  async getMenuItems(vendorId: number): Promise<MenuItem[]> {
    return await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.vendorId, vendorId))
      .orderBy(menuItems.displayOrder);
  }

  async updateMenuItemAvailability(id: number, isAvailable: boolean): Promise<MenuItem> {
    const [item] = await db
      .update(menuItems)
      .set({ isAvailable, updatedAt: new Date() })
      .where(eq(menuItems.id, id))
      .returning();
    return item;
  }

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db
      .insert(orders)
      .values(order)
      .returning();

    if (order.tableId) {
      await this.lockTable(order.tableId);
    }

    return newOrder;
  }

  async getOrders(vendorId: number): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.vendorId, vendorId))
      .orderBy(desc(orders.createdAt));
  }

  // Get dine-in orders by customer phone
  async getDineInOrdersByPhone(phone: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.customerPhone, phone))
      .orderBy(desc(orders.createdAt));
  }

  async getOrder(id: number): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  async updateOrderStatus(id: number, status: string): Promise<Order> {
    const updateData: any = {
      status,
      updatedAt: new Date(),
    };

    const now = new Date();
    if (status === 'accepted') updateData.acceptedAt = now;
    if (status === 'preparing') updateData.preparingAt = now;
    if (status === 'ready') updateData.readyAt = now;
    if (status === 'delivered') updateData.deliveredAt = now;

    const [order] = await db
      .update(orders)
      .set(updateData)
      .where(eq(orders.id, id))
      .returning();

    if (order.tableId) {
      if (ACTIVE_TABLE_LOCK_STATUSES.includes(status as any)) {
        await this.lockTable(order.tableId);
      } else {
        await this.refreshTableAvailability(order.tableId);
      }
    }

    return order;
  }

  // Stats operations
  async getVendorStats(vendorId: number): Promise<any> {
    const allTables = await this.getTables(vendorId);
    const allCaptains = await this.getCaptains(vendorId);
    const allMenuItems = await this.getMenuItems(vendorId);
    const allOrders = await this.getOrders(vendorId);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const todayOrders = allOrders.filter(o => new Date(o.createdAt!) >= today);
    const todayRevenue = todayOrders.reduce((sum, o) => sum + Number(o.totalAmount), 0);
    const avgOrderValue = todayOrders.length > 0 ? todayRevenue / todayOrders.length : 0;

    return {
      totalTables: allTables.length,
      totalCaptains: allCaptains.length,
      totalMenuItems: allMenuItems.length,
      todayOrders: todayOrders.length,
      todayRevenue: todayRevenue.toFixed(2),
      avgOrderValue: avgOrderValue.toFixed(2),
      activeTables: allTables.filter(t => t.isActive).length,
    };
  }

  async getAdminStats(): Promise<any> {
    const allVendors = await this.getAllVendors();
    const pendingVendors = await this.getPendingVendors();

    return {
      totalVendors: allVendors.filter(v => v.status === 'approved').length,
      pendingVendors: pendingVendors.length,
      totalOrders: 0, // Would need to aggregate across all vendors
      platformRevenue: '0.00',
    };
  }

  // Admin config operations
  async getConfig(key: string): Promise<AdminConfig | undefined> {
    try {
      const [config] = await db.select().from(adminConfig).where(eq(adminConfig.key, key));
      if (config && config.value) {
        try {
          config.value = JSON.parse(config.value);
        } catch (e) {
          // Value is not JSON, keep as is
        }
      }
      return config;
    } catch (error) {
      console.error('Error getting config:', error);
      return undefined;
    }
  }

  async getAllConfig(): Promise<AdminConfig[]> {
    const configs = await db.select().from(adminConfig);
    return configs.map(config => {
      if (config.value) {
        try {
          config.value = JSON.parse(config.value);
        } catch (e) {
          // Value is not JSON, keep as is
        }
      }
      return config;
    });
  }

  async upsertConfig(configData: InsertAdminConfig): Promise<AdminConfig> {
    let valueStr = configData.value;
    if (typeof configData.value === 'object') {
      valueStr = JSON.stringify(configData.value);
    }

    const [config] = await db
      .insert(adminConfig)
      .values({ ...configData, value: valueStr })
      .onConflictDoUpdate({
        target: adminConfig.key,
        set: {
          value: valueStr,
          isEnabled: configData.isEnabled,
          description: configData.description,
          updatedAt: new Date(),
        },
      })
      .returning();
    
    return config;
  }

  async deleteConfig(key: string): Promise<void> {
    await db.delete(adminConfig).where(eq(adminConfig.key, key));
  }

  // Mobile App User operations
  async createAppUser(user: InsertAppUser): Promise<AppUser> {
    const [newUser] = await db.insert(appUsers).values(user).returning();
    return newUser;
  }

  async getAppUser(id: number): Promise<AppUser | undefined> {
    const [user] = await db.select().from(appUsers).where(eq(appUsers.id, id));
    return user;
  }

  async getAppUserByPhone(phone: string): Promise<AppUser | undefined> {
    const [user] = await db.select().from(appUsers).where(eq(appUsers.phone, phone));
    return user;
  }

  async updateAppUser(id: number, updates: Partial<InsertAppUser>): Promise<AppUser> {
    const [user] = await db
      .update(appUsers)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(appUsers.id, id))
      .returning();
    return user;
  }

  // OTP operations
  async createOtp(phone: string, otp: string, expiresAt: Date): Promise<OtpVerification> {
    const [newOtp] = await db
      .insert(otpVerifications)
      .values({ phone, otp, expiresAt })
      .returning();
    return newOtp;
  }

  async getValidOtp(phone: string, otp: string): Promise<OtpVerification | undefined> {
    const [verification] = await db
      .select()
      .from(otpVerifications)
      .where(
        and(
          eq(otpVerifications.phone, phone),
          eq(otpVerifications.otp, otp),
          eq(otpVerifications.isVerified, false)
        )
      )
      .orderBy(desc(otpVerifications.createdAt))
      .limit(1);
    
    if (!verification) return undefined;
    
    // Check if OTP is expired
    if (new Date() > verification.expiresAt) {
      return undefined;
    }
    
    return verification;
  }

  async markOtpVerified(id: number): Promise<void> {
    await db
      .update(otpVerifications)
      .set({ isVerified: true })
      .where(eq(otpVerifications.id, id));
  }

  // Cart operations
  async addToCart(item: InsertCartItem): Promise<CartItem> {
    // Check if item already exists in cart
    const [existing] = await db
      .select()
      .from(cartItems)
      .where(
        and(
          eq(cartItems.userId, item.userId),
          eq(cartItems.itemId, item.itemId)
        )
      );

    if (existing) {
      // Update quantity
      const [updated] = await db
        .update(cartItems)
        .set({ quantity: (existing.quantity ?? 0) + (item.quantity ?? 1) })
        .where(eq(cartItems.id, existing.id))
        .returning();
      return updated;
    }

    const [newItem] = await db.insert(cartItems).values(item).returning();
    return newItem;
  }

  async getCart(userId: number): Promise<any[]> {
    const cart = await db
      .select({
        id: cartItems.id,
        quantity: cartItems.quantity,
        modifiers: cartItems.modifiers,
        item: {
          id: menuItems.id,
          name: menuItems.name,
          price: menuItems.price,
          photo: menuItems.photo,
        },
        vendor: {
          id: vendors.id,
          restaurantName: vendors.restaurantName,
        },
      })
      .from(cartItems)
      .innerJoin(menuItems, eq(cartItems.itemId, menuItems.id))
      .innerJoin(vendors, eq(cartItems.vendorId, vendors.id))
      .where(eq(cartItems.userId, userId));
    
    return cart;
  }

  async clearCart(userId: number): Promise<void> {
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

    // Address operations
  async createAddress(address: InsertAddress): Promise<Address> {
    const [newAddress] = await db.insert(addresses).values(address).returning();
    return newAddress;
  }

  async getUserAddresses(userId: number): Promise<Address[]> {
    return await db
      .select()
      .from(addresses)
      .where(eq(addresses.userId, userId))
      .orderBy(desc(addresses.createdAt));
  }

  async getAddress(id: number): Promise<Address | undefined> {
    const [address] = await db.select().from(addresses).where(eq(addresses.id, id));
    return address;
  }

  async updateAddress(id: number, updates: Partial<InsertAddress>): Promise<Address> {
    const [updated] = await db
      .update(addresses)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(addresses.id, id))
      .returning();
    return updated;
  }

  async deleteAddress(id: number): Promise<void> {
    await db.delete(addresses).where(eq(addresses.id, id));
  }

  async setDefaultAddress(userId: number, addressId: number): Promise<void> {
    // First, unset previous defaults
    await db.update(addresses).set({ isDefault: false }).where(eq(addresses.userId, userId));

    // Then, set the new one
    await db
      .update(addresses)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(addresses.id, addressId));
  }

  // Delivery Order operations
  async createDeliveryOrder(order: InsertDeliveryOrder): Promise<DeliveryOrder> {
    const [newOrder] = await db.insert(deliveryOrders).values(order).returning();
    return newOrder;
  }

  async getDeliveryOrders(userId: number): Promise<DeliveryOrder[]> {
    return await db
      .select()
      .from(deliveryOrders)
      .where(eq(deliveryOrders.userId, userId))
      .orderBy(desc(deliveryOrders.createdAt));
  }

  async updateDeliveryOrderStatus(id: number, status: string): Promise<DeliveryOrder> {
    const updates: any = { status, updatedAt: new Date() };
    
    // Set timestamp based on status
    switch (status) {
      case 'accepted':
        updates.acceptedAt = new Date();
        break;
      case 'preparing':
        updates.preparingAt = new Date();
        break;
      case 'ready':
        updates.readyAt = new Date();
        break;
      case 'out_for_delivery':
        updates.outForDeliveryAt = new Date();
        break;
      case 'delivered':
        updates.deliveredAt = new Date();
        break;
    }
    
    const [updated] = await db
      .update(deliveryOrders)
      .set(updates)
      .where(eq(deliveryOrders.id, id))
      .returning();
    
    return updated;
  }

  // Public API operations
  async getNearbyVendors(
    latitude: number,
    longitude: number,
    radiusKm: number = 10000000000
  ): Promise<(Vendor & { distance: number })[]> {
    // Fetch all approved vendors
    const allVendors = await db
      .select()
      .from(vendors)
      .where(eq(vendors.status, 'approved'));

    // Calculate distance and filter
    const vendorsWithDistance = allVendors
      .map(vendor => {
        if (!vendor.latitude || !vendor.longitude) return null;

        const lat1 = parseFloat(vendor.latitude as string);
        const lon1 = parseFloat(vendor.longitude as string);
        const lat2 = latitude;
        const lon2 = longitude;

        const R = 6371; // km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
          Math.sin(dLat / 2) ** 2 +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon / 2) ** 2;
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c;

        return { ...vendor, distance };
      })
      .filter((vendor): vendor is Vendor & { distance: number } => vendor !== null && vendor.distance <= radiusKm);

    // Sort by distance ascending
    vendorsWithDistance.sort((a, b) => a.distance - b.distance);

    return vendorsWithDistance;
  }

  async getVendorMenu(vendorId: number): Promise<any> {
    const vendor = await this.getVendor(vendorId);
    if (!vendor) return null;
    
    const categories = await db
      .select()
      .from(menuCategories)
      .where(
        and(
          eq(menuCategories.vendorId, vendorId),
          eq(menuCategories.isActive, true)
        )
      )
      .orderBy(menuCategories.displayOrder);
    
    const items = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.vendorId, vendorId))
      .orderBy(menuItems.displayOrder);

    const addons = await this.getMenuAddons(vendorId);
    
    // Group items by category
    const menu = categories.map(category => ({
      ...category,
      items: items
        .filter(item => item.categoryId === category.id)
        .map(item => ({
          ...item,
          addons: addons.filter(addon => addon.itemId === item.id),
        })),
    }));
    
    return {
      vendor,
      menu,
    };
  }
}

export const storage = new DatabaseStorage();
