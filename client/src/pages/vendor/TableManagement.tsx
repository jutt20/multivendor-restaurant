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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, QrCode as QrCodeIcon, Download } from "lucide-react";
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
}: {
  table: Table;
  captains?: Captain[];
  assignCaptainMutation: any;
  handleDownloadQR: (table: Table) => void;
}) {
  return (
    <Card key={table.id} className="hover-elevate" data-testid={`card-table-${table.id}`}>
      <CardHeader className="space-y-0 pb-4">
        <div className="flex items-start justify-between">
          <CardTitle className="text-2xl font-mono">
            Table {table.tableNumber}
          </CardTitle>
          <div
            className={`px-2 py-1 rounded text-xs font-medium ${
              table.isActive
                ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400"
                : "bg-gray-100 text-gray-700 dark:bg-gray-950 dark:text-gray-400"
            }`}
          >
            {table.isActive ? "Active" : "Inactive"}
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

  // ✅ Sort assigned first, then unassigned
  const assignedTables = tables?.filter((t) => t.captainId) || [];
  const unassignedTables = tables?.filter((t) => !t.captainId) || [];

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
        <div className="space-y-10">
          {/* Assigned Tables */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Assigned Tables</h2>
            {assignedTables.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {assignedTables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    captains={captains}
                    assignCaptainMutation={assignCaptainMutation}
                    handleDownloadQR={handleDownloadQR}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                No tables are currently assigned.
              </p>
            )}
          </div>

          {/* Unassigned Tables */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Unassigned Tables</h2>
            {unassignedTables.length > 0 ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {unassignedTables.map((table) => (
                  <TableCard
                    key={table.id}
                    table={table}
                    captains={captains}
                    assignCaptainMutation={assignCaptainMutation}
                    handleDownloadQR={handleDownloadQR}
                  />
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">
                All tables are currently assigned.
              </p>
            )}
          </div>
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
