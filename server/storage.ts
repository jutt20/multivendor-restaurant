// Reference: javascript_database and javascript_log_in_with_replit blueprints
import {
  users,
  vendors,
  tables,
  captains,
  menuCategories,
  menuItems,
  orders,
  kotTickets,
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
  type KotTicket,
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
  type SalesSummary,
  type AdminSalesSummary,
} from "@shared/schema";
import { addresses, type Address, type InsertAddress } from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, inArray, ne, sql, gte, lte } from "drizzle-orm";
import bcrypt from "bcrypt";
import { eachDayOfInterval, format as formatDate, subDays } from "date-fns";

const ACTIVE_TABLE_LOCK_STATUSES = ["pending", "accepted", "preparing", "ready", "delivered"] as const;

export type AppUserWithStats = AppUser & { orderCount: number };

type NormalizedDateRange = {
  start: Date;
  end: Date;
  startDate: string;
  endDate: string;
  days: number;
};

type OrderAmountRecord = {
  createdAt: Date | null;
  totalAmount: string | number | null;
};

type VendorOrderAmountRecord = OrderAmountRecord & {
  vendorId: number | null;
  vendorName?: string | null;
};

type VendorOrdersPage = {
  orders: Order[];
  total: number;
};

type AdminOrderWithMeta = Order & {
  vendorName: string | null;
  vendorPhone: string | null;
  tableNumber: number | null;
};

type AdminOrdersPage = {
  orders: AdminOrderWithMeta[];
  total: number;
};

export interface IStorage {
  // User operations (required for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<UpsertUser>): Promise<User>;
  getAllSystemUsers(filters?: {
    role?: string;
    isActive?: boolean;
    isVerified?: boolean;
    search?: string;
  }): Promise<User[]>;
  
  // Vendor operations
  createVendor(vendor: InsertVendor): Promise<Vendor>;
  getVendor(id: number): Promise<Vendor | undefined>;
  getVendorByUserId(userId: string): Promise<Vendor | undefined>;
  getVendorByOwnerId(ownerId: string): Promise<Vendor | undefined>;
  getAllVendors(): Promise<Vendor[]>;
  getPendingVendors(): Promise<Vendor[]>;
  updateVendorStatus(id: number, status: string, rejectionReason?: string, approvedBy?: string): Promise<Vendor>;
  updateVendor(id: number, updates: Partial<InsertVendor>): Promise<Vendor>;
  syncDuplicateVendors(userId: string, primaryVendorId: number, updates: Partial<InsertVendor>): Promise<void>;
  
  // Table operations
  createTable(vendorId: number, tableNumber: number, isManual?: boolean): Promise<Table>;
  getTables(vendorId: number): Promise<Table[]>;
  getTable(id: number): Promise<Table | undefined>;
  assignCaptain(tableId: number, captainId: number | null): Promise<Table>;
  deleteTable(vendorId: number, tableId: number): Promise<void>;
  setTableManualStatus(tableId: number, isManual: boolean): Promise<Table>;
  updateTableStatus(vendorId: number, tableId: number, status: "available" | "booked"): Promise<Table>;
  
  // Captain operations
  createCaptain(captain: InsertCaptain): Promise<Captain>;
  getCaptains(vendorId: number): Promise<Captain[]>;
  getCaptain(id: number): Promise<Captain | undefined>;
  getCaptainByUsername(username: string): Promise<Captain | undefined>;
  getCaptainByUserId(userId: string): Promise<Captain | undefined>;
  deleteCaptain(id: number): Promise<void>;
  getCaptainTables(captainId: number): Promise<any[]>;
  getCaptainOrders(captainId: number): Promise<(Order & { tableNumber: number | null })[]>;
  
