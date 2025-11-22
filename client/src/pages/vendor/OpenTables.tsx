import { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import ManualOrderDialog from "@/components/orders/ManualOrderDialog";
import { useOrderStream } from "@/hooks/useOrderStream";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Printer } from "lucide-react";
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
import { PaymentType, printA4Invoice, printThermalReceipt, type ReceiptItem } from "@/lib/receipt-utils";
import type { Table, Captain, MenuCategory, Order } from "@shared/schema";
import type { PrintableOrder } from "@/types/orders";
import type { MenuItemWithAddons } from "@/types/menu";

const normalizeStatusValue = (status: string | null | undefined) =>
  status ? status.toString().trim().toLowerCase().replace(/\s+/g, "_") : "";

const resolveOrderType = (order: PrintableOrder): "dining" | "delivery" | "pickup" => {
  const rawType =
    (order as Record<string, unknown>)?.fulfillmentType ??
    (order as Record<string, unknown>)?.orderType ??
    (order as Record<string, unknown>)?.channel ??
    null;

  if (typeof rawType === "string") {
    const normalized = rawType.trim().toLowerCase();
    if (["delivery", "home_delivery", "delivery_order", "home-delivery"].includes(normalized)) {
      return "delivery";
    }
    if (["pickup", "takeaway", "take_away", "take-away"].includes(normalized)) {
      return "pickup";
    }
  }

  if ((order as Record<string, unknown>)?.deliveryAddress) {
    return "delivery";
  }

  if ((order as Record<string, unknown>)?.pickupTime) {
    return "pickup";
  }

  return "dining";
};

const OPEN_ORDER_STATUSES = new Set(["pending", "accepted", "preparing", "ready", "served", "delivered"]);

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
    maximumFractionDigits: 2,
  }).format(amount);
};

const roundCurrency = (value: number) =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

const normalizeRateValue = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  const numeric = Number.parseFloat(String(value));
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return 0;
  }
  return Number(numeric.toFixed(2));
};

type DisplayOrderItem = {
  name: string;
  quantity: number;
  lineTotal: number;
  gstAmount: number;
  gstRate: number;
  addons?: string[];
};

