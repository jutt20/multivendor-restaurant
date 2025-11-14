import { useEffect, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { MenuCategory, Order } from "@shared/schema";
import { Minus, Plus, Trash2 } from "lucide-react";

type TableOption = {
  id: number;
  tableNumber?: number | null;
  label?: string | null;
};

type MenuItemOption = {
  id: number;
  name: string;
  price: number | string;
  categoryId?: number | null;
  gstRate?: number | string | null;
  gstMode?: "include" | "exclude" | null;
  isAvailable?: boolean | null;
};

interface ManualOrderDialogProps {
  trigger: React.ReactNode;
  tables: TableOption[];
  menuItems: MenuItemOption[];
  categories?: MenuCategory[];
  submitEndpoint: string;
  tablesLoading?: boolean;
  itemsLoading?: boolean;
  defaultTableId?: number;
  allowTableSelection?: boolean;
  onOrderCreated?: (order: Order) => void;
  invalidateQueryKeys?: Array<readonly [string]>;
}

type OrderLine = {
  itemId: number;
  name: string;
  price: number;
  quantity: number;
};

type EnrichedOrderLine = OrderLine & {
  baseSubtotal: number;
  gstAmount: number;
  gstRate: number;
  gstMode: "include" | "exclude";
  lineTotal: number;
  unitPriceWithTax: number;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
  }).format(value);
};

const roundCurrency = (value: number) =>
  Number.isFinite(value) ? Number(value.toFixed(2)) : 0;

const normalizeGstRate = (value: unknown): number => {
  if (value === null || value === undefined) {
    return 0;
  }
  const numeric = Number.parseFloat(String(value));
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Number(Math.min(numeric, 100).toFixed(2));
};

const resolveTableLabel = (table: TableOption) => {
  if (table.label && table.label.trim().length > 0) {
    return table.label;
  }
  if (table.tableNumber !== undefined && table.tableNumber !== null) {
    return `Table ${table.tableNumber}`;
  }
  return `Table #${table.id}`;
};

const toNumber = (value: number | string) => {
  const numeric = typeof value === "string" ? Number.parseFloat(value) : Number(value);
  if (!Number.isFinite(numeric) || Number.isNaN(numeric)) {
    return NaN;
  }
  return Number(numeric.toFixed(2));
};

