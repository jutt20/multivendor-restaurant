import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Clock, Printer } from "lucide-react";
import { printThermalReceipt } from "@/lib/receipt-utils";
import type { Order } from "@shared/schema";

export default function OrderManagement() {
  const { toast } = useToast();

  /** ✅ Handle Print Receipt */
  const handlePrintReceipt = (order: Order) => {
    try {
      const items = Array.isArray(order.items)
        ? order.items.map((item: any) => ({
            name: item.name || "Item",
            quantity: Number(item.quantity) || 1,
            price: Number(item.price) || 0,
          }))
        : [];

      // Use vendorDetails from order if available
      printThermalReceipt({
        order,
        items,
        restaurantName: order.vendorDetails?.name,
        restaurantAddress: order.vendorDetails?.address,
        restaurantPhone: order.vendorDetails?.phone,
      });

      toast({
        title: "Success",
        description: "Receipt sent to printer",
      });
    } catch (error) {
      console.error("Receipt print error:", error);
      toast({
        title: "Error",
        description: "Failed to print receipt",
        variant: "destructive",
      });
    }
  };

  /** ✅ Realtime order fetching (poll every 5s) */
  const { data: orders, isLoading } = useQuery<Order[]>({
    queryKey: ["/api/vendor/orders"],
    refetchInterval: 5000,
  });

  /** ✅ Update order status mutation */
  const updateStatusMutation = useMutation({
    mutationFn: async ({ orderId, status }: { orderId: number; status: string }) => {
      return await apiRequest("PUT", `/api/vendor/orders/${orderId}/status`, { status });
    },
    onMutate: async ({ orderId, status }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/vendor/orders"] });
      const previousOrders = queryClient.getQueryData<Order[]>(["/api/vendor/orders"]);

      queryClient.setQueryData<Order[]>(["/api/vendor/orders"], (old) =>
        old
          ? old.map((o) => (o.id === orderId ? { ...o, status } : o))
          : old
      );

      return { previousOrders };
    },
    onError: (_, __, context) => {
      if (context?.previousOrders) {
        queryClient.setQueryData(["/api/vendor/orders"], context.previousOrders);
      }
      toast({
        title: "Error",
        description: "Failed to update order status",
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Order status updated",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/orders"] });
    },
  });

  /** ✅ Workflow helpers */
  const getNextStatus = (current: string) => {
    const flow = ["pending", "accepted", "preparing", "ready", "delivered"];
    const idx = flow.indexOf(current);
    return flow[idx + 1] || current;
  };

  const canAdvanceStatus = (status: string) => status !== "delivered";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Order Management</h1>
        <p className="text-muted-foreground mt-2">
          Track and manage all dine-in orders
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      ) : orders && orders.length > 0 ? (
        <div className="space-y-4">
          {orders.map((order) => (
            <Card
              key={order.id}
              className="hover-elevate"
              data-testid={`card-order-${order.id}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="flex items-center gap-3">
                      <span>Order #{order.id}</span>
                      <StatusBadge status={order.status as any} />
                    </CardTitle>

                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-4 w-4" />
                        {new Date(order.createdAt!).toLocaleString()}
                      </div>
                      <div className="flex items-center gap-1.5 font-semibold text-green-600">
                        ₹{order.totalAmount}
                      </div>
                    </div>
                  </div>

                  {canAdvanceStatus(order.status) && (
                    <Button
                      size="sm"
                      onClick={() =>
                        updateStatusMutation.mutate({
                          orderId: order.id,
                          status: getNextStatus(order.status),
                        })
                      }
                      disabled={updateStatusMutation.isPending}
                    >
                      Mark as {getNextStatus(order.status)}
                    </Button>
                  )}
                </div>
              </CardHeader>

              <CardContent>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">Customer:</span>{" "}
                      <span className="font-medium">
                        {order.customerName || "Guest"}
                      </span>
                    </div>
                    {order.customerPhone && (
                      <div>
                        <span className="text-muted-foreground">Phone:</span>{" "}
                        <span className="font-medium">{order.customerPhone}</span>
                      </div>
                    )}
                  </div>

                  <div className="border-t pt-3">
                    <h4 className="font-semibold text-sm mb-2">Order Items</h4>
                    <div className="space-y-2">
                      {Array.isArray(order.items) &&
                        order.items.map((item: any, idx: number) => (
                          <div
                            key={idx}
                            className="flex justify-between text-sm"
                          >
                            <span>
                              {item.quantity}x {item.name}
                            </span>
                            <span className="font-mono">
                              ₹{(item.price * item.quantity).toFixed(2)}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {order.customerNotes && (
                    <div className="border-t pt-3">
                      <span className="text-sm text-muted-foreground">Notes: </span>
                      <span className="text-sm">{order.customerNotes}</span>
                    </div>
                  )}

                  <div className="border-t pt-3 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handlePrintReceipt(order)}
                    >
                      <Printer className="h-4 w-4 mr-2" />
                      Print Receipt
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Clock className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No orders yet</h3>
            <p className="text-sm text-muted-foreground">
              Orders will appear here when customers start placing them
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