  // Menu operations
  createMenuCategory(category: InsertMenuCategory): Promise<MenuCategory>;
  getMenuCategories(vendorId: number): Promise<MenuCategory[]>;
  getMenuCategory(id: number): Promise<MenuCategory | undefined>;
  updateMenuCategory(
    id: number,
    vendorId: number,
    updates: Partial<InsertMenuCategory>,
  ): Promise<MenuCategory>;
  deleteMenuCategory(id: number, vendorId: number): Promise<void>;
  createMenuItem(item: InsertMenuItem): Promise<MenuItem>;
  getMenuItems(vendorId: number): Promise<MenuItem[]>;
  getMenuItem(id: number): Promise<MenuItem | undefined>;
  updateMenuItemAvailability(id: number, isAvailable: boolean): Promise<MenuItem>;
  updateMenuItem(
    id: number,
    vendorId: number,
    updates: Partial<InsertMenuItem>,
  ): Promise<MenuItem>;
  deleteMenuItem(id: number, vendorId: number): Promise<void>;

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
  updateMenuSubcategory(
    id: number,
    vendorId: number,
    updates: Partial<InsertMenuSubcategory>,
  ): Promise<MenuSubcategory>;
  deleteMenuSubcategory(id: number, vendorId: number): Promise<void>;
  
  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  getOrders(vendorId: number): Promise<Order[]>;
  getVendorOrdersPaginated(vendorId: number, limit: number, offset: number): Promise<VendorOrdersPage>;
  getAdminOrdersPaginated(limit: number, offset: number): Promise<AdminOrdersPage>;
  getOrder(id: number): Promise<Order | undefined>;
  getDineInOrdersByPhone(phone: string): Promise<Order[]>;
  updateOrderStatus(id: number, status: string): Promise<Order>;
  getKotByOrderId(orderId: number): Promise<KotTicket | undefined>;
  getKotTicketsByOrderIds(orderIds: number[]): Promise<KotTicket[]>;
  
  // Admin stats
  getVendorStats(vendorId: number): Promise<any>;
  getAdminStats(): Promise<any>;
  getVendorSalesSummary(vendorId: number, startDate?: string, endDate?: string): Promise<SalesSummary>;
  getAdminSalesSummary(startDate?: string, endDate?: string): Promise<AdminSalesSummary>;
  
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
  getAppUsersWithStats(search?: string): Promise<AppUserWithStats[]>;
  getVendorCustomersWithStats(vendorId: number, search?: string): Promise<AppUserWithStats[]>;
  
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

  private normalizeOrderItemsForKot(items: Order["items"]): any {
    if (Array.isArray(items)) {
      return items;
    }

    if (typeof items === "string") {
      try {
        const parsed = JSON.parse(items);
        return parsed;
      } catch {
        return [];
      }
    }

    if (items && typeof items === "object") {
      return items;
    }

    return [];
  }