export function ManualOrderDialog({
  trigger,
  tables,
  menuItems,
  categories = [],
  submitEndpoint,
  tablesLoading = false,
  itemsLoading = false,
  defaultTableId,
  allowTableSelection = true,
  onOrderCreated,
  invalidateQueryKeys,
}: ManualOrderDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [selectedTableId, setSelectedTableId] = useState<string>("");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [orderLines, setOrderLines] = useState<OrderLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  const categoriesById = useMemo(() => {
    const map = new Map<number, MenuCategory>();
    categories.forEach((category) => {
      map.set(category.id, category);
    });
    return map;
  }, [categories]);

  const enhancedMenuItems = useMemo(() => {
    return menuItems.map((item) => {
      const category = item.categoryId != null ? categoriesById.get(item.categoryId) : undefined;
      const fallbackRate = normalizeGstRate(category?.gstRate);
      const fallbackMode: "include" | "exclude" =
        category?.gstMode === "include" ? "include" : "exclude";

      const itemRate = normalizeGstRate(item.gstRate);
      const gstRate = itemRate > 0 ? itemRate : fallbackRate;
      const gstMode: "include" | "exclude" =
        item.gstMode === "include"
          ? "include"
          : item.gstMode === "exclude"
            ? "exclude"
            : fallbackMode;

      return {
        ...item,
        gstRate,
        gstMode,
      } satisfies MenuItemOption;
    });
  }, [menuItems, categoriesById]);

  const availableItems = useMemo(
    () => enhancedMenuItems.filter((item) => item.isAvailable !== false),
    [enhancedMenuItems],
  );

  const menuItemsById = useMemo(() => {
    const map = new Map<number, MenuItemOption>();
    enhancedMenuItems.forEach((item) => {
      map.set(item.id, item);
    });
    return map;
  }, [enhancedMenuItems]);

  const enrichedOrderLines = useMemo<EnrichedOrderLine[]>(() => {
    return orderLines.map((line) => {
      const source = menuItemsById.get(line.itemId);
      const gstRate = normalizeGstRate(source?.gstRate);
      const gstMode: "include" | "exclude" =
        source?.gstMode === "include" ? "include" : "exclude";
      const baseSubtotal = roundCurrency(line.price * line.quantity);
      const gstAmount = roundCurrency(baseSubtotal * (gstRate / 100));
      const lineTotal = roundCurrency(baseSubtotal + gstAmount);
      const unitPriceWithTax =
        line.quantity > 0 ? roundCurrency(lineTotal / line.quantity) : lineTotal;
      return {
        ...line,
        baseSubtotal,
        gstAmount,
        gstRate,
        gstMode,
        lineTotal,
        unitPriceWithTax,
      };
    });
  }, [orderLines, menuItemsById]);

  const totals = useMemo(() => {
    const aggregate = enrichedOrderLines.reduce(
      (acc, line) => {
        acc.subtotal += line.baseSubtotal;
        acc.totalTax += line.gstAmount;
        if (line.gstMode === "include") {
          acc.gstIncluded += line.gstAmount;
        } else {
          acc.gstSeparate += line.gstAmount;
        }
        acc.total += line.lineTotal;
        return acc;
      },
      {
        subtotal: 0,
        totalTax: 0,
        gstIncluded: 0,
        gstSeparate: 0,
        total: 0,
      },
    );

    return {
      subtotal: roundCurrency(aggregate.subtotal),
      totalTax: roundCurrency(aggregate.totalTax),
      gstIncluded: roundCurrency(aggregate.gstIncluded),
      gstSeparate: roundCurrency(aggregate.gstSeparate),
      total: roundCurrency(aggregate.total),
    };
  }, [enrichedOrderLines]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const targetTableId = defaultTableId ?? tables[0]?.id;
    if (targetTableId !== undefined && targetTableId !== null) {
      setSelectedTableId(String(targetTableId));
    }
  }, [open, defaultTableId, tables]);

  const resetState = () => {
    setSelectedItemId("");
    setQuantity(1);
    setOrderLines([]);
    setCustomerName("");
    setCustomerPhone("");
    setCustomerNotes("");
    if (allowTableSelection) {
      setSelectedTableId("");
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetState();
    }
  };

  const handleAddItem = () => {
    if (!selectedItemId) {
      toast({
        title: "Select an item",
        description: "Choose a menu item before adding it to the order.",
        variant: "destructive",
      });
      return;
    }

    const item = availableItems.find((option) => String(option.id) === selectedItemId);
    if (!item) {
      toast({
        title: "Item unavailable",
        description: "The selected menu item is no longer available.",
        variant: "destructive",
      });
      setSelectedItemId("");
      return;
    }

    const price = toNumber(item.price);
    if (Number.isNaN(price)) {
      toast({
        title: "Invalid price",
        description: "Unable to determine the price for the selected item.",
        variant: "destructive",
      });
      return;
    }

    if (quantity < 1) {
      toast({
        title: "Invalid quantity",
        description: "Quantity must be at least 1.",
        variant: "destructive",
      });
      return;
    }

    setOrderLines((current) => {
      const existing = current.find((line) => line.itemId === item.id);
      if (existing) {
        return current.map((line) =>
          line.itemId === item.id
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [
        ...current,
        {
          itemId: item.id,
          name: item.name,
          price,
          quantity,
        },
      ];
    });

    setSelectedItemId("");
    setQuantity(1);
  };

  const handleUpdateQuantity = (itemId: number, nextQuantity: number) => {
    if (nextQuantity < 1) {
      return;
    }
    setOrderLines((current) =>
      current.map((line) =>
        line.itemId === itemId ? { ...line, quantity: nextQuantity } : line,
      ),
    );
  };

  const handleRemoveLine = (itemId: number) => {
    setOrderLines((current) => current.filter((line) => line.itemId !== itemId));
  };

  const placeOrderMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTableId) {
        throw new Error("Select a table before placing the order.");
      }
      if (orderLines.length === 0) {
        throw new Error("Add at least one item to the order.");
      }

      const payload = {
        tableId: Number(selectedTableId),
        items: orderLines.map((line) => {
          const source = menuItemsById.get(line.itemId);
          const gstRate = normalizeGstRate(source?.gstRate);
          const gstMode = source?.gstMode === "include" ? "include" : "exclude";

          return {
            itemId: line.itemId,
            name: line.name,
            quantity: line.quantity,
            price: line.price,
            subtotal: Number((line.price * line.quantity).toFixed(2)),
            gstRate,
            gstMode,
          };
        }),
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        customerNotes: customerNotes.trim() || undefined,
      };

      const res = await apiRequest("POST", submitEndpoint, payload);
      await Promise.all(
        (invalidateQueryKeys ?? []).map((key) =>
          queryClient.invalidateQueries({ queryKey: key }),
        ),
      );
      return res.json();
    },
    onSuccess: (order: Order) => {
      toast({
        title: "Order placed",
        description: "The order has been created successfully.",
      });
      onOrderCreated?.(order);
      handleOpenChange(false);
    },
    onError: (error: any) => {
      toast({
        title: "Failed to place order",
        description: error?.message ?? "Something went wrong while creating the order.",
        variant: "destructive",
      });
    },
  });

  const hasMenuItems = availableItems.length > 0;
  const hasTables = tables.length > 0;
  const dialogDisabled = !hasMenuItems || !hasTables;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-w-3xl overflow-hidden p-0">
        <div className="flex max-h-[85vh] flex-col">
          <DialogHeader className="border-b px-6 py-4">
            <DialogTitle>Create Order</DialogTitle>
            <DialogDescription>
              Build a dine-in order without scanning a QR code.
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1">
            <div className="space-y-4 px-6 py-4">
              {tablesLoading || itemsLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : dialogDisabled ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {!hasTables
                    ? "No tables available. Create a table before placing manual orders."
                    : "No active menu items available. Add menu items to create orders."}
                </div>
              ) : (
                <div className="space-y-6">
                  {allowTableSelection ? (
                    <div className="space-y-2">
                      <Label>Table</Label>
                      <Select value={selectedTableId} onValueChange={setSelectedTableId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select table" />
                        </SelectTrigger>
                        <SelectContent>
                          {tables.map((table) => (
                            <SelectItem key={table.id} value={table.id.toString()}>
                              {resolveTableLabel(table)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-sm text-muted-foreground">Table</Label>
                      <div className="rounded-md border px-3 py-2 text-sm font-medium">
                        {resolveTableLabel(
                          tables.find((table) => String(table.id) === selectedTableId) ??
                            tables.find((table) => table.id === defaultTableId) ??
                            { id: defaultTableId ?? 0 },
                        )}
                      </div>
                    </div>
                  )}

                  <div className="space-y-4 rounded-md border p-4">
                    <div className="grid gap-3 md:grid-cols-[2fr,1fr,auto]">
                      <div className="space-y-2">
                        <Label>Add Item</Label>
                        <Select value={selectedItemId} onValueChange={setSelectedItemId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Choose menu item" />
                          </SelectTrigger>
                          <SelectContent>
                            {availableItems.map((item) => (
                              <SelectItem key={item.id} value={item.id.toString()}>
                                {item.name} · {formatCurrency(toNumber(item.price) || 0)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Quantity</Label>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                          >
                            <Minus className="h-4 w-4" />
                          </Button>
                          <Input
                            type="number"
                            min={1}
                            value={quantity}
                            onChange={(event) =>
                              setQuantity(Math.max(1, Number(event.target.value)))
                            }
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setQuantity((value) => value + 1)}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-end">
                        <Button type="button" className="w-full" onClick={handleAddItem}>
                          Add
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      {orderLines.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No items added yet. Select a menu item and click Add to build the order.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {enrichedOrderLines.map((line) => (
                            <div
                              key={line.itemId}
                              className="flex flex-col gap-3 rounded-md border p-3 md:flex-row md:items-center md:justify-between"
                            >
                              <div>
                                <p className="font-medium">{line.name}</p>
                                <p className="text-sm text-muted-foreground">
                                  {formatCurrency(line.price)} × {line.quantity}
                                </p>
                                {line.gstRate > 0 && (
                                  <p className="text-xs text-muted-foreground">
                                    GST {line.gstRate}%{" "}
                                    {line.gstMode === "include"
                                      ? "included in total"
                                      : `adds ${formatCurrency(line.gstAmount)}`}
                                  </p>
                                )}
                              </div>
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                      handleUpdateQuantity(line.itemId, line.quantity - 1)
                                    }
                                    disabled={line.quantity <= 1}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <Input
                                    type="number"
                                    min={1}
                                    className="w-16"
                                    value={line.quantity}
                                    onChange={(event) =>
                                      handleUpdateQuantity(
                                        line.itemId,
                                        Math.max(1, Number(event.target.value)),
                                      )
                                    }
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                      handleUpdateQuantity(line.itemId, line.quantity + 1)
                                    }
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                                <div className="text-sm font-semibold">
                                  {formatCurrency(line.lineTotal)}
                                </div>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleRemoveLine(line.itemId)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Customer name (optional)</Label>
                      <Input
                        value={customerName}
                        onChange={(event) => setCustomerName(event.target.value)}
                        placeholder="Guest name"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Customer phone (optional)</Label>
                      <Input
                        value={customerPhone}
                        onChange={(event) => setCustomerPhone(event.target.value)}
                        placeholder="Contact number"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Notes for kitchen (optional)</Label>
                    <Textarea
                      value={customerNotes}
                      onChange={(event) => setCustomerNotes(event.target.value)}
                      placeholder="Add any special instructions..."
                    />
                  </div>

                  <div className="space-y-2 rounded-md bg-muted px-4 py-3 text-sm">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span>Subtotal</span>
                      <span>{formatCurrency(totals.subtotal)}</span>
                    </div>
                    {totals.gstIncluded > 0 && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>GST (included)</span>
                        <span>{formatCurrency(totals.gstIncluded)}</span>
                      </div>
                    )}
                    {totals.gstSeparate > 0 && (
                      <div className="flex items-center justify-between text-muted-foreground">
                        <span>GST (separate)</span>
                        <span>{formatCurrency(totals.gstSeparate)}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-base font-semibold">
                      <span>Total</span>
                      <span>{formatCurrency(totals.total)}</span>
                    </div>
                  </div>

                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => placeOrderMutation.mutate()}
                    disabled={
                      placeOrderMutation.isPending ||
                      !selectedTableId ||
                      orderLines.length === 0 ||
                      totals.total <= 0
                    }
                  >
                    {placeOrderMutation.isPending ? "Placing order..." : "Place order"}
                  </Button>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default ManualOrderDialog;

