import { useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Grid3x3, Users, ShoppingCart, TrendingUp } from "lucide-react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import type { SalesSummary, Order, AppUser } from "@shared/schema";
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
    restaurantName?: string | null;
  } | null;
};

type OwnerRecentOrder = Order & {
  tableNumber?: number | null;
  customerPhone?: string | null;
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

const recentOrdersQueryKey = ["/api/vendor/orders", "owner", "recent"] as const;
const vendorCustomersQueryKey = ["/api/vendor/customers", "owner"] as const;

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

export default function OwnerDashboard() {
  const [searchTerm, setSearchTerm] = useState("");

  const { data: profile } = useQuery<VendorProfileResponse>({
    queryKey: ["/api/vendor/profile", "owner"],
    queryFn: async () => {
      const res = await fetch("/api/vendor/profile", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to fetch owner profile");
      }
      return res.json() as Promise<VendorProfileResponse>;
    },
    staleTime: 15_000,
  });

  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["/api/vendor/stats", "owner"],
    queryFn: async () => {
      const res = await fetch("/api/vendor/stats", { credentials: "include" });
      if (!res.ok) {
        throw new Error("Failed to load stats");
      }
      return res.json() as Record<string, number>;
    },
    refetchInterval: 10_000,
  });

  const createDefaultRange = () => {
    const today = new Date();
    return { from: subDays(today, 6), to: today };
  };

  const [salesRange, setSalesRange] = useState<DateRange | undefined>(createDefaultRange);
  const recentOrdersPage = 1;
  const recentOrdersPageSize: 5 | 10 = 5;

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
  const endDateParam = salesRange?.to ? format(salesRange.to, "yyyy-MM-dd") : startDateParam;

  const {
    data: salesSummary,
    isLoading: loadingSales,
    isFetching: fetchingSales,
  } = useQuery<SalesSummary>({
    queryKey: ["/api/vendor/sales/owner", startDateParam, endDateParam],
    queryFn: async ({ queryKey }) => {
      const [, start, end] = queryKey as [string, string | undefined, string | undefined];
      const params = new URLSearchParams();
      if (start) params.set("startDate", start);
      if (end) params.set("endDate", end);
      const response = await fetch(
        params.size > 0 ? `/api/vendor/sales?${params}` : "/api/vendor/sales",
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
  } = useQuery<PaginatedOrdersResponse<OwnerRecentOrder>>({
    queryKey: [...recentOrdersQueryKey, recentOrdersPage, recentOrdersPageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(recentOrdersPageSize));
      params.set("page", String(recentOrdersPage));

      const response = await fetch(`/api/vendor/orders?${params}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch recent orders");
      }

      const payload = await response.json();

      if (Array.isArray(payload)) {
        const data = payload as OwnerRecentOrder[];
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

      return payload as PaginatedOrdersResponse<OwnerRecentOrder>;
    },
    keepPreviousData: true,
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

  const recentOrders = recentOrdersData?.data ?? [];
  const totalRecentOrders = recentOrdersData?.total ?? 0;
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
      title: "Today's Orders",
      value: stats?.todayOrders || 0,
      icon: ShoppingCart,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-950",
    },
    {
      title: "Revenue Today",
      value: formatINR(stats?.todayRevenue),
      icon: TrendingUp,
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-50 dark:bg-amber-950",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Owner Insights</h1>
        <p className="text-muted-foreground mt-2">
          Read-only overview of {profile?.vendor?.restaurantName ?? "your restaurant"}.
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
              {loadingStats ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold">
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
                <div className="mt-4 text-sm text-muted-foreground">
                  {isSearching
                    ? `Showing ${filteredRecentOrders.length} matching order${filteredRecentOrders.length === 1 ? "" : "s"}`
                    : `Showing ${firstRecentOrderIndex}-${lastRecentOrderIndex} of ${totalRecentOrders} orders`}
                </div>
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Customer History</CardTitle>
            <CardDescription>Customers who have visited or ordered from your restaurant.</CardDescription>
            {fetchingCustomers && !loadingCustomers && vendorCustomerList.length > 0 && (
              <p className="text-xs text-muted-foreground">Refreshing…</p>
            )}
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
      </div>
    </div>
  );
}