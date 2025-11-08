import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { Grid3x3, Clock, Printer } from "lucide-react";
import { printThermalReceipt } from "@/lib/receipt-utils";
import { useToast } from "@/hooks/use-toast";
import type { Table, Order } from "@shared/schema";

interface TableWithOrders extends Table {
  currentOrders?: Order[];
}

export default function CaptainDashboard() {
  const { toast } = useToast();

  // Poll for table updates every 5 seconds for real-time order visibility
  const { data: assignedTables, isLoading } = useQuery<TableWithOrders[]>({
    queryKey: ["/api/captain/tables"],
    refetchInterval: 5000,
  });

  const handlePrintReceipt = (order: Order) => {
    try {
      const items = Array.isArray(order.items) ? order.items.map((item: any) => ({
        name: item.name || 'Item',
        quantity: item.quantity || 1,
        price: parseFloat(item.subtotal) / (item.quantity || 1),
      })) : [];

      printThermalReceipt({
        order,
        items,
        restaurantName: 'QuickBite QR',
      });
      
      toast({
        title: "Success",
        description: "Receipt sent to printer",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to print receipt",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">My Assigned Tables</h1>
        <p className="text-muted-foreground mt-2">
          Manage orders for your assigned tables
        </p>
      </div>

      {isLoading ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : assignedTables && assignedTables.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {assignedTables.map((table) => (
            <Card key={table.id} className="hover-elevate" data-testid={`card-table-${table.id}`}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between">
                  <span className="text-2xl font-mono">Table {table.tableNumber}</span>
                  {table.currentOrders && table.currentOrders.length > 0 ? (
                    <span className="text-sm font-normal bg-primary/10 text-primary px-2 py-1 rounded">
                      {table.currentOrders.length} order{table.currentOrders.length !== 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-sm font-normal text-muted-foreground">Empty</span>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {table.currentOrders && table.currentOrders.length > 0 ? (
                  table.currentOrders.map((order) => (
                    <div key={order.id} className="border rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">Order #{order.id}</span>
                        <StatusBadge status={order.status as any} />
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(order.createdAt!).toLocaleTimeString()}
                      </div>
                      <div className="text-sm font-mono font-semibold">
                        ${order.totalAmount}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-2"
                        onClick={() => handlePrintReceipt(order)}
                        data-testid={`button-print-receipt-${order.id}`}
                      >
                        <Printer className="h-3 w-3 mr-1" />
                        Print Receipt
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    No active orders
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <Grid3x3 className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No tables assigned</h3>
            <p className="text-sm text-muted-foreground">
              Contact your manager to get table assignments
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