const parseOrderItemsForDisplay = (order: PrintableOrder): DisplayOrderItem[] => {
  const rawItems = (() => {
    if (Array.isArray(order.items)) return order.items;
    if (typeof order.items === "string") {
      try {
        const parsed = JSON.parse(order.items);
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    }
    if (order.items && typeof order.items === "object") {
      const maybeArray = (order.items as any).items;
      if (Array.isArray(maybeArray)) {
        return maybeArray;
      }
    }
    return [];
  })();

  return rawItems.map((item: any) => {
    const quantityRaw = Number(item.quantity ?? 1);
    const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? Math.floor(quantityRaw) : 1;
    const lineTotal = Number(
      item.lineTotal ?? item.subtotalWithGst ?? item.subtotal ?? item.total ?? 0,
    );
    const gstAmount = Number(item.gstAmount ?? 0);
    const gstRate = Number(item.gstRate ?? 0);
    const addons =
      Array.isArray(item.addons) && item.addons.length > 0
        ? item.addons.map((addon: any) => String(addon.name ?? "Addon"))
        : undefined;

    return {
      name: String(item.name ?? "Item"),
      quantity,
      lineTotal: Number.isFinite(lineTotal) ? Number(lineTotal.toFixed(2)) : 0,
      gstAmount: Number.isFinite(gstAmount) ? Number(gstAmount.toFixed(2)) : 0,
      gstRate: Number.isFinite(gstRate) ? Number(gstRate.toFixed(2)) : 0,
      addons,
    };
  });
};

export default function OpenTables() {
  const { toast } = useToast();
  
  const [printDialogOpen, setPrintDialogOpen] = useState(false);
  const [printTargetOrder, setPrintTargetOrder] = useState<PrintableOrder | null>(null);
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [billFormat, setBillFormat] = useState<"thermal" | "a4">("a4");

  const { data: tables, isLoading: loadingTables } = useQuery<Table[]>({
    queryKey: ["/api/vendor/tables"],
  });

  const { data: orders, isLoading: loadingOrders } = useQuery<PrintableOrder[]>({
    queryKey: ["/api/vendor/orders"],
    refetchInterval: 5000,
  });

  const { data: captains } = useQuery<Captain[]>({
    queryKey: ["/api/vendor/captains"],
  });

  const { data: menuItems } = useQuery<MenuItemWithAddons[]>({
    queryKey: ["/api/vendor/menu/items"],
  });

  const { data: categories } = useQuery<MenuCategory[]>({
    queryKey: ["/api/vendor/menu/categories"],
  });

  const captainMap = useMemo(() => {
    const map = new Map<number, Captain>();
    (captains ?? []).forEach((captain) => map.set(captain.id, captain));
    return map;
  }, [captains]);

  const menuItemsById = useMemo(() => {
    const map = new Map<number, MenuItemWithAddons>();
    (menuItems ?? []).forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [menuItems]);

  const categoriesById = useMemo(() => {
    const map = new Map<number, MenuCategory>();
    (categories ?? []).forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categories]);

  const parseOrderItems = useCallback(
    (order: Order): ReceiptItem[] => {
      const rawItems: any[] = [];

      if (Array.isArray(order.items)) {
        rawItems.push(...order.items);
      } else if (typeof order.items === "string") {
        try {
          const parsed = JSON.parse(order.items);
          if (Array.isArray(parsed)) {
            rawItems.push(...parsed);
          }
        } catch {
          // ignore malformed payloads
        }
      }

      return rawItems.map((item) => {
        const quantityRaw = Number(item.quantity ?? 1);
        const quantity = Number.isFinite(quantityRaw) && quantityRaw > 0 ? quantityRaw : 1;

        const priceCandidates = [item.price, item.basePrice, item.unitPrice];
        let baseUnitPrice = 0;
        for (const candidate of priceCandidates) {
          if (candidate === null || candidate === undefined) {
            continue;
          }
          const numeric = Number.parseFloat(String(candidate));
          if (Number.isFinite(numeric)) {
            baseUnitPrice = numeric;
            break;
          }
        }
        baseUnitPrice = Number.isFinite(baseUnitPrice) ? baseUnitPrice : 0;

        let baseSubtotal = Number.parseFloat(String(item.subtotal ?? ""));
        if (!Number.isFinite(baseSubtotal)) {
          baseSubtotal = baseUnitPrice * quantity;
        }
        baseSubtotal = roundCurrency(baseSubtotal);

        // Try to find menu item by different possible ID fields
        const itemId = item.itemId ?? item.id ?? item.productId ?? item.menuItemId ?? 0;
        const menuItem = menuItemsById.get(Number(itemId));
        const category = menuItem ? categoriesById.get(menuItem.categoryId) : undefined;

        // Get GST rate: prefer item-level, then category-level, then menu item level
        let gstRate = normalizeRateValue(item.gstRate);
        if (gstRate === 0 && menuItem) {
          const menuItemRate = normalizeRateValue(menuItem.gstRate);
          if (menuItemRate > 0) {
            gstRate = menuItemRate;
          }
        }
        if (gstRate === 0 && category) {
          const categoryRate = normalizeRateValue(category.gstRate);
          if (categoryRate > 0) {
            gstRate = categoryRate;
          }
        }

        // Get GST mode: prefer item-level, then category-level, then menu item level
        let gstMode: "include" | "exclude" =
          item.gstMode === "include"
            ? "include"
            : item.gstMode === "exclude"
              ? "exclude"
              : menuItem?.gstMode === "include"
                ? "include"
                : menuItem?.gstMode === "exclude"
                  ? "exclude"
                  : category?.gstMode === "include"
                    ? "include"
                    : "exclude";

        // Calculate lineTotal and GST amount
        let lineTotal = Number.parseFloat(
          String(item.subtotalWithGst ?? item.lineTotal ?? item.total ?? 0),
        );
        lineTotal = Number.isFinite(lineTotal) && lineTotal > 0 ? lineTotal : 0;

        let gstAmount = Number.parseFloat(String(item.gstAmount ?? 0));
        gstAmount = Number.isFinite(gstAmount) && gstAmount >= 0 ? gstAmount : 0;

        // If lineTotal is not set, calculate it based on GST mode
        if (lineTotal === 0) {
          if (gstRate > 0) {
            if (gstMode === "include") {
              lineTotal = roundCurrency(baseUnitPrice * quantity);
              if (gstAmount === 0) {
                gstAmount = roundCurrency(lineTotal * (gstRate / (100 + gstRate)));
              }
              baseSubtotal = roundCurrency(lineTotal - gstAmount);
            } else {
              if (gstAmount === 0) {
                gstAmount = roundCurrency(baseSubtotal * (gstRate / 100));
              }
              lineTotal = roundCurrency(baseSubtotal + gstAmount);
            }
          } else {
            lineTotal = baseSubtotal;
            gstAmount = 0;
          }
        } else {
          lineTotal = roundCurrency(lineTotal);
          if (gstAmount === 0 && gstRate > 0) {
            if (gstMode === "include") {
              gstAmount = roundCurrency(lineTotal * (gstRate / (100 + gstRate)));
              baseSubtotal = roundCurrency(lineTotal - gstAmount);
            } else {
              gstAmount = roundCurrency(baseSubtotal * (gstRate / 100));
              const expectedLineTotal = roundCurrency(baseSubtotal + gstAmount);
              if (Math.abs(lineTotal - expectedLineTotal) > 0.01) {
                baseSubtotal = roundCurrency(lineTotal - gstAmount);
              }
            }
          } else {
            gstAmount = roundCurrency(gstAmount);
            if (gstMode === "include" && gstAmount > 0) {
              baseSubtotal = roundCurrency(lineTotal - gstAmount);
            }
          }
        }

        // Ensure consistency: if GST rate is 0, GST amount should be 0
        if (gstRate === 0) {
          gstAmount = 0;
          lineTotal = baseSubtotal;
        }

        const unitPrice = roundCurrency(baseUnitPrice);
        const unitPriceWithTax =
          gstMode === "include"
            ? quantity > 0
              ? roundCurrency(lineTotal / quantity)
              : lineTotal
            : unitPrice;

        // Map addons (if any) for printing
        let addons: { name: string; price?: number }[] | undefined;
        if (Array.isArray(item.addons) && item.addons.length > 0) {
          addons = item.addons.map((addon: any) => {
            const priceValue =
              addon.price !== undefined && addon.price !== null
                ? Number.parseFloat(String(addon.price))
                : undefined;
            const price = Number.isFinite(priceValue) ? roundCurrency(priceValue as number) : undefined;
            return {
              name: String(addon.name ?? "Addon"),
              price,
            };
          });
        }

        return {
          name: item.name || "Item",
          quantity,
          unitPrice,
          unitPriceWithTax,
          baseSubtotal,
          gstRate,
          gstMode,
          gstAmount,
          lineTotal,
          addons,
          notes: typeof item.notes === "string" ? item.notes : null,
        };
      });
    },
    [categoriesById, menuItemsById],
  );

  const completeOrderMutation = useMutation({
    mutationFn: async (orderId: number) => {
      await apiRequest("PUT", `/api/vendor/orders/${orderId}/status`, { status: "completed" });
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({ queryKey: ["/api/vendor/orders"], type: "active" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
      queryClient.invalidateQueries({ queryKey: ["/api/captain/orders"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/captain/tables"] });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/orders"] });
    },
  });

  const openPrintDialog = (order: PrintableOrder) => {
    setPrintTargetOrder(order);
    setPaymentType(null);
    setBillFormat("a4");
    setPrintDialogOpen(true);
  };

  const closePrintDialog = () => {
    setPrintDialogOpen(false);
    setPrintTargetOrder(null);
    setPaymentType(null);
  };

  const handlePrintBill = async () => {
    if (!printTargetOrder) {
      return;
    }

    const orderId = printTargetOrder.id;
    const items = parseOrderItems(printTargetOrder);

    if (billFormat === "a4") {
      if (!paymentType) {
        toast({
          title: "Select payment type",
          description: "Choose Cash or UPI before generating the bill.",
          variant: "destructive",
        });
        return;
      }

      try {
        await printA4Invoice({
          order: printTargetOrder,
          items,
          paymentType,
          restaurantName: printTargetOrder.vendorDetails?.name ?? undefined,
          restaurantAddress: printTargetOrder.vendorDetails?.address ?? undefined,
          restaurantPhone: printTargetOrder.vendorDetails?.phone ?? undefined,
          paymentQrCodeUrl: printTargetOrder.vendorDetails?.paymentQrCodeUrl ?? undefined,
        });
      } catch (error) {
        console.error("Receipt print error:", error);
        toast({
          title: "Error",
          description: "Failed to generate bill. Please try again.",
          variant: "destructive",
        });
        return;
      }
    } else {
      try {
        await printThermalReceipt({
          order: printTargetOrder,
          items,
          paymentType: paymentType ?? undefined,
          restaurantName: printTargetOrder.vendorDetails?.name ?? undefined,
          restaurantAddress: printTargetOrder.vendorDetails?.address ?? undefined,
          restaurantPhone: printTargetOrder.vendorDetails?.phone ?? undefined,
          paymentQrCodeUrl: printTargetOrder.vendorDetails?.paymentQrCodeUrl ?? undefined,
          title: "Customer Bill",
          ticketNumber: `BILL-${orderId}`,
        });
      } catch (error) {
        console.error("Thermal bill print error:", error);
        toast({
          title: "Error",
          description: "Failed to print thermal bill. Please try again.",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      await completeOrderMutation.mutateAsync(orderId);
    } catch (error) {
      console.error("Failed to mark order completed after billing:", error);
      toast({
        title: "Order completion failed",
        description: "Bill was printed, but the order could not be marked completed. Please retry.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Bill generated",
      description: "Order closed and table marked available.",
    });
    closePrintDialog();
  };

  const tableOptions = useMemo(
    () =>
      (tables ?? []).map((table) => ({
        id: table.id,
        tableNumber: table.tableNumber,
        label: table.isManual ? `Manual Table ${table.tableNumber}` : undefined,
      })),
    [tables],
  );

  const openTableEntries = useMemo(() => {
    if (!tables || !orders) {
      return [];
    }

    const activeDiningOrders = orders.filter((order) => {
      if (resolveOrderType(order) !== "dining") {
        return false;
      }
      const status = normalizeStatusValue(order.status);
      return OPEN_ORDER_STATUSES.has(status);
    });

    const orderByTable = new Map<number, PrintableOrder>();
    for (const order of activeDiningOrders) {
      const tableId = Number(order.tableId);
      if (!Number.isFinite(tableId) || tableId <= 0) {
        continue;
      }
      const existing = orderByTable.get(tableId);
      if (!existing) {
        orderByTable.set(tableId, order);
        continue;
      }
      const existingCreated = existing.createdAt ? new Date(existing.createdAt).getTime() : 0;
      const candidateCreated = order.createdAt ? new Date(order.createdAt).getTime() : 0;
      if (candidateCreated > existingCreated) {
        orderByTable.set(tableId, order);
      }
    }

    return tables
      .filter((table) => table.isActive === false)
      .map((table) => ({
        table,
        order: orderByTable.get(table.id) ?? null,
        captain: table.captainId ? captainMap.get(table.captainId) ?? null : null,
      }))
      .sort((a, b) => a.table.tableNumber - b.table.tableNumber);
  }, [tables, orders, captainMap]);

  const openCount = openTableEntries.length;
  const withoutOrderCount = openTableEntries.filter((entry) => !entry.order).length;

  useOrderStream({
    onEvent: (event) => {
      if (
        event.type === "order-created" ||
        event.type === "order-status-changed" ||
        event.type === "order-updated" ||
        event.type === "table-status-changed" ||
        event.type === "kot-created"
      ) {
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
        queryClient.invalidateQueries({ queryKey: ["/api/vendor/orders"] });
      }
    },
  });

  const isBusy = loadingTables || loadingOrders;
  const showEmptyState = !isBusy && openCount === 0;

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Open Tables</h1>
        <p className="text-muted-foreground">
          Monitor booked tables, review GST breakdowns, and edit live orders in one place.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Currently Occupied</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{openCount}</p>
            <p className="text-sm text-muted-foreground">Tables marked unavailable</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Missing Orders</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{withoutOrderCount}</p>
            <p className="text-sm text-muted-foreground">Tables booked without active orders</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Captains Assigned</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {
                new Set(
                  openTableEntries
                    .map((entry) => entry.table.captainId)
                    .filter((id): id is number => typeof id === "number"),
                ).size
              }
            </p>
            <p className="text-sm text-muted-foreground">Captains covering open tables</p>
          </CardContent>
        </Card>
      </div>

      {isBusy ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((item) => (
            <Skeleton key={item} className="h-64 w-full rounded-xl" />
          ))}
        </div>
      ) : showEmptyState ? (
        <Card>
          <CardContent className="py-16 text-center space-y-2">
            <p className="text-xl font-semibold">All tables are available</p>
            <p className="text-sm text-muted-foreground">
              As soon as a table is booked, it will appear here with order details.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {openTableEntries.map(({ table, order, captain }) => {
            const items = order ? parseOrderItemsForDisplay(order) : [];
            const totals = items.reduce(
              (acc, item) => {
                acc.total += item.lineTotal;
                acc.gst += item.gstAmount;
                return acc;
              },
              { total: 0, gst: 0 },
            );
            const subtotal = totals.total - totals.gst;
            const relativeTime = order?.createdAt
              ? formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })
              : null;

            return (
              <Card key={table.id} className="flex flex-col">
                <CardHeader className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <CardTitle className="text-2xl font-bold">Table {table.tableNumber}</CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {captain ? `Assigned to ${captain.name}` : "No captain assigned"}
                      </p>
                    </div>
                    <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300">
                      Booked
                    </Badge>
                  </div>
                  {order && (
                    <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      <StatusBadge status={order.status as any} />
                      {relativeTime && <span>Opened {relativeTime}</span>}
                      {order.customerName && (
                        <span className="font-medium text-foreground">{order.customerName}</span>
                      )}
                    </div>
                  )}
                </CardHeader>
                <CardContent className="flex flex-1 flex-col space-y-4">
                  {order ? (
                    <>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-muted-foreground">Items</span>
                          <span className="font-semibold">{items.length}</span>
                        </div>
                        <div className="rounded-lg border bg-muted/30 p-3 space-y-2 max-h-40 overflow-y-auto">
                          {items.map((item, idx) => (
                            <div key={`${order.id}-item-${idx}`}>
                              <p className="text-sm font-medium">
                                {item.quantity} × {item.name}
                              </p>
                              <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-2">
                                <span>{formatINR(item.lineTotal)}</span>
                                {item.gstRate > 0 && (
                                  <span>GST {item.gstRate}% ({formatINR(item.gstAmount)})</span>
                                )}
                              </div>
                              {item.addons && item.addons.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                  Addons: {item.addons.join(", ")}
                                </p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-medium">{formatINR(subtotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">GST collected</span>
                          <span className="font-medium">{formatINR(totals.gst)}</span>
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between text-base font-semibold">
                          <span>Total with GST</span>
                          <span>{formatINR(totals.total)}</span>
                        </div>
                      </div>

                      <div className="mt-auto flex flex-col gap-2">
                        <div className="flex items-center justify-between gap-2">
                          <Button asChild variant="outline" size="sm" className="flex-1">
                            <a href="/vendor/orders" className="w-full text-center">
                              View in Orders
                            </a>
                          </Button>
                          {menuItems && categories && (
                            <ManualOrderDialog
                              trigger={
                                <Button size="sm" className="flex-1">
                                  Edit Order
                                </Button>
                              }
                              tables={tableOptions}
                              menuItems={menuItems}
                              categories={categories}
                              submitEndpoint={`/api/vendor/orders/${order.id}`}
                              submitMethod="PUT"
                              mode="edit"
                              defaultTableId={order.tableId ?? undefined}
                              allowTableSelection={false}
                              initialOrder={order}
                              invalidateQueryKeys={[
                                ["/api/vendor/orders"],
                                ["/api/vendor/tables"],
                              ]}
                              onOrderCreated={() => {
                                queryClient.invalidateQueries({ queryKey: ["/api/vendor/orders"] });
                                queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
                              }}
                            />
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => openPrintDialog(order)}
                          className="w-full gap-2"
                        >
                          <Printer className="h-4 w-4" />
                          Print Bill
                        </Button>
                      </div>
                    </>
                  ) : (
                    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
                      <p className="font-medium text-foreground">No active order</p>
                      <p>This table is marked as booked but doesn’t have an open order yet.</p>
                      <Button
                        asChild
                        size="sm"
                        className="mt-3"
                        variant="outline"
                      >
                        <a href="/vendor/orders">Create order</a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={printDialogOpen} onOpenChange={(open) => (open ? setPrintDialogOpen(true) : closePrintDialog())}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Bill</DialogTitle>
            <DialogDescription>
              Choose the format and payment details before printing the customer bill.
            </DialogDescription>
          </DialogHeader>

          {printTargetOrder && (
            <div className="space-y-4">
              <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
                <div className="font-semibold text-base flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Order #{printTargetOrder.id}
                </div>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total Amount:</span>
                    <span className="font-bold text-primary text-base">{formatINR(printTargetOrder.totalAmount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Customer:</span>
                    <span className="font-medium">{printTargetOrder.customerName || "Guest"}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Table:</span>
                    <span className="font-medium">
                      {printTargetOrder.tableNumber ?? printTargetOrder.tableId ?? "N/A"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="bill-format" className="text-base font-semibold">Print Format</Label>
                <RadioGroup
                  id="bill-format"
                  value={billFormat}
                  onValueChange={(value) => setBillFormat(value as "thermal" | "a4")}
                  className="grid gap-3"
                >
                  <div className="flex items-start space-x-3 rounded-lg border-2 p-4 transition-all hover:bg-muted/50 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="thermal" id="bill-format-thermal" className="mt-1" />
                    <Label htmlFor="bill-format-thermal" className="flex flex-col flex-1 cursor-pointer">
                      <span className="font-semibold text-base mb-1">Thermal Receipt</span>
                      <span className="text-sm text-muted-foreground">
                        Compact ticket for 58mm/80mm printers.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border-2 p-4 transition-all hover:bg-muted/50 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="a4" id="bill-format-a4" className="mt-1" />
                    <Label htmlFor="bill-format-a4" className="flex flex-col flex-1 cursor-pointer">
                      <span className="font-semibold text-base mb-1">A4 Invoice</span>
                      <span className="text-sm text-muted-foreground">
                        Detailed invoice with payment information.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
              </div>

              <div className="space-y-3">
                <Label htmlFor="payment-type" className="text-base font-semibold">
                  Payment Type
                  {billFormat === "a4" && <span className="text-destructive ml-1">*</span>}
                </Label>
                <RadioGroup
                  id="payment-type"
                  value={paymentType ?? undefined}
                  onValueChange={(value) => setPaymentType(value as PaymentType)}
                  className="grid gap-3"
                >
                  <div className="flex items-start space-x-3 rounded-lg border-2 p-4 transition-all hover:bg-muted/50 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="cash" id="payment-cash" className="mt-1" />
                    <Label htmlFor="payment-cash" className="flex flex-col flex-1 cursor-pointer">
                      <span className="font-semibold text-base mb-1">Cash Payment</span>
                      <span className="text-sm text-muted-foreground">
                        Customer paid the bill using cash.
                      </span>
                    </Label>
                  </div>
                  <div className="flex items-start space-x-3 rounded-lg border-2 p-4 transition-all hover:bg-muted/50 cursor-pointer has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                    <RadioGroupItem value="upi" id="payment-upi" className="mt-1" />
                    <Label htmlFor="payment-upi" className="flex flex-col flex-1 cursor-pointer">
                      <span className="font-semibold text-base mb-1">UPI Payment</span>
                      <span className="text-sm text-muted-foreground">
                        Customer paid the bill through a UPI transaction.
                      </span>
                    </Label>
                  </div>
                </RadioGroup>
                {billFormat === "thermal" && (
                  <p className="text-xs text-muted-foreground">
                    Payment type is optional for thermal receipts.
                  </p>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closePrintDialog}>
              Cancel
            </Button>
            <Button
              onClick={handlePrintBill}
              disabled={
                !printTargetOrder ||
                (billFormat === "a4" && !paymentType) ||
                completeOrderMutation.isPending
              }
            >
              <Printer className="mr-2 h-4 w-4" />
              Print Bill
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


