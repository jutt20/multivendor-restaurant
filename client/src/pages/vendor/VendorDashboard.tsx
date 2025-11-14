import { useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Grid3x3, Users, UtensilsCrossed, ShoppingCart, TrendingUp, Search } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SalesSummary, Order, KotTicket, AppUser } from "@shared/schema";
import { useOrderStream } from "@/hooks/useOrderStream";
import { StatusBadge } from "@/components/StatusBadge";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
} from "recharts";

type VendorProfileResponse = {
  vendor?: {
    isDeliveryEnabled?: boolean | null;
    isPickupEnabled?: boolean | null;
    isDeliveryAllowed?: boolean | null;
    isPickupAllowed?: boolean | null;
    paymentQrCodeUrl?: string | null;
  } | null;
};

type VendorRecentOrder = Order & {
  tableNumber?: number | null;
  vendorDetails?: {
    name?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    paymentQrCodeUrl?: string | null;
    gstin?: string | null;
  } | null;
  kotTicket?: KotTicket | null;
};

type PaginatedOrdersResponse<T> = {
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
};

const recentOrdersQueryKey = ["/api/vendor/orders", "recent"] as const;
const vendorCustomersQueryKey = ["/api/vendor/customers"] as const;

const formatINR = (value: number | string | null | undefined) => {
  if (value === null || value === undefined || value === "") {
    return "₹0.00";
  }
  const numeric = typeof value === "number" ? value : Number.parseFloat(String(value));
  const amount = Number.isFinite(numeric) ? numeric : 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(amount);
};

const coerceBoolean = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
  }
  return fallback;
};

const formatOrderTimestamp = (value: string | Date | null | undefined): string => {
  if (!value) return "—";
  const date = typeof value === "string" ? parseISO(value) : value;
  if (!date) return "—";

  try {
    return format(date, "dd MMM yyyy, hh:mm a");
  } catch {
    return "—";
  }
};

const formatLocation = (city?: string | null, state?: string | null) => {
  const parts = [city, state]
    .map((value) => (typeof value === "string" ? value.trim() : ""))
    .filter((value) => value.length > 0);

  if (parts.length === 0) {
    return "—";
  }

  return parts.join(", ");
};

const parseCurrencyToNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const numeric = Number.parseFloat(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

export default function VendorDashboard() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");

  useOrderStream({
    onEvent: (event) => {
      if (
        event.type === "order-created" ||
        event.type === "order-status-changed" ||
        event.type === "kot-created"
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/sales"] });
        queryClient.invalidateQueries({ queryKey: recentOrdersQueryKey });
      }
    },
  });

  const {
    data: vendorCustomers,
    isLoading: loadingCustomers,
    isFetching: fetchingCustomers,
  } = useQuery<(AppUser & { orderCount: number })[]>({
    queryKey: vendorCustomersQueryKey,
    queryFn: async () => {
      const response = await fetch("/api/vendor/customers", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch customers");
      }
      return (await response.json()) as (AppUser & { orderCount: number })[];
    },
    placeholderData: [],
  });

  // Poll for real-time stats updates
  const { data: stats, isLoading } = useQuery({
    queryKey: ["/api/vendor/stats"],
    refetchInterval: 10000, // 10 seconds
  });

  const { data: profile, isLoading: loadingProfile } = useQuery<VendorProfileResponse>({
    queryKey: ["/api/vendor/profile"],
  });

  const createDefaultRange = () => {
    const today = new Date();
    return { from: subDays(today, 6), to: today };
  };

  const [salesRange, setSalesRange] = useState<DateRange | undefined>(createDefaultRange);
  const [recentOrdersPage, setRecentOrdersPage] = useState(1);
  const [recentOrdersPageSize, setRecentOrdersPageSize] = useState<5 | 10>(5);

  const handleSalesRangeChange = (range: DateRange | undefined) => {
    if (!range?.from && !range?.to) {
      setSalesRange(createDefaultRange());
      return;
    }

    if (range?.from && !range.to) {
      setSalesRange({ from: range.from, to: range.from });
      return;
    }

    setSalesRange(range);
  };

  const startDateParam = salesRange?.from ? format(salesRange.from, "yyyy-MM-dd") : undefined;
  const endDateParam =
    salesRange?.to ? format(salesRange.to, "yyyy-MM-dd") : startDateParam;

  const {
    data: salesSummary,
    isLoading: loadingSales,
    isFetching: fetchingSales,
  } = useQuery<SalesSummary>({
    queryKey: ["/api/vendor/sales", startDateParam, endDateParam],
    queryFn: async ({ queryKey }) => {
      const [, start, end] = queryKey as [string, string | undefined, string | undefined];
      const params = new URLSearchParams();
      if (start) params.set("startDate", start);
      if (end) params.set("endDate", end);
      const query = params.toString();
      const response = await fetch(
        query ? `/api/vendor/sales?${query}` : "/api/vendor/sales",
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch sales summary");
      }
      return (await response.json()) as SalesSummary;
    },
    keepPreviousData: true,
  });

  const {
    data: recentOrdersData,
    isLoading: loadingRecentOrders,
    isFetching: fetchingRecentOrders,
  } = useQuery<PaginatedOrdersResponse<VendorRecentOrder>>({
    queryKey: [...recentOrdersQueryKey, recentOrdersPage, recentOrdersPageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(recentOrdersPageSize));
      params.set("page", String(recentOrdersPage));

      const response = await fetch(`/api/vendor/orders?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch recent orders");
      }

      const payload = await response.json();

      if (Array.isArray(payload)) {
        const data = payload as VendorRecentOrder[];
        const count = data.length;
        return {
          data,
          page: 1,
          pageSize: count,
          total: count,
          totalPages: count > 0 ? 1 : 0,
          hasNextPage: false,
          hasPreviousPage: false,
        };
      }

      return payload as PaginatedOrdersResponse<VendorRecentOrder>;
    },
    keepPreviousData: true,
  });

  const recentOrders = recentOrdersData?.data ?? [];
  const totalRecentOrders = recentOrdersData?.total ?? 0;
  const totalRecentPages =
    recentOrdersData && recentOrdersData.totalPages
      ? recentOrdersData.totalPages
      : totalRecentOrders > 0
        ? Math.ceil(totalRecentOrders / recentOrdersPageSize)
        : 0;
  const hasNextRecentPage =
    recentOrdersData?.hasNextPage ?? (totalRecentPages > 0 && recentOrdersPage < totalRecentPages);
  const hasPreviousRecentPage =
    recentOrdersData?.hasPreviousPage ?? recentOrdersPage > 1;

  const firstRecentOrderIndex =
    totalRecentOrders === 0 ? 0 : (recentOrdersPage - 1) * recentOrdersPageSize + 1;
  const lastRecentOrderIndex =
    totalRecentOrders === 0
      ? 0
      : Math.min(totalRecentOrders, firstRecentOrderIndex + recentOrders.length - 1);

  const searchQuery = searchTerm.trim().toLowerCase();
  const isSearching = searchQuery.length > 0;

  const filteredRecentOrders = useMemo(() => {
    if (!isSearching) return recentOrders;
    return recentOrders.filter((order) => {
      const values: Array<unknown> = [
        order.id,
        order.vendorId,
        order.tableId,
        order.tableNumber,
        order.customerId,
        order.customerName,
        order.customerPhone,
        order.status,
        order.totalAmount,
      ];

      if (
        values.some((value) =>
          String(value ?? "")
            .toLowerCase()
            .includes(searchQuery),
        )
      ) {
        return true;
      }

      return formatOrderTimestamp(order.createdAt).toLowerCase().includes(searchQuery);
    });
  }, [recentOrders, isSearching, searchQuery]);

  const filteredDailySales = useMemo(() => {
    if (!salesSummary?.daily) return [];
    if (!isSearching) return salesSummary.daily;
    return salesSummary.daily.filter((day) => {
      const formattedDate = format(parseISO(day.date), "LLL dd, yyyy");
      const values: Array<unknown> = [formattedDate, day.totalOrders, day.totalRevenue];
      return values.some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(searchQuery),
      );
    });
  }, [salesSummary, isSearching, searchQuery]);

  const vendorCustomerList = vendorCustomers ?? [];

  const filteredVendorCustomers = useMemo(() => {
    if (!isSearching) return vendorCustomerList;
    return vendorCustomerList.filter((customer) => {
      const createdAt =
        typeof customer.createdAt === "string" || customer.createdAt instanceof Date
          ? formatOrderTimestamp(customer.createdAt)
          : "";
      const values: Array<unknown> = [
        customer.id,
        customer.name,
        customer.phone,
        customer.email,
        customer.city,
        customer.state,
        customer.orderCount,
        createdAt,
      ];
      return values.some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(searchQuery),
      );
    });
  }, [vendorCustomerList, isSearching, searchQuery]);

  const dailyChartData = useMemo(() => {
    if (!salesSummary?.daily) return [];
    return salesSummary.daily.map((day) => ({
      dateLabel: format(parseISO(day.date), "MMM dd"),
      orders: day.totalOrders,
      revenue: parseCurrencyToNumber(day.totalRevenue),
    }));
  }, [salesSummary]);

  const hasDailyChartData = dailyChartData.length > 0;

  const fulfillmentMutation = useMutation({
    mutationFn: async (
      updates: Partial<{ isDeliveryEnabled: boolean; isPickupEnabled: boolean }>,
    ) => {
      const res = await apiRequest("PUT", "/api/vendor/profile", updates);
      return res.json() as Promise<VendorProfileResponse>;
    },
    onSuccess: (data) => {
      toast({ title: "Service settings updated" });
      if (data?.vendor) {
        queryClient.setQueryData<VendorProfileResponse | undefined>(
          ["/api/vendor/profile"],
          (prev) => ({
            vendor: {
              ...(prev?.vendor ?? {}),
              ...data.vendor,
            },
            user: prev?.user ?? data?.user ?? null,
          }),
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update settings",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const deliveryAllowed = coerceBoolean(profile?.vendor?.isDeliveryAllowed, false);
  const pickupAllowed = coerceBoolean(profile?.vendor?.isPickupAllowed, false);
  const deliveryEnabled = deliveryAllowed
    ? coerceBoolean(profile?.vendor?.isDeliveryEnabled, false)
    : false;
  const pickupEnabled = pickupAllowed
    ? coerceBoolean(profile?.vendor?.isPickupEnabled, false)
    : false;

  const statCards = [
    {
      title: "Total Tables",
      value: stats?.totalTables || 0,
      icon: Grid3x3,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950",
    },
    {
      title: "Active Captains",
      value: stats?.totalCaptains || 0,
      icon: Users,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-950",
    },
    {
      title: "Menu Items",
      value: stats?.totalMenuItems || 0,
      icon: UtensilsCrossed,
      color: "text-orange-600 dark:text-orange-400",
      bgColor: "bg-orange-50 dark:bg-orange-950",
    },
    {
      title: "Today's Orders",
      value: stats?.todayOrders || 0,
      icon: ShoppingCart,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-950",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Welcome back! Here's an overview of your restaurant.
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search across dashboard tables"
            className="pl-9"
          />
        </div>
        {isSearching && (
          <span className="text-sm text-muted-foreground">
            Filtering recent orders, sales, and customer history
          </span>
        )}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.title} className="hover-elevate">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold" data-testid={`stat-${stat.title.toLowerCase().replace(/'/g, '').replace(/\s+/g, '-')}`}>
                  {stat.value}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Revenue Trend</CardTitle>
            <CardDescription>Daily revenue across the selected range.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {loadingSales && !hasDailyChartData ? (
              <Skeleton className="h-[240px] w-full" />
            ) : hasDailyChartData ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={dailyChartData} margin={{ top: 10, left: -24, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} />
                  <YAxis
                    tickFormatter={(value) => formatINR(value).replace(".00", "")}
                    tickLine={false}
                    axisLine={false}
                    width={90}
                  />
                  <RechartsTooltip
                    labelFormatter={(label) => label}
                    formatter={(value) => [formatINR(value as number), "Revenue"]}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#2563eb" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No revenue data for this range.
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Order Volume</CardTitle>
            <CardDescription>Track fulfilled orders day by day.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {loadingSales && !hasDailyChartData ? (
              <Skeleton className="h-[240px] w-full" />
            ) : hasDailyChartData ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyChartData} margin={{ top: 10, left: -24, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="dateLabel" tickLine={false} axisLine={false} />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
                  <RechartsTooltip
                    labelFormatter={(label) => label}
                    formatter={(value) => [`${value} orders`, "Orders"]}
                  />
                  <Bar dataKey="orders" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No order data for this range.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <CardTitle>Recent Orders</CardTitle>
              <CardDescription>
                Stay on top of the latest orders placed in your restaurant.
              </CardDescription>
              {fetchingRecentOrders && !loadingRecentOrders && recentOrders.length > 0 && (
                <p className="text-xs text-muted-foreground">Refreshing…</p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="hidden text-sm text-muted-foreground sm:inline-block">Show</span>
              <Select
                value={String(recentOrdersPageSize)}
                onValueChange={(value) => {
                  const nextSize = Number.parseInt(value, 10) as 5 | 10;
                  setRecentOrdersPageSize(nextSize);
                  setRecentOrdersPage(1);
                }}
              >
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="Page size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Last 5</SelectItem>
                  <SelectItem value="10">Last 10</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {loadingRecentOrders && recentOrders.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : filteredRecentOrders.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {isSearching
                  ? "No recent orders match your search."
                  : "No recent orders. Orders will appear here once customers start ordering."}
              </div>
            ) : (
              <>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Order</TableHead>
                        <TableHead>Table</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                        <TableHead className="text-right">Status</TableHead>
                        <TableHead className="text-right">Placed</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredRecentOrders.map((order) => {
                        const tableRef = order.tableNumber ?? order.tableId;
                        const tableLabel = tableRef ? `Table ${tableRef}` : "—";
                        const customerLabel = order.customerName || order.customerPhone || "—";
                        return (
                          <TableRow key={order.id}>
                            <TableCell className="font-medium">#{order.id}</TableCell>
                            <TableCell>{tableLabel}</TableCell>
                            <TableCell>{customerLabel}</TableCell>
                            <TableCell className="text-right">{formatINR(order.totalAmount)}</TableCell>
                            <TableCell className="text-right">
                              <StatusBadge status={order.status as any} />
                            </TableCell>
                            <TableCell className="text-right text-sm text-muted-foreground">
                              {formatOrderTimestamp(order.createdAt)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <p className="text-sm text-muted-foreground">
                    {isSearching
                      ? `Showing ${filteredRecentOrders.length} matching order${filteredRecentOrders.length === 1 ? "" : "s"}`
                      : `Showing ${firstRecentOrderIndex}-${lastRecentOrderIndex} of ${totalRecentOrders} orders`}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRecentOrdersPage((prev) => Math.max(1, prev - 1))}
                      disabled={!hasPreviousRecentPage || isSearching}
                    >
                      Previous
                    </Button>
                    <span className="text-sm text-muted-foreground">
                      Page {totalRecentPages > 0 ? recentOrdersPage : 1} of {Math.max(totalRecentPages, 1)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setRecentOrdersPage((prev) => prev + 1)}
                      disabled={!hasNextRecentPage || isSearching}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Quick Stats
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Today's Revenue</span>
                <span className="text-lg font-semibold" data-testid="stat-revenue">
                  {formatINR(stats?.todayRevenue)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Average Order Value</span>
                <span className="text-lg font-semibold" data-testid="stat-avg-order">
                  {formatINR(stats?.avgOrderValue)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Active Tables</span>
                <span className="text-lg font-semibold" data-testid="stat-active-tables">
                  {stats?.activeTables || 0}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <CardTitle>Sales Overview</CardTitle>
            <CardDescription>
              Track orders and revenue for any date range.
            </CardDescription>
            {fetchingSales && !loadingSales && (
              <p className="text-xs text-muted-foreground">Refreshing…</p>
            )}
          </div>
          <DateRangePicker value={salesRange} onChange={handleSalesRangeChange} />
        </CardHeader>
        <CardContent>
          {loadingSales && !salesSummary ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : salesSummary ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Total Revenue</p>
                  <p className="text-2xl font-semibold">{formatINR(salesSummary.totals.totalRevenue)}</p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-semibold">
                    {salesSummary.totals.totalOrders}
                  </p>
                </div>
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Avg. Order Value</p>
                  <p className="text-2xl font-semibold">{formatINR(salesSummary.totals.averageOrderValue)}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Range:{" "}
                {format(parseISO(salesSummary.range.startDate), "LLL dd, yyyy")} –{" "}
                {format(parseISO(salesSummary.range.endDate), "LLL dd, yyyy")}
              </p>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead className="text-right">Orders</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredDailySales.length > 0 ? (
                      filteredDailySales.map((day) => (
                        <TableRow key={day.date}>
                          <TableCell>
                            {format(parseISO(day.date), "LLL dd, yyyy")}
                          </TableCell>
                          <TableCell className="text-right">{day.totalOrders}</TableCell>
                          <TableCell className="text-right">
                            {formatINR(day.totalRevenue)}
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                          {isSearching
                            ? "No daily sales match your search."
                            : "No sales recorded for this range yet."}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              {!isSearching && salesSummary.totals.totalOrders === 0 && (
                <p className="text-sm text-muted-foreground">
                  No sales recorded for this range yet.
                </p>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Unable to load sales data right now.
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Customer History</CardTitle>
            <CardDescription>Customers who have visited or ordered from your restaurant.</CardDescription>
            {fetchingCustomers && !loadingCustomers && vendorCustomerList.length > 0 && (
              <p className="text-xs text-muted-foreground">Refreshing…</p>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loadingCustomers && vendorCustomerList.length === 0 ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : vendorCustomerList.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No customers with order history yet. Customers will appear here once they place orders or visit.
            </div>
          ) : filteredVendorCustomers.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No customers match your search.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Total Orders</TableHead>
                    <TableHead className="text-right">First Seen</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredVendorCustomers.map((customer) => {
                    const phone = customer.phone || "—";
                    const createdAt =
                      typeof customer.createdAt === "string" || customer.createdAt instanceof Date
                        ? formatOrderTimestamp(customer.createdAt)
                        : "—";
                    return (
                      <TableRow key={customer.id}>
                        <TableCell className="font-medium">{customer.name}</TableCell>
                        <TableCell>{phone}</TableCell>
                        <TableCell>{formatLocation(customer.city, customer.state)}</TableCell>
                        <TableCell className="text-right">{customer.orderCount}</TableCell>
                        <TableCell className="text-right text-sm text-muted-foreground">{createdAt}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Service Availability</CardTitle>
          <CardDescription>Control which order channels are currently active.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
            <div>
              <p className="font-medium">Delivery</p>
              <p className="text-sm text-muted-foreground">
                Allow customers to place delivery orders.
              </p>
              {!deliveryAllowed && (
                <p className="text-xs text-destructive mt-1">
                  Delivery management must be enabled by the admin.
                </p>
              )}
            </div>
            {loadingProfile ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <Switch
                checked={deliveryEnabled}
                onCheckedChange={(checked) => {
                  if (!deliveryAllowed && checked) return;
                  fulfillmentMutation.mutate({
                    isDeliveryEnabled: deliveryAllowed ? checked : false,
                  });
                }}
                disabled={!deliveryAllowed || fulfillmentMutation.isPending}
              />
            )}
          </div>
          <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
            <div>
              <p className="font-medium">Pickup</p>
              <p className="text-sm text-muted-foreground">
                Allow customers to pick up their orders.
              </p>
              {!pickupAllowed && (
                <p className="text-xs text-destructive mt-1">
                  Pickup management must be enabled by the admin.
                </p>
              )}
            </div>
            {loadingProfile ? (
              <Skeleton className="h-6 w-12" />
            ) : (
              <Switch
                checked={pickupEnabled}
                onCheckedChange={(checked) => {
                  if (!pickupAllowed && checked) return;
                  fulfillmentMutation.mutate({
                    isPickupEnabled: pickupAllowed ? checked : false,
                  });
                }}
                disabled={!pickupAllowed || fulfillmentMutation.isPending}
              />
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
