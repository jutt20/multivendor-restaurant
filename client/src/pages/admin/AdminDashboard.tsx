import { useMemo, useState } from "react";
import { DateRange } from "react-day-picker";
import { useQuery, useMutation } from "@tanstack/react-query";
import { format, parseISO, subDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Store, Users, ShoppingCart, TrendingUp } from "lucide-react";
import { DateRangePicker } from "@/components/DateRangePicker";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Vendor, AdminSalesSummary, Order } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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

type AdminStats = {
  totalVendors: number;
  pendingVendors: number;
  totalOrders: number;
  platformRevenue: string;
};

type AdminRecentOrder = Order & {
  vendorName?: string | null;
  vendorPhone?: string | null;
  tableNumber?: number | null;
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

const adminRecentOrdersQueryKey = ["/api/admin/orders"] as const;

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

const parseCurrencyToNumber = (value: string | number | null | undefined): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return value;
  const numeric = Number.parseFloat(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : 0;
};

export default function AdminDashboard() {
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  // Poll for real-time stats updates
  const { data: stats, isLoading: loadingStats } = useQuery<AdminStats>({
    queryKey: ["/api/admin/stats"],
    queryFn: async (): Promise<AdminStats> => {
      const response = await fetch("/api/admin/stats", { credentials: "include" });
      if (!response.ok) {
        throw new Error("Failed to fetch admin stats");
      }
      return (await response.json()) as AdminStats;
    },
    refetchInterval: 10000, // 10 seconds
  });

  const { data: pendingVendors } = useQuery<Vendor[]>({
    queryKey: ["/api/admin/vendors/pending"],
    queryFn: async (): Promise<Vendor[]> => {
      const response = await fetch("/api/admin/vendors/pending", {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error("Failed to fetch pending vendors");
      }
      return (await response.json()) as Vendor[];
    },
    refetchInterval: 10000, // 10 seconds
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
  } = useQuery<AdminSalesSummary>({
    queryKey: ["/api/admin/sales", startDateParam, endDateParam],
    queryFn: async ({ queryKey }): Promise<AdminSalesSummary> => {
      const [, start, end] = queryKey as [string, string | undefined, string | undefined];
      const params = new URLSearchParams();
      if (start) params.set("startDate", start);
      if (end) params.set("endDate", end);
      const query = params.toString();
      const response = await fetch(
        query ? `/api/admin/sales?${query}` : "/api/admin/sales",
        { credentials: "include" },
      );
      if (!response.ok) {
        throw new Error("Failed to fetch sales summary");
      }
      return (await response.json()) as AdminSalesSummary;
    },
    placeholderData: (previousData) => previousData,
  });

  const {
    data: recentOrdersData,
    isLoading: loadingRecentOrders,
    isFetching: fetchingRecentOrders,
  } = useQuery<PaginatedOrdersResponse<AdminRecentOrder>>({
    queryKey: [...adminRecentOrdersQueryKey, recentOrdersPage, recentOrdersPageSize],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", String(recentOrdersPageSize));
      params.set("page", String(recentOrdersPage));

      const response = await fetch(`/api/admin/orders?${params.toString()}`, {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to fetch recent orders");
      }

      const payload = await response.json();

      if (Array.isArray(payload)) {
        const data = payload as AdminRecentOrder[];
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

      return payload as PaginatedOrdersResponse<AdminRecentOrder>;
    },
    keepPreviousData: true,
    refetchInterval: 10000,
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
        order.vendorName,
        order.vendorPhone,
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

  const filteredVendorBreakdown = useMemo(() => {
    if (!salesSummary?.vendorBreakdown) return [];
    if (!isSearching) return salesSummary.vendorBreakdown;
    return salesSummary.vendorBreakdown.filter((vendor) => {
      const values: Array<unknown> = [
        vendor.vendorId,
        vendor.vendorName,
        vendor.totalOrders,
        vendor.totalRevenue,
      ];
      return values.some((value) =>
        String(value ?? "")
          .toLowerCase()
          .includes(searchQuery),
      );
    });
  }, [salesSummary, isSearching, searchQuery]);

  const dailyChartData = useMemo(() => {
    if (!salesSummary?.daily) return [];
    return salesSummary.daily.map((day) => ({
      dateLabel: format(parseISO(day.date), "MMM dd"),
      orders: day.totalOrders,
      revenue: parseCurrencyToNumber(day.totalRevenue),
    }));
  }, [salesSummary]);

  const topVendorChartData = useMemo(() => {
    if (!salesSummary?.vendorBreakdown) return [];
    return salesSummary.vendorBreakdown
      .map((vendor) => ({
        name: vendor.vendorName,
        revenue: parseCurrencyToNumber(vendor.totalRevenue),
        orders: vendor.totalOrders,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6);
  }, [salesSummary]);

  const hasDailyChartData = dailyChartData.length > 0;

  const clearSessionsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("DELETE", "/api/admin/sessions");
      return (await response.json()) as { message?: string; clearedCount?: number };
    },
    onSuccess: (data) => {
      const cleared = typeof data?.clearedCount === "number" ? data.clearedCount : undefined;
      toast({
        title: "Sessions cleared",
        description:
          data?.message ??
          (cleared !== undefined
            ? `Cleared ${cleared} session${cleared === 1 ? "" : "s"}.`
            : "All sessions were cleared successfully."),
      });
    },
    onError: (error) => {
      toast({
        title: "Failed to clear sessions",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    },
  });

  const statCards = [
    {
      title: "Total Vendors",
      value: stats?.totalVendors ?? 0,
      icon: Store,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950",
    },
    {
      title: "Pending Approvals",
      value: stats?.pendingVendors ?? 0,
      icon: Users,
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-50 dark:bg-yellow-950",
    },
    {
      title: "Total Orders",
      value: stats?.totalOrders ?? 0,
      icon: ShoppingCart,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-950",
    },
    {
      title: "Platform Revenue",
    value: formatINR(stats?.platformRevenue),
      icon: TrendingUp,
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-950",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-2">
          Platform-wide analytics and vendor management
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
        {searchTerm.trim().length > 0 && (
          <span className="text-sm text-muted-foreground">
            Showing matches across recent orders, sales, and vendor tables
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
                <div className="text-3xl font-bold" data-testid={`stat-${stat.title.toLowerCase().replace(/\s+/g, '-')}`}>
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
            <CardDescription>Platform-wide daily revenue for the selected range.</CardDescription>
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
                  <Line type="monotone" dataKey="revenue" stroke="#7c3aed" strokeWidth={2} dot={false} />
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
            <CardTitle>Top Vendors by Revenue</CardTitle>
            <CardDescription>Leading contributors in the selected period.</CardDescription>
          </CardHeader>
          <CardContent className="h-[280px]">
            {loadingSales && topVendorChartData.length === 0 ? (
              <Skeleton className="h-[240px] w-full" />
            ) : topVendorChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topVendorChartData}
                  layout="vertical"
                  margin={{ top: 10, left: 0, right: 20 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    type="number"
                    tickFormatter={(value) => formatINR(value).replace(".00", "")}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={140}
                    axisLine={false}
                    tickLine={false}
                  />
                  <RechartsTooltip
                    formatter={(value) => [formatINR(value as number), "Revenue"]}
                    labelFormatter={(value) => value as string}
                  />
                  <Bar dataKey="revenue" fill="#10b981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No vendor revenue data available.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <CardTitle>Recent Orders</CardTitle>
            <CardDescription>
              Monitor the most recent orders placed across the platform.
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
                : "No recent orders yet. New orders will appear here automatically."}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Table</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Status</TableHead>
                      <TableHead className="text-right">Placed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecentOrders.map((order) => {
                      const vendorLabel =
                        order.vendorName ?? `Vendor #${order.vendorId}`;
                      const tableRef = order.tableNumber ?? order.tableId;
                      const tableLabel = tableRef ? `Table ${tableRef}` : "—";
                      const customerLabel = order.customerName || order.customerPhone || "—";
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">#{order.id}</TableCell>
                          <TableCell>{vendorLabel}</TableCell>
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
              <div className="mt-4 flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
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
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1">
            <CardTitle>Session Management</CardTitle>
            <CardDescription>
              Force logout every active user session across the platform.
            </CardDescription>
          </div>
          <div>
            <Button
              variant="destructive"
              onClick={() => clearSessionsMutation.mutate()}
              disabled={clearSessionsMutation.isPending}
            >
              {clearSessionsMutation.isPending ? "Clearing..." : "Clear All Sessions"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Use this action when you need to require all users to log in again, such as after updating
          permissions or resetting credentials.
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="space-y-1">
            <CardTitle>Sales Overview</CardTitle>
            <CardDescription>
              Filter platform-wide sales by specific dates or ranges.
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
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : salesSummary ? (
            <div className="space-y-6">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
                <div className="rounded-lg border bg-muted/40 p-4">
                  <p className="text-sm text-muted-foreground">Vendors with Orders</p>
                  <p className="text-2xl font-semibold">
                    {salesSummary.vendorBreakdown.length}
                  </p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                Range:{" "}
                {format(parseISO(salesSummary.range.startDate), "LLL dd, yyyy")} –{" "}
                {format(parseISO(salesSummary.range.endDate), "LLL dd, yyyy")}
              </p>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Daily Sales
                  </h3>
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
                              <TableCell className="text-right">
                                {day.totalOrders}
                              </TableCell>
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
                </div>
                <div className="space-y-2">
                  <h3 className="text-sm font-medium text-muted-foreground">
                    Top Vendors
                  </h3>
                  <div className="overflow-x-auto rounded-lg border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Vendor</TableHead>
                          <TableHead className="text-right">Orders</TableHead>
                          <TableHead className="text-right">Revenue</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredVendorBreakdown.length > 0 ? (
                          filteredVendorBreakdown.slice(0, 10).map((vendor) => (
                            <TableRow key={vendor.vendorId}>
                              <TableCell>{vendor.vendorName}</TableCell>
                              <TableCell className="text-right">
                                {vendor.totalOrders}
                              </TableCell>
                              <TableCell className="text-right">
                                {formatINR(vendor.totalRevenue)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={3} className="text-center text-sm text-muted-foreground">
                              {isSearching
                                ? "No vendors match your search."
                                : "No vendor sales in this range."}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">
              Unable to load sales data right now.
            </div>
          )}
        </CardContent>
      </Card>

      {pendingVendors && pendingVendors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Vendor Approvals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingVendors.slice(0, 5).map((vendor) => (
                <div
                  key={vendor.id}
                  className="flex items-center justify-between p-3 border rounded-lg"
                  data-testid={`vendor-pending-${vendor.id}`}
                >
                  <div>
                    <p className="font-semibold">{vendor.restaurantName}</p>
                    <p className="text-sm text-muted-foreground">{vendor.cuisineType}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" asChild>
                      <a href={`/admin/vendors?review=${vendor.id}`}>Review</a>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            {pendingVendors.length > 5 && (
              <Button variant="ghost" asChild className="w-full mt-4 underline-offset-2 hover:underline">
                <a href="/admin/vendors">View all {pendingVendors.length} pending approvals</a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
