import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Store, Users, ShoppingCart, TrendingUp, CheckCircle, XCircle } from "lucide-react";
import type { Vendor } from "@shared/schema";

export default function AdminDashboard() {
  // Poll for real-time stats updates
  const { data: stats, isLoading: loadingStats } = useQuery({
    queryKey: ["/api/admin/stats"],
    refetchInterval: 10000, // 10 seconds
  });

  const { data: pendingVendors, isLoading: loadingVendors } = useQuery<Vendor[]>({
    queryKey: ["/api/admin/vendors/pending"],
    refetchInterval: 10000, // 10 seconds
  });

  const statCards = [
    {
      title: "Total Vendors",
      value: stats?.totalVendors || 0,
      icon: Store,
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-950",
    },
    {
      title: "Pending Approvals",
      value: stats?.pendingVendors || 0,
      icon: Users,
      color: "text-yellow-600 dark:text-yellow-400",
      bgColor: "bg-yellow-50 dark:bg-yellow-950",
    },
    {
      title: "Total Orders",
      value: stats?.totalOrders || 0,
      icon: ShoppingCart,
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-950",
    },
    {
      title: "Platform Revenue",
      value: `$${stats?.platformRevenue || '0.00'}`,
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
              <Button variant="link" asChild className="w-full mt-4">
                <a href="/admin/vendors">View all {pendingVendors.length} pending approvals</a>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
