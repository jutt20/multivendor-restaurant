import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Clock, ChefHat, Plus, UtensilsCrossed } from "lucide-react";
import type { MenuCategory, MenuItem, Order, Table, KotTicket } from "@shared/schema";
import { useOrderStream } from "@/hooks/useOrderStream";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { printA4Kot, printThermalReceipt } from "@/lib/receipt-utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import ManualOrderDialog from "@/components/orders/ManualOrderDialog";

type CaptainOrder = Order & {
  tableNumber: number | null;
  vendorDetails?: {
    name: string | null;
    address?: string | null;
    phone?: string | null;
    gstin?: string | null;
  } | null;
  kotTicket?: KotTicket | null;
};

type CaptainTable = Table & {
  label?: string | null;
};

type OrderItem = {
  name?: string;
  quantity?: number;
  price?: number;
  subtotal?: number;
};

const parseOrderItems = (order: Order): OrderItem[] => {
  if (Array.isArray(order.items)) {
    return order.items as OrderItem[];
  }

  if (typeof order.items === "string") {
    try {
      const parsed = JSON.parse(order.items);
      return Array.isArray(parsed) ? (parsed as OrderItem[]) : [];
    } catch {
      return [];
    }
  }

  return [];
};

export default function CaptainOrders() {
  const { toast } = useToast();
  const { data: orders, isLoading } = useQuery<CaptainOrder[]>({
    queryKey: ["/api/captain/orders"],
    refetchInterval: 5000,
  });

  const { data: tables, isLoading: loadingTables } = useQuery<CaptainTable[]>({
    queryKey: ["/api/captain/tables"],
    refetchInterval: 5000,
  });

  const { data: menuItems, isLoading: loadingMenuItems } = useQuery<MenuItem[]>({
    queryKey: ["/api/captain/menu/items"],
  });

  const { data: categories, isLoading: loadingCategories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/captain/menu/categories"],
  });

  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printTargetOrder, setPrintTargetOrder] = useState<CaptainOrder | null>(null);
  const [kotFormat, setKotFormat] = useState<"thermal" | "a4">("thermal");

  const tableOptions = useMemo(
    () =>
      (tables ?? []).map((table) => ({
        id: table.id,
        tableNumber: table.tableNumber,
        label: table.label ?? undefined,
      })),
    [tables],
  );

  const manualOrderMenuItems = useMemo(() => menuItems ?? [], [menuItems]);
  const manualOrderDisabled = loadingTables || loadingMenuItems || loadingCategories;

  const handlePrintKot = () => {
    if (!printTargetOrder) {
      return;
    }

    try {
      const items = parseOrderItems(printTargetOrder);
      if (kotFormat === "thermal") {
        printThermalReceipt({
          order: printTargetOrder,
          items,
          restaurantName: printTargetOrder.vendorDetails?.name ?? undefined,
          restaurantAddress: printTargetOrder.vendorDetails?.address ?? undefined,
          restaurantPhone: printTargetOrder.vendorDetails?.phone ?? undefined,
          restaurantGstin: printTargetOrder.vendorDetails?.gstin ?? undefined,
          title: "Kitchen Order Ticket",
          ticketNumber: printTargetOrder.kotTicket?.ticketNumber ?? `KOT-${printTargetOrder.id}`,
          hidePricing: true,
        });
      } else {
        printA4Kot({
          order: printTargetOrder,
          items,
          restaurantName: printTargetOrder.vendorDetails?.name ?? undefined,
          restaurantAddress: printTargetOrder.vendorDetails?.address ?? undefined,
          restaurantPhone: printTargetOrder.vendorDetails?.phone ?? undefined,
          restaurantGstin: printTargetOrder.vendorDetails?.gstin ?? undefined,
          title: "Kitchen Order Ticket",
          ticketNumber: printTargetOrder.kotTicket?.ticketNumber ?? `KOT-${printTargetOrder.id}`,
          hidePricing: true,
        });
      }
      toast({
        title: "KOT ready",
        description: `${kotFormat === "thermal" ? "Thermal" : "A4"} ticket sent to printer.`,
      });
      closePrintDialog();
    } catch (error) {
      console.error("Captain KOT print error:", error);
      toast({
        title: "Print failed",
        description: "Could not print the kitchen order ticket. Please try again.",
        variant: "destructive",
      });
    }
  };

  const openPrintDialog = (order: CaptainOrder) => {
    setPrintTargetOrder(order);
    setKotFormat("thermal");
    setPrintDialogOpen(true);
  };

  const closePrintDialog = () => {
    setPrintDialogOpen(false);
    setPrintTargetOrder(null);
  };

  useOrderStream({
    onEvent: (event) => {
      if (
        event.type === "order-created" ||
        event.type === "order-status-changed" ||
        event.type === "kot-created"
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
      }
    },
  });

  const activeOrders = useMemo(
    () => (orders ?? []).filter((order) => order.status !== "delivered"),
    [orders],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold">Orders</h1>
          <p className="text-muted-foreground mt-2">
            View and manage dine-in orders for your assigned tables
          </p>
        </div>
        <ManualOrderDialog
          trigger={
            <Button disabled={manualOrderDisabled}>
              <Plus className="mr-2 h-4 w-4" />
              Create Order
            </Button>
          }
          tables={tableOptions}
          menuItems={manualOrderMenuItems}
          categories={categories ?? []}
          submitEndpoint="/api/captain/orders"
          tablesLoading={loadingTables}
          itemsLoading={loadingMenuItems || loadingCategories}
          invalidateQueryKeys={[["/api/captain/orders"], ["/api/captain/tables"]]}
        />
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-40 w-full" />
          ))}
        </div>
      ) : orders && orders.length > 0 ? (
        <div className="space-y-4">
          {orders.map((order) => {
            const items = parseOrderItems(order);
            const tableLabel =
              order.tableNumber !== null && order.tableNumber !== undefined
                ? `Table ${order.tableNumber}`
                : "Unassigned Table";

            return (
              <Card
                key={order.id}
                className="hover-elevate"
                data-testid={`card-captain-order-${order.id}`}
              >
                <CardHeader>
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="space-y-1">
                      <CardTitle className="flex items-center gap-3">
                        <span>
                          Order #{order.id} · {tableLabel}
                        </span>
                        <StatusBadge status={order.status as any} />
                      </CardTitle>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <Clock className="h-4 w-4" />
                          {order.createdAt
                            ? new Date(order.createdAt).toLocaleString()
                            : "Pending"}
                        </div>
                        <div className="font-semibold text-green-600">
                          ₹{order.totalAmount}
                        </div>
                        {order.customerName && (
                          <div className="text-sm">
                            Customer:{" "}
                            <span className="font-medium">
                              {order.customerName}
                            </span>
                          </div>
                        )}
                        {order.customerPhone && (
                          <div className="text-sm">
                            Phone:{" "}
                            <span className="font-medium">
                              {order.customerPhone}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="border-t pt-3">
                    <h4 className="font-semibold text-sm mb-2">Order Items</h4>
                    <div className="space-y-2">
                      {items.length > 0 ? (
                        items.map((item, index) => (
                          <div
                            key={`${order.id}-item-${index}`}
                            className="flex justify-between text-sm"
                          >
                            <span>
                              {item.quantity ?? 1}× {item.name ?? "Item"}
                            </span>
                            <span className="font-mono">
                              ₹{(
                                Number(item.price ?? 0) *
                                Number(item.quantity ?? 1)
                              ).toFixed(2)}
                            </span>
                          </div>
                        ))
                      ) : (
                        <p className="text-sm text-muted-foreground italic">
                          No items recorded for this order.
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="border-t pt-3">
                    <div className="flex items-center justify-between text-sm font-semibold">
                      <span>Kitchen Order Ticket</span>
                      {order.kotTicket?.createdAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(order.kotTicket.createdAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {order.kotTicket
                        ? `KOT #${order.kotTicket.ticketNumber}`
                        : "Generating KOT..."}
                    </div>
                    {order.kotTicket?.customerNotes && (
                      <p className="text-sm text-muted-foreground mt-2">
                        {order.kotTicket.customerNotes}
                      </p>
                    )}
                    <Button
                      variant="secondary"
                      size="sm"
                      className="mt-3 w-full md:w-auto"
                      onClick={() => openPrintDialog(order)}
                      disabled={!order.kotTicket}
                    >
                      <ChefHat className="mr-2 h-4 w-4" />
                      Print KOT
                    </Button>
                  </div>

                  {order.customerNotes && (
                    <div className="border-t pt-3">
                      <h4 className="font-semibold text-sm mb-2">
                        Customer Notes
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {order.customerNotes}
                      </p>
                    </div>
                  )}

                  {order.vendorNotes && (
                    <div className="border-t pt-3">
                      <h4 className="font-semibold text-sm mb-2">
                        Vendor Notes
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        {order.vendorNotes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center space-y-4">
            <UtensilsCrossed className="h-16 w-16 text-muted-foreground" />
            <div>
              <h3 className="text-lg font-semibold mb-1">
                No orders to display
              </h3>
              <p className="text-sm text-muted-foreground">
                Orders placed for your tables will appear here.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {activeOrders.length === 0 && orders && orders.length > 0 && (
        <Card>
          <CardContent className="py-4 text-sm text-muted-foreground text-center">
            All orders have been delivered. New orders will appear here
            automatically.
          </CardContent>
        </Card>
      )}

      <Dialog open={printDialogOpen} onOpenChange={(open) => (open ? setPrintDialogOpen(true) : closePrintDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Print Kitchen Ticket</DialogTitle>
            <DialogDescription>
              Choose the preferred format before sending the ticket to the kitchen.
            </DialogDescription>
          </DialogHeader>

          {printTargetOrder && (
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-4 text-sm">
                <div className="font-semibold">Order #{printTargetOrder.id}</div>
                <div className="mt-2 grid gap-1 text-muted-foreground">
                  <span>Table: {printTargetOrder.tableNumber ?? "N/A"}</span>
                  {printTargetOrder.kotTicket?.ticketNumber && (
                    <span>KOT #: {printTargetOrder.kotTicket.ticketNumber}</span>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="captain-print-format">Print Format</Label>
                <RadioGroup
                  id="captain-print-format"
                  value={kotFormat}
                  onValueChange={(value) => setKotFormat(value as "thermal" | "a4")}
                  className="grid gap-3"
                >
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="thermal" id="captain-print-format-thermal" />
                    <Label htmlFor="captain-print-format-thermal" className="flex flex-col">
                      <span className="font-medium">Thermal Ticket</span>
                      <span className="text-sm text-muted-foreground">
                        Compact ticket for thermal printers.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-center space-x-3 rounded-md border p-3">
                    <RadioGroupItem value="a4" id="captain-print-format-a4" />
                    <Label htmlFor="captain-print-format-a4" className="flex flex-col">
                      <span className="font-medium">A4 Ticket</span>
                      <span className="text-sm text-muted-foreground">
                        Full-page ticket for standard printers.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closePrintDialog}>
              Cancel
            </Button>
            <Button onClick={handlePrintKot} disabled={!printTargetOrder}>
              <ChefHat className="mr-2 h-4 w-4" />
              Print KOT
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

