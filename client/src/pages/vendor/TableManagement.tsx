import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, QrCode as QrCodeIcon, Download, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  generateQRCode,
  downloadQRCode,
  getTableQRUrl,
} from "@/lib/qr-utils";
import type { Table, Captain } from "@shared/schema";


function ManualTableButton() {
  const [open, setOpen] = useState(false);
  const [tableNumber, setTableNumber] = useState("");
  const { toast } = useToast();

  const manualTableMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/vendor/tables/manual", { tableNumber });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
      toast({ title: "Success", description: data.message });
      setTableNumber("");
      setOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err?.message || "Failed to create manual table",
        variant: "destructive",
      });
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Manual Table
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Manual Table (Room)</DialogTitle>
          <DialogDescription>
            Enter a specific table or room number manually.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div>
            <Label htmlFor="tableNumber">Table / Room Number</Label>
            <input
              id="tableNumber"
              type="number"
              className="w-full mt-2 border rounded-md px-3 py-2"
              placeholder="e.g., 101"
              value={tableNumber}
              onChange={(e) => setTableNumber(e.target.value)}
            />
          </div>

          <Button
            onClick={() => manualTableMutation.mutate()}
            disabled={manualTableMutation.isPending || !tableNumber}
            className="w-full"
          >
            {manualTableMutation.isPending ? "Creating..." : "Create Manual Table"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


/**
 * QR Code display component
 */
function QRCodeDisplay({ table }: { table: Table }) {
  const [qrDataUrl, setQrDataUrl] = useState<string>("");

  useEffect(() => {
    const url = getTableQRUrl(table.id, table.tableNumber, table.vendorId);
    generateQRCode(url).then(setQrDataUrl).catch(console.error);
  }, [table]);

  return (
    <div className="flex items-center justify-center bg-muted p-6 rounded-lg">
      {qrDataUrl ? (
        <img
          src={qrDataUrl}
          alt={`QR Code for Table ${table.tableNumber}`}
          className="w-32 h-32"
        />
      ) : (
        <QrCodeIcon className="h-24 w-24 text-muted-foreground" />
      )}
    </div>
  );
}

/**
 * Table Card Component (reused)
 */
function TableCard({
  table,
  captains,
  assignCaptainMutation,
  handleDownloadQR,
  onDelete,
  isDeleting,
  isManual,
  onStatusChange,
  statusLoadingId,
}: {
  table: Table;
  captains?: Captain[];
  assignCaptainMutation: any;
  handleDownloadQR: (table: Table) => void;
  onDelete: (table: Table) => void;
  isDeleting: boolean;
  isManual: boolean;
  onStatusChange: (table: Table, status: "available" | "booked") => void;
  statusLoadingId?: number | null;
}) {
  return (
    <Card key={table.id} className="hover-elevate" data-testid={`card-table-${table.id}`}>
      <CardHeader className="space-y-0 pb-4">
        <div className="flex items-start justify-between">
          <CardTitle className="text-2xl font-mono">
            Table {table.tableNumber}
          </CardTitle>
          <div className="flex flex-col items-end gap-2">
            <Badge variant={isManual ? "default" : "outline"} className="uppercase tracking-wide">
              {isManual ? "Manual" : "Auto"}
            </Badge>
            <div
              className={`px-2 py-1 rounded text-xs font-medium ${
                table.isActive
                  ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                  : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400"
              }`}
            >
              {table.isActive ? "Available" : "Booked"}
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <QRCodeDisplay table={table} />

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Assigned Captain</Label>
          <Select
            value={table.captainId?.toString() || "none"}
            onValueChange={(value) => {
              assignCaptainMutation.mutate({
                tableId: table.id,
                captainId: value === "none" ? null : parseInt(value),
              });
            }}
          >
            <SelectTrigger data-testid={`select-captain-${table.id}`}>
              <SelectValue placeholder="Assign captain" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No captain</SelectItem>
              {captains?.map((captain) => (
                <SelectItem key={captain.id} value={captain.id.toString()}>
                  {captain.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => handleDownloadQR(table)}
          data-testid={`button-download-qr-${table.id}`}
        >
          <Download className="h-4 w-4 mr-2" />
          Download QR Code
        </Button>

        <Button
          variant={table.isActive ? "secondary" : "outline"}
          size="sm"
          className="w-full"
          onClick={() => onStatusChange(table, table.isActive ? "booked" : "available")}
          disabled={statusLoadingId === table.id}
        >
          {statusLoadingId === table.id
            ? "Updating status..."
            : table.isActive
            ? "Mark as Booked"
            : "Mark as Available"}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              data-testid={`button-delete-table-${table.id}`}
              disabled={isDeleting}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isDeleting ? "Deleting..." : "Delete Table"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete table {table.tableNumber}?</AlertDialogTitle>
              <AlertDialogDescription>
                This action cannot be undone. Any associated QR codes will stop working immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => onDelete(table)}
                disabled={isDeleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Confirm Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}

/**
 * Main Table Management Page
 */
export default function TableManagement() {
  const [isCreating, setIsCreating] = useState(false);
  const [noOfTables, setNoOfTables] = useState<number>(1);
  const [tableFilter, setTableFilter] = useState<"all" | "manual" | "auto">("all");
  const [statusFilter, setStatusFilter] = useState<"all" | "available" | "booked">("all");
  const [captainAssignmentFilter, setCaptainAssignmentFilter] = useState<"all" | "assigned" | "unassigned">("all");
  const { toast } = useToast();

  const { data: tables, isLoading } = useQuery<Table[]>({
    queryKey: ["/api/vendor/tables"],
  });

  const { data: captains } = useQuery<Captain[]>({
    queryKey: ["/api/vendor/captains"],
  });

  const createTableMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/vendor/tables", { noOfTables });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
      toast({
        title: "Success",
        description: data.message || "Tables created successfully",
      });
      setIsCreating(false);
      setNoOfTables(1);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create tables",
        variant: "destructive",
      });
    },
  });

  const assignCaptainMutation = useMutation({
    mutationFn: async ({
      tableId,
      captainId,
    }: {
      tableId: number;
      captainId: number | null;
    }) => {
      return await apiRequest("PUT", `/api/vendor/tables/${tableId}/assign`, {
        captainId,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
      toast({
        title: "Success",
        description: "Captain assigned successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to assign captain",
        variant: "destructive",
      });
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: async (tableId: number) => {
      return await apiRequest("DELETE", `/api/vendor/tables/${tableId}`);
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
      toast({
        title: "Success",
        description: data?.message || "Table deleted successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete table",
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation<
    { message?: string },
    any,
    { tableId: number; status: "available" | "booked" }
  >({
    mutationFn: async ({ tableId, status }) => {
      const res = await apiRequest("PUT", `/api/vendor/tables/${tableId}/status`, { status });
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/tables"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
      toast({
        title: "Success",
        description: data?.message || "Table status updated",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update table status",
        variant: "destructive",
      });
    },
  });

  const handleDownloadQR = async (table: Table) => {
    try {
      const url = getTableQRUrl(table.id, table.tableNumber, table.vendorId);
      await downloadQRCode(
        url,
        `table-${table.tableNumber}-qr.png`,
        table.tableNumber
      );
      toast({
        title: "Success",
        description: `QR code for Table ${table.tableNumber} downloaded`,
      });
    } catch {
      toast({
        title: "Error",
        description: "Failed to download QR code",
        variant: "destructive",
      });
    }
  };

  const isManualTable = (table: Table): boolean => {
    const value: any = table.isManual;
    return value === true || value === "true" || value === 1 || value === "1";
  };

  const sortTables = (list: Table[]) =>
    [...list].sort((a, b) => {
      const aAssigned = Boolean(a.captainId);
      const bAssigned = Boolean(b.captainId);

      if (aAssigned !== bAssigned) {
        return aAssigned ? -1 : 1;
      }

      return a.tableNumber - b.tableNumber;
    });

  const manualTables = sortTables(tables?.filter((t) => isManualTable(t)) ?? []);
  const autoTables = sortTables(tables?.filter((t) => !isManualTable(t)) ?? []);
  const deletingTableId = deleteTableMutation.variables;

  const handleDeleteTable = (table: Table) => {
    deleteTableMutation.mutate(table.id);
  };

  const handleStatusChange = (table: Table, status: "available" | "booked") => {
    statusMutation.mutate({ tableId: table.id, status });
  };

  const statusLoadingId = statusMutation.isPending ? statusMutation.variables?.tableId ?? null : null;

  const filteredByType =
    tableFilter === "manual"
      ? manualTables
      : tableFilter === "auto"
      ? autoTables
      : sortTables(tables ?? []);

  const filteredTables = filteredByType.filter((table) => {
    if (statusFilter === "available" && !table.isActive) {
      return false;
    }
    if (statusFilter === "booked" && table.isActive) {
      return false;
    }

    if (captainAssignmentFilter === "assigned" && !table.captainId) {
      return false;
    }

    if (captainAssignmentFilter === "unassigned" && table.captainId) {
      return false;
    }

    return true;
  });

  const emptyMessage =
    tableFilter === "all" && statusFilter === "all"
      ? "No tables created yet."
      : "No tables match the selected filters.";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Table Management</h1>
          <p className="text-muted-foreground mt-2">
            Create and manage your restaurant tables with unique QR codes
          </p>
        </div>

        {/* ✅ Separate buttons, not nested dialogs */}
        <div className="flex gap-3">
          {/* Auto Create Tables */}
          <Dialog open={isCreating} onOpenChange={setIsCreating}>
            <DialogTrigger asChild>
              <Button data-testid="button-create-table">
                <Plus className="h-4 w-4 mr-2" />
                Auto Create Tables
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Tables</DialogTitle>
                <DialogDescription>
                  Enter how many tables you want to create automatically.
                </DialogDescription>
              </DialogHeader>

              <div className="py-4 space-y-4">
                <div>
                  <Label htmlFor="noOfTables">Number of Tables</Label>
                  <input
                    id="noOfTables"
                    type="number"
                    min={1}
                    className="w-full mt-2 border rounded-md px-3 py-2"
                    value={noOfTables}
                    onChange={(e) => setNoOfTables(parseInt(e.target.value))}
                  />
                </div>

                <Button
                  onClick={() => createTableMutation.mutate()}
                  disabled={createTableMutation.isPending}
                  className="w-full"
                >
                  {createTableMutation.isPending ? "Creating..." : "Create Tables"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* ✅ Manual Table Button */}
          <ManualTableButton />
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-64 w-full" />
          ))}
        </div>
      ) : tables && tables.length > 0 ? (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h2 className="text-xl font-semibold">Tables</h2>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Select value={tableFilter} onValueChange={(value) => setTableFilter(value as "all" | "manual" | "auto")}>
                <SelectTrigger className="w-[180px]" data-testid="select-table-filter">
                  <SelectValue placeholder="Filter tables" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                  <SelectItem value="auto">Auto</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as "all" | "available" | "booked")}
              >
                <SelectTrigger className="w-[200px]" data-testid="select-table-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="available">Available</SelectItem>
                  <SelectItem value="booked">Booked</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={captainAssignmentFilter}
                onValueChange={(value) =>
                  setCaptainAssignmentFilter(value as "all" | "assigned" | "unassigned")
                }
              >
                <SelectTrigger className="w-[220px]" data-testid="select-table-captain-filter">
                  <SelectValue placeholder="Filter by captain assignment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Tables</SelectItem>
                  <SelectItem value="assigned">Assigned to Captain</SelectItem>
                  <SelectItem value="unassigned">Unassigned</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {filteredTables.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filteredTables.map((table) => (
                <TableCard
                  key={table.id}
                  table={table}
                  captains={captains}
                  assignCaptainMutation={assignCaptainMutation}
                  handleDownloadQR={handleDownloadQR}
                  onDelete={handleDeleteTable}
                  isDeleting={Boolean(deleteTableMutation.isPending && deletingTableId === table.id)}
                  isManual={isManualTable(table)}
                  onStatusChange={handleStatusChange}
                  statusLoadingId={statusLoadingId}
                />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">{emptyMessage}</p>
          )}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <QrCodeIcon className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No tables yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Create your first table to get started with QR ordering
            </p>
            <Button
              onClick={() => setIsCreating(true)}
              data-testid="button-create-first-table"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create First Table
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