  private async ensureKotTicket(order: Order): Promise<KotTicket> {
    const existing = await this.getKotByOrderId(order.id);
    if (existing) {
      return existing;
    }

    const normalizedItems = this.normalizeOrderItemsForKot(order.items);
    const now = new Date();

    const [inserted] = await db
      .insert(kotTickets)
      .values({
        orderId: order.id,
        vendorId: order.vendorId,
        tableId: order.tableId,
        ticketNumber: `KOT-${order.vendorId}-${order.id}`,
        status: "pending",
        items: normalizedItems,
        customerNotes: order.customerNotes ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing({
        target: [kotTickets.orderId],
      })
      .returning();

    if (inserted) {
      return inserted;
    }

    const fallback = await this.getKotByOrderId(order.id);
    if (!fallback) {
      throw new Error("Failed to create kitchen order ticket");
    }
    return fallback;
  }

  private normalizeDateRange(startDate?: string, endDate?: string): NormalizedDateRange {
    const now = new Date();
    let end = endDate ? new Date(endDate) : new Date(now);
    if (Number.isNaN(end.getTime())) {
      end = new Date(now);
    }
    let start = startDate ? new Date(startDate) : subDays(end, 6);
    if (Number.isNaN(start.getTime())) {
      start = subDays(end, 6);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (start > end) {
      const originalStart = start;
      start = new Date(end);
      start.setHours(0, 0, 0, 0);
      end = new Date(originalStart);
      end.setHours(23, 59, 59, 999);
    }

    const calendarDays = eachDayOfInterval({ start, end });

    return {
      start,
      end,
      startDate: formatDate(start, "yyyy-MM-dd"),
      endDate: formatDate(end, "yyyy-MM-dd"),
      days: calendarDays.length,
    };
  }

  private parseCurrency(value: string | number | null | undefined): number {
    if (typeof value === "number") {
      return Number.isFinite(value) ? value : 0;
    }
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
  }

  private buildSalesSummary<T extends OrderAmountRecord>(
    orderRows: T[],
    range: NormalizedDateRange,
  ): SalesSummary {
    const totalRevenueValue = orderRows.reduce(
      (sum, order) => sum + this.parseCurrency(order.totalAmount),
      0,
    );
    const totalOrders = orderRows.length;

    const dailyMap = new Map<string, { totalOrders: number; totalRevenue: number }>();
    for (const order of orderRows) {
      if (!order.createdAt) continue;
      const key = formatDate(order.createdAt, "yyyy-MM-dd");
      const existing = dailyMap.get(key) ?? { totalOrders: 0, totalRevenue: 0 };
      existing.totalOrders += 1;
      existing.totalRevenue += this.parseCurrency(order.totalAmount);
      dailyMap.set(key, existing);
    }

    const calendarDays = eachDayOfInterval({ start: range.start, end: range.end });
    const daily = calendarDays.map((day) => {
      const key = formatDate(day, "yyyy-MM-dd");
      const stats = dailyMap.get(key);
      return {
        date: key,
        totalOrders: stats?.totalOrders ?? 0,
        totalRevenue: (stats?.totalRevenue ?? 0).toFixed(2),
      };
    });

    return {
      range: {
        startDate: range.startDate,
        endDate: range.endDate,
        days: range.days,
      },
      totals: {
        totalOrders,
        totalRevenue: totalRevenueValue.toFixed(2),
        averageOrderValue:
          totalOrders > 0 ? (totalRevenueValue / totalOrders).toFixed(2) : "0.00",
      },
      daily,
    };
  }

  private buildVendorBreakdown(rows: VendorOrderAmountRecord[]): AdminSalesSummary["vendorBreakdown"] {
    const vendorMap = new Map<
      number,
      { vendorName: string; totalOrders: number; totalRevenue: number }
    >();

    for (const row of rows) {
      if (row.vendorId == null) continue;
      const entry =
        vendorMap.get(row.vendorId) ??
        {
          vendorName: row.vendorName ?? "Unknown Vendor",
          totalOrders: 0,
          totalRevenue: 0,
        };

      entry.totalOrders += 1;
      entry.totalRevenue += this.parseCurrency(row.totalAmount);
      vendorMap.set(row.vendorId, entry);
    }

    return Array.from(vendorMap.entries())
      .map(([vendorId, info]) => ({
        vendorId,
        vendorName: info.vendorName,
        totalOrders: info.totalOrders,
        totalRevenue: info.totalRevenue,
      }))
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .map((entry) => ({
        vendorId: entry.vendorId,
        vendorName: entry.vendorName,
        totalOrders: entry.totalOrders,
        totalRevenue: entry.totalRevenue.toFixed(2),
      }));
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

  async getAllSystemUsers(filters?: {
    role?: string;
    isActive?: boolean;
    isVerified?: boolean;
    search?: string;
  }): Promise<User[]> {
    let query = db.select().from(users);

    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.role) {
      conditions.push(eq(users.role, filters.role));
    }

    if (filters?.isActive !== undefined) {
      conditions.push(eq(users.isActive, filters.isActive));
    }

    if (filters?.isVerified !== undefined) {
      conditions.push(eq(users.isVerified, filters.isVerified));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const allUsers = await query.orderBy(desc(users.createdAt));

    // Apply search filter in memory for text search across multiple fields
    if (filters?.search) {
      const searchLower = filters.search.toLowerCase().trim();
      return allUsers.filter((user) => {
        const searchableFields = [
          user.id,
          user.email,
          user.fullName,
          user.phoneNumber,
          user.role,
        ].filter(Boolean);

        return searchableFields.some((field) =>
          String(field).toLowerCase().includes(searchLower)
        );
      });
    }

    return allUsers;
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
    const activeVendors = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.userId, userId), ne(vendors.status, "suspended")))
      .orderBy(desc(vendors.updatedAt), desc(vendors.id));

    if (activeVendors.length > 0) {
      if (activeVendors.length > 1) {
        const [, ...duplicates] = activeVendors;
        const duplicateIds = duplicates.map((vendor) => vendor.id);

        if (duplicateIds.length > 0) {
          await db
            .update(vendors)
            .set({
              status: "suspended",
              updatedAt: new Date(),
              rejectionReason: "Automatically suspended duplicate record",
            })
            .where(inArray(vendors.id, duplicateIds));
        }
      }

      return activeVendors[0];
    }

    const vendorsForUser = await db
      .select()
      .from(vendors)
      .where(eq(vendors.userId, userId))
      .orderBy(desc(vendors.updatedAt), desc(vendors.id));

    if (vendorsForUser.length > 1) {
      const [primary, ...rest] = vendorsForUser;
      const staleVendorIds = rest.map((vendor) => vendor.id);

      await db
        .update(vendors)
        .set({
          status: "suspended",
          updatedAt: new Date(),
          rejectionReason: "Automatically suspended duplicate record",
        })
        .where(inArray(vendors.id, staleVendorIds));
      return primary;
    }

    return vendorsForUser[0];
  }

  async getVendorByOwnerId(ownerId: string): Promise<Vendor | undefined> {
    const vendor = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.ownerId, ownerId), ne(vendors.status, "suspended")))
      .limit(1);
    
    return vendor[0];
  }

  async syncDuplicateVendors(
    userId: string,
    primaryVendorId: number,
    updates: Partial<InsertVendor>,
  ): Promise<void> {
    if (!updates || Object.keys(updates).length === 0) {
      return;
    }

    const {
      userId: _ignoreUser,
      id: _ignoreId,
      createdAt: _ignoreCreated,
      approvedAt: _ignoreApproved,
      approvedBy: _ignoreApprovedBy,
      ...rest
    } = updates as any;

    await db
      .update(vendors)
      .set({ ...rest, updatedAt: new Date() })
      .where(and(eq(vendors.userId, userId), ne(vendors.id, primaryVendorId)));
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
  async createTable(vendorId: number, tableNumber: number, isManual = false): Promise<Table> {
    const qrData = `vendor:${vendorId}:table:${tableNumber}`;
    const [table] = await db
      .insert(tables)
      .values({
        vendorId,
        tableNumber,
        qrData,
        isManual,
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

  async deleteTable(vendorId: number, tableId: number): Promise<void> {
    const table = await this.getTable(tableId);

    if (!table || table.vendorId !== vendorId) {
      throw new Error("Table not found");
    }

    await db
      .delete(tables)
      .where(and(eq(tables.id, tableId), eq(tables.vendorId, vendorId)));
  }

  async setTableManualStatus(tableId: number, isManual: boolean): Promise<Table> {
    const [table] = await db
      .update(tables)
      .set({ isManual, updatedAt: new Date() })
      .where(eq(tables.id, tableId))
      .returning();

    if (!table) {
      throw new Error("Table not found");
    }

    return table;
  }

  async updateTableStatus(
    vendorId: number,
    tableId: number,
    status: "available" | "booked",
  ): Promise<Table> {
    const table = await this.getTable(tableId);
    if (!table || table.vendorId !== vendorId) {
      throw new Error("Table not found");
    }

    const isActive = status === "available";
    const [updated] = await db
      .update(tables)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(tables.id, tableId), eq(tables.vendorId, vendorId)))
      .returning();

    if (!updated) {
      throw new Error("Failed to update table");
    }

    return updated;
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
          (order) => !['delivered', 'completed', 'cancelled'].includes(order.status)
        );

        return {
          ...table,
          currentOrders: activeOrders,
        };
      })
    );

    return tablesWithOrders;
  }

  async getCaptainOrders(captainId: number): Promise<(Order & { tableNumber: number | null })[]> {
    const assignedTables = await db
      .select({
        id: tables.id,
        tableNumber: tables.tableNumber,
      })
      .from(tables)
      .where(eq(tables.captainId, captainId));

    if (assignedTables.length === 0) {
      return [];
    }

    const tableIdMap = new Map<number, number | null>(
      assignedTables.map((table) => [table.id, table.tableNumber ?? null]),
    );
    const tableIds = assignedTables.map((table) => table.id);

    const captainOrders = await db
      .select()
      .from(orders)
      .where(inArray(orders.tableId, tableIds))
      .orderBy(desc(orders.createdAt));

    return captainOrders.map((order) => ({
      ...order,
      tableNumber: tableIdMap.get(order.tableId) ?? null,
    }));
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

  async getMenuCategory(id: number): Promise<MenuCategory | undefined> {
    const [category] = await db
      .select()
      .from(menuCategories)
      .where(eq(menuCategories.id, id))
      .limit(1);
    return category;
  }

  async updateMenuCategory(
    id: number,
    vendorId: number,
    updates: Partial<InsertMenuCategory>,
  ): Promise<MenuCategory> {
    const existing = await this.getMenuCategory(id);
    if (!existing) {
      throw new Error("Menu category not found");
    }
    if (existing.vendorId !== vendorId) {
      throw new Error("You are not allowed to modify this category");
    }

    const {
      id: _ignoreId,
      vendorId: _ignoreVendorId,
      createdAt: _ignoreCreatedAt,
      updatedAt: _ignoreUpdatedAt,
      ...rest
    } = updates as any;

    if (rest.gstRate !== undefined) {
      const numeric =
        typeof rest.gstRate === "string"
          ? Number.parseFloat(rest.gstRate)
          : Number(rest.gstRate);
      if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
        throw new Error("GST % must be between 0 and 100");
      }
      rest.gstRate = numeric.toFixed(2);
    }

    if (rest.gstMode !== undefined) {
      const normalized = String(rest.gstMode).toLowerCase();
      if (normalized !== "include" && normalized !== "exclude") {
        throw new Error("gstMode must be either include or exclude");
      }
      rest.gstMode = normalized;
    }

    const toUpdate = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(toUpdate).length === 0) {
      return existing;
    }

    const [category] = await db
      .update(menuCategories)
      .set({ ...toUpdate, updatedAt: new Date() })
      .where(eq(menuCategories.id, id))
      .returning();

    return category;
  }

  async deleteMenuCategory(id: number, vendorId: number): Promise<void> {
    const existing = await this.getMenuCategory(id);
    if (!existing) {
      throw new Error("Menu category not found");
    }
    if (existing.vendorId !== vendorId) {
      throw new Error("You are not allowed to delete this category");
    }

    await db.delete(menuCategories).where(eq(menuCategories.id, id));
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

  async updateMenuSubcategory(
    id: number,
    vendorId: number,
    updates: Partial<InsertMenuSubcategory>,
  ): Promise<MenuSubcategory> {
    const [existing] = await db
      .select({
        id: menuSubcategories.id,
        categoryId: menuSubcategories.categoryId,
        vendorId: menuCategories.vendorId,
      })
      .from(menuSubcategories)
      .innerJoin(menuCategories, eq(menuSubcategories.categoryId, menuCategories.id))
      .where(eq(menuSubcategories.id, id))
      .limit(1);

    if (!existing) {
      throw new Error("Menu subcategory not found");
    }

    if (existing.vendorId !== vendorId) {
      throw new Error("You are not allowed to modify this subcategory");
    }

    if (updates.categoryId !== undefined) {
      const targetCategory = await this.getMenuCategory(updates.categoryId);
      if (!targetCategory || targetCategory.vendorId !== vendorId) {
        throw new Error("Invalid category for this subcategory");
      }
    }

    const {
      id: _ignoreId,
      vendorId: _ignoreVendorId,
      createdAt: _ignoreCreatedAt,
      updatedAt: _ignoreUpdatedAt,
      ...rest
    } = updates as any;

    const toUpdate = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(toUpdate).length === 0) {
      const [subcategory] = await db
        .select()
        .from(menuSubcategories)
        .where(eq(menuSubcategories.id, id))
        .limit(1);
      if (!subcategory) {
        throw new Error("Menu subcategory not found");
      }
      return subcategory;
    }

    const [subcategory] = await db
      .update(menuSubcategories)
      .set({ ...toUpdate, updatedAt: new Date() })
      .where(eq(menuSubcategories.id, id))
      .returning();
    return subcategory;
  }

  async deleteMenuSubcategory(id: number, vendorId: number): Promise<void> {
    const [existing] = await db
      .select({
        id: menuSubcategories.id,
        vendorId: menuCategories.vendorId,
      })
      .from(menuSubcategories)
      .innerJoin(menuCategories, eq(menuSubcategories.categoryId, menuCategories.id))
      .where(eq(menuSubcategories.id, id))
      .limit(1);

    if (!existing) {
      throw new Error("Menu subcategory not found");
    }

    if (existing.vendorId !== vendorId) {
      throw new Error("You are not allowed to delete this subcategory");
    }

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

  async getMenuItem(id: number): Promise<MenuItem | undefined> {
    const [item] = await db
      .select()
      .from(menuItems)
      .where(eq(menuItems.id, id))
      .limit(1);
    return item;
  }

  async updateMenuItemAvailability(id: number, isAvailable: boolean): Promise<MenuItem> {
    const [item] = await db
      .update(menuItems)
      .set({ isAvailable, updatedAt: new Date() })
      .where(eq(menuItems.id, id))
      .returning();
    return item;
  }

  async updateMenuItem(
    id: number,
    vendorId: number,
    updates: Partial<InsertMenuItem>,
  ): Promise<MenuItem> {
    const existing = await this.getMenuItem(id);
    if (!existing) {
      throw new Error("Menu item not found");
    }
    if (existing.vendorId !== vendorId) {
      throw new Error("You are not allowed to modify this item");
    }

    if (updates.categoryId !== undefined) {
      const category = await this.getMenuCategory(updates.categoryId);
      if (!category || category.vendorId !== vendorId) {
        throw new Error("Invalid category for this item");
      }
    }

    if (updates.subCategoryId !== undefined && updates.subCategoryId !== null) {
      const [subcategory] = await db
        .select({
          id: menuSubcategories.id,
          vendorId: menuCategories.vendorId,
        })
        .from(menuSubcategories)
        .innerJoin(menuCategories, eq(menuSubcategories.categoryId, menuCategories.id))
        .where(eq(menuSubcategories.id, updates.subCategoryId))
        .limit(1);

      if (!subcategory || subcategory.vendorId !== vendorId) {
        throw new Error("Invalid subcategory for this item");
      }
    }

    const {
      id: _ignoreId,
      vendorId: _ignoreVendorId,
      createdAt: _ignoreCreatedAt,
      updatedAt: _ignoreUpdatedAt,
      ...rest
    } = updates as any;

    const toUpdate = Object.fromEntries(
      Object.entries(rest).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(toUpdate).length === 0) {
      return existing;
    }

    const [item] = await db
      .update(menuItems)
      .set({ ...toUpdate, updatedAt: new Date() })
      .where(eq(menuItems.id, id))
      .returning();

    return item;
  }

  async deleteMenuItem(id: number, vendorId: number): Promise<void> {
    const existing = await this.getMenuItem(id);
    if (!existing) {
      throw new Error("Menu item not found");
    }
    if (existing.vendorId !== vendorId) {
      throw new Error("You are not allowed to delete this item");
    }

    await db.delete(menuItems).where(eq(menuItems.id, id));
  }

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db
      .insert(orders)
      .values(order)
      .returning();

    if (!newOrder) {
      throw new Error("Failed to create order");
    }

    if (newOrder.tableId) {
      await this.lockTable(newOrder.tableId);
    }

    await this.ensureKotTicket(newOrder);

    return newOrder;
  }

  async getOrders(vendorId: number): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.vendorId, vendorId))
      .orderBy(desc(orders.createdAt));
  }

  async getVendorOrdersPaginated(
    vendorId: number,
    limit: number,
    offset: number,
  ): Promise<VendorOrdersPage> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(orders)
      .where(eq(orders.vendorId, vendorId));

    const pagedOrders = await db
      .select()
      .from(orders)
      .where(eq(orders.vendorId, vendorId))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      orders: pagedOrders,
      total: Number(count ?? 0),
    };
  }

  async getAdminOrdersPaginated(limit: number, offset: number): Promise<AdminOrdersPage> {
    const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(orders);

    const rows = await db
      .select({
        id: orders.id,
        vendorId: orders.vendorId,
        tableId: orders.tableId,
        items: orders.items,
        totalAmount: orders.totalAmount,
        customerName: orders.customerName,
        customerPhone: orders.customerPhone,
        status: orders.status,
        acceptedAt: orders.acceptedAt,
        preparingAt: orders.preparingAt,
        readyAt: orders.readyAt,
        deliveredAt: orders.deliveredAt,
        customerNotes: orders.customerNotes,
        vendorNotes: orders.vendorNotes,
        createdAt: orders.createdAt,
        updatedAt: orders.updatedAt,
        vendorName: vendors.restaurantName,
        vendorPhone: vendors.phone,
        tableNumber: tables.tableNumber,
      })
      .from(orders)
      .leftJoin(vendors, eq(orders.vendorId, vendors.id))
      .leftJoin(tables, eq(orders.tableId, tables.id))
      .orderBy(desc(orders.createdAt))
      .limit(limit)
      .offset(offset);

    return {
      orders: rows.map((row) => ({
        id: row.id,
        vendorId: row.vendorId,
        tableId: row.tableId,
        items: row.items,
        totalAmount: row.totalAmount,
        customerName: row.customerName,
        customerPhone: row.customerPhone,
        status: row.status,
        acceptedAt: row.acceptedAt,
        preparingAt: row.preparingAt,
        readyAt: row.readyAt,
        deliveredAt: row.deliveredAt,
        customerNotes: row.customerNotes,
        vendorNotes: row.vendorNotes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        vendorName: row.vendorName ?? null,
        vendorPhone: row.vendorPhone ?? null,
        tableNumber: row.tableNumber ?? null,
      })),
      total: Number(count ?? 0),
    };
  }

  // Get dine-in orders by customer phone
  async getDineInOrdersByPhone(phone: string): Promise<Order[]> {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.customerPhone, phone))
      .orderBy(desc(orders.createdAt));
  }

  async getKotByOrderId(orderId: number): Promise<KotTicket | undefined> {
    const [ticket] = await db
      .select()
      .from(kotTickets)
      .where(eq(kotTickets.orderId, orderId))
      .limit(1);
    return ticket;
  }

  async getKotTicketsByOrderIds(orderIds: number[]): Promise<KotTicket[]> {
    if (orderIds.length === 0) {
      return [];
    }

    return await db
      .select()
      .from(kotTickets)
      .where(inArray(kotTickets.orderId, orderIds));
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

  async getVendorSalesSummary(
    vendorId: number,
    startDate?: string,
    endDate?: string,
  ): Promise<SalesSummary> {
    const range = this.normalizeDateRange(startDate, endDate);

    const orderRows = await db
      .select({
        createdAt: orders.createdAt,
        totalAmount: orders.totalAmount,
      })
      .from(orders)
      .where(
        and(
          eq(orders.vendorId, vendorId),
          gte(orders.createdAt, range.start),
          lte(orders.createdAt, range.end),
        ),
      )
      .orderBy(orders.createdAt);

    return this.buildSalesSummary(orderRows, range);
  }

  async getAdminSalesSummary(startDate?: string, endDate?: string): Promise<AdminSalesSummary> {
    const range = this.normalizeDateRange(startDate, endDate);

    const rows = await db
      .select({
        vendorId: orders.vendorId,
        createdAt: orders.createdAt,
        totalAmount: orders.totalAmount,
        vendorName: vendors.restaurantName,
        vendorStatus: vendors.status,
      })
      .from(orders)
      .innerJoin(vendors, eq(orders.vendorId, vendors.id))
      .where(
        and(
          eq(vendors.status, "approved"),
          gte(orders.createdAt, range.start),
          lte(orders.createdAt, range.end),
        ),
      )
      .orderBy(orders.createdAt);

    const summary = this.buildSalesSummary(rows, range);

    return {
      ...summary,
      vendorBreakdown: this.buildVendorBreakdown(rows),
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

  async getAppUsersWithStats(filters?: {
    search?: string;
    isPhoneVerified?: boolean;
    city?: string;
    state?: string;
  }): Promise<AppUserWithStats[]> {
    let query = db.select().from(appUsers);
    const conditions: ReturnType<typeof eq>[] = [];

    if (filters?.isPhoneVerified !== undefined) {
      conditions.push(eq(appUsers.isPhoneVerified, filters.isPhoneVerified));
    }

    if (filters?.city) {
      conditions.push(eq(appUsers.city, filters.city));
    }

    if (filters?.state) {
      conditions.push(eq(appUsers.state, filters.state));
    }

    if (conditions.length > 0) {
      query = query.where(and(...conditions)) as any;
    }

    const allUsers = await query.orderBy(desc(appUsers.createdAt));

    const normalizedSearch = filters?.search?.trim().toLowerCase();
    const filteredUsers =
      normalizedSearch && normalizedSearch.length > 0
        ? allUsers.filter((user) => {
            const nameMatch = user.name?.toLowerCase().includes(normalizedSearch);
            const phoneMatch = user.phone?.toLowerCase().includes(normalizedSearch);
            const emailMatch = user.email?.toLowerCase().includes(normalizedSearch);
            const cityMatch = user.city?.toLowerCase().includes(normalizedSearch);
            const stateMatch = user.state?.toLowerCase().includes(normalizedSearch);
            const idMatch = user.id.toString().includes(normalizedSearch);
            return Boolean(nameMatch || phoneMatch || emailMatch || cityMatch || stateMatch || idMatch);
          })
        : allUsers;

    if (filteredUsers.length === 0) {
      return filteredUsers.map((user) => ({ ...user, orderCount: 0 }));
    }

    const phoneToUserId = new Map<string, number>();
    const userIds: number[] = [];

    for (const user of filteredUsers) {
      userIds.push(user.id);
      if (user.phone) {
        phoneToUserId.set(user.phone, user.id);
      }
    }

    const phoneList = Array.from(phoneToUserId.keys());

    const dineInCounts =
      phoneList.length > 0
        ? await db
            .select({
              phone: orders.customerPhone,
              count: sql<number>`COUNT(*)`,
            })
            .from(orders)
            .where(inArray(orders.customerPhone, phoneList))
            .groupBy(orders.customerPhone)
        : [];

    const deliveryCounts =
      userIds.length > 0
        ? await db
            .select({
              userId: deliveryOrders.userId,
              count: sql<number>`COUNT(*)`,
            })
            .from(deliveryOrders)
            .where(inArray(deliveryOrders.userId, userIds))
            .groupBy(deliveryOrders.userId)
        : [];

    const orderCounts = new Map<number, number>();

    for (const row of dineInCounts) {
      if (!row.phone) continue;
      const userId = phoneToUserId.get(row.phone);
      if (!userId) continue;
      orderCounts.set(userId, (orderCounts.get(userId) ?? 0) + Number(row.count ?? 0));
    }

    for (const row of deliveryCounts) {
      if (row.userId == null) continue;
      orderCounts.set(row.userId, (orderCounts.get(row.userId) ?? 0) + Number(row.count ?? 0));
    }

    return filteredUsers.map((user) => ({
      ...user,
      orderCount: orderCounts.get(user.id) ?? 0,
    }));
  }

  async getVendorCustomersWithStats(vendorId: number, search?: string): Promise<AppUserWithStats[]> {
    const deliveryCustomerRows = await db
      .select({
        userId: deliveryOrders.userId,
      })
      .from(deliveryOrders)
      .where(eq(deliveryOrders.vendorId, vendorId))
      .groupBy(deliveryOrders.userId);

    const dineInCustomerRows = await db
      .select({
        phone: orders.customerPhone,
      })
      .from(orders)
      .where(
        and(
          eq(orders.vendorId, vendorId),
          sql`${orders.customerPhone} IS NOT NULL`,
          sql`TRIM(${orders.customerPhone}) <> ''`,
        ),
      )
      .groupBy(orders.customerPhone);

    const deliveryUserIds = Array.from(
      new Set(
        deliveryCustomerRows
          .map((row) => row.userId)
          .filter((value): value is number => typeof value === "number"),
      ),
    );

    const dineInPhones = Array.from(
      new Set(
        dineInCustomerRows
          .map((row) => (typeof row.phone === "string" ? row.phone.trim() : ""))
          .filter((phone): phone is string => phone.length > 0),
      ),
    );

    const deliveryUsers =
      deliveryUserIds.length > 0
        ? await db
            .select()
            .from(appUsers)
            .where(inArray(appUsers.id, deliveryUserIds))
            .orderBy(desc(appUsers.createdAt))
        : [];

    const dineInUsers =
      dineInPhones.length > 0
        ? await db
            .select()
            .from(appUsers)
            .where(inArray(appUsers.phone, dineInPhones))
            .orderBy(desc(appUsers.createdAt))
        : [];

    const normalizedSearch = search?.trim().toLowerCase();

    const userById = new Map<number, AppUser>();
    const phoneToUserId = new Map<string, number>();

    for (const user of [...deliveryUsers, ...dineInUsers]) {
      userById.set(user.id, user);
      if (user.phone) {
        phoneToUserId.set(user.phone, user.id);
      }
    }

    let associatedUsers = Array.from(userById.values());

    if (normalizedSearch && normalizedSearch.length > 0) {
      associatedUsers = associatedUsers.filter((user) => {
        const name = user.name?.toLowerCase() ?? "";
        const phone = user.phone?.toLowerCase() ?? "";
        return name.includes(normalizedSearch) || phone.includes(normalizedSearch);
      });
    }

    if (associatedUsers.length === 0) {
      return [];
    }

    const associatedUserIds = associatedUsers.map((user) => user.id);
    const associatedPhones = associatedUsers
      .map((user) => user.phone?.trim())
      .filter((phone): phone is string => Boolean(phone && phone.length > 0));

    const deliveryCounts =
      associatedUserIds.length > 0
        ? await db
            .select({
              userId: deliveryOrders.userId,
              count: sql<number>`COUNT(*)`,
            })
            .from(deliveryOrders)
            .where(
              and(
                eq(deliveryOrders.vendorId, vendorId),
                inArray(deliveryOrders.userId, associatedUserIds),
              ),
            )
            .groupBy(deliveryOrders.userId)
        : [];

    const dineInCounts =
      associatedPhones.length > 0
        ? await db
            .select({
              phone: orders.customerPhone,
              count: sql<number>`COUNT(*)`,
            })
            .from(orders)
            .where(
              and(
                eq(orders.vendorId, vendorId),
                inArray(orders.customerPhone, associatedPhones),
              ),
            )
            .groupBy(orders.customerPhone)
        : [];

    const orderCounts = new Map<number, number>();

    for (const row of deliveryCounts) {
      if (row.userId == null) continue;
      orderCounts.set(row.userId, (orderCounts.get(row.userId) ?? 0) + Number(row.count ?? 0));
    }

    for (const row of dineInCounts) {
      const phone = typeof row.phone === "string" ? row.phone.trim() : "";
      if (!phone) continue;
      const userId = phoneToUserId.get(phone);
      if (!userId) continue;
      orderCounts.set(userId, (orderCounts.get(userId) ?? 0) + Number(row.count ?? 0));
    }

    return associatedUsers
      .map((user) => ({
        ...user,
        orderCount: orderCounts.get(user.id) ?? 0,
      }))
      .filter((user) => user.orderCount > 0)
      .sort((a, b) => {
        const aCreated = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
        const bCreated = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
        if (bCreated !== aCreated) {
          return bCreated - aCreated;
        }
        return b.orderCount - a.orderCount;
      });
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
