"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type VendorProfileResponse = {
  vendor: {
    restaurantName?: string | null;
    address?: string | null;
    description?: string | null;
    cuisineType?: string | null;
    phone?: string | null;
    cnic?: string | null;
    gstin?: string | null;
    status?: string | null;
    isDeliveryEnabled?: boolean | null;
    isPickupEnabled?: boolean | null;
    isDeliveryAllowed?: boolean | null;
    isPickupAllowed?: boolean | null;
    paymentQrCodeUrl?: string | null;
  } | null;
  user: {
    fullName?: string | null;
    phoneNumber?: string | null;
    email?: string | null;
  } | null;
};

const coerceBoolean = (value: unknown, fallback = false): boolean => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "no", "off"].includes(normalized)) return false;
    if (["true", "1", "yes", "on"].includes(normalized)) return true;
  }
  return fallback;
};

type FormState = {
  restaurantName: string;
  address: string;
  description: string;
  cuisineType: string;
  phone: string;
  cnic: string;
  gstin: string;
  isDeliveryEnabled: boolean;
  isPickupEnabled: boolean;
};

const emptyState: FormState = {
  restaurantName: "",
  address: "",
  description: "",
  cuisineType: "",
  phone: "",
  cnic: "",
  gstin: "",
  isDeliveryEnabled: false,
  isPickupEnabled: false,
};

export default function ProfileSettings() {
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery<VendorProfileResponse>({
    queryKey: ["/api/vendor/profile"],
  });

  const [formState, setFormState] = useState<FormState>(emptyState);
  const [initialState, setInitialState] = useState<FormState>(emptyState);
  const [paymentQrUrl, setPaymentQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;

    const deliveryAllowed = coerceBoolean(profile.vendor?.isDeliveryAllowed, false);
    const pickupAllowed = coerceBoolean(profile.vendor?.isPickupAllowed, false);

    const next: FormState = {
      restaurantName: profile.vendor?.restaurantName ?? "",
      address: profile.vendor?.address ?? "",
      description: profile.vendor?.description ?? "",
      cuisineType: profile.vendor?.cuisineType ?? "",
      phone: profile.vendor?.phone ?? "",
      cnic: profile.vendor?.cnic ?? "",
      gstin: profile.vendor?.gstin ?? "",
      isDeliveryEnabled: deliveryAllowed
        ? coerceBoolean(profile.vendor?.isDeliveryEnabled, true)
        : false,
      isPickupEnabled: pickupAllowed
        ? coerceBoolean(profile.vendor?.isPickupEnabled, true)
        : false,
    };

    setFormState(next);
    setInitialState(next);
    setPaymentQrUrl(profile.vendor?.paymentQrCodeUrl ?? null);
  }, [profile]);

  const hasChanges = useMemo(() => {
    return (Object.keys(formState) as Array<keyof FormState>).some(
      (key) => formState[key] !== initialState[key],
    );
  }, [formState, initialState]);

  const updateProfile = useMutation({
    mutationFn: async (payload: Partial<FormState>) => {
      const res = await apiRequest("PUT", "/api/vendor/profile", payload);
      return res.json() as Promise<VendorProfileResponse>;
    },
    onSuccess: (data) => {
      if (data?.vendor) {
        const deliveryAllowed = coerceBoolean(data.vendor.isDeliveryAllowed, false);
        const pickupAllowed = coerceBoolean(data.vendor.isPickupAllowed, false);

        const next: FormState = {
          restaurantName: data.vendor.restaurantName ?? "",
          address: data.vendor.address ?? "",
          description: data.vendor.description ?? "",
          cuisineType: data.vendor.cuisineType ?? "",
          phone: data.vendor.phone ?? "",
          cnic: data.vendor.cnic ?? "",
          gstin: data.vendor.gstin ?? "",
          isDeliveryEnabled: deliveryAllowed
            ? coerceBoolean(data.vendor.isDeliveryEnabled, true)
            : false,
          isPickupEnabled: pickupAllowed
            ? coerceBoolean(data.vendor.isPickupEnabled, true)
            : false,
        };
        setFormState(next);
        setInitialState(next);
      }
      queryClient.setQueryData(["/api/vendor/profile"], data);
      setPaymentQrUrl(data?.vendor?.paymentQrCodeUrl ?? null);
      toast({ title: "Profile updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to update profile",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const uploadPaymentQr = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("paymentQr", file);

      const response = await fetch("/api/vendor/payment-qr", {
        method: "POST",
        body: formData,
        credentials: "include",
      });

      if (!response.ok) {
        let message = "Failed to upload payment QR";
        try {
          const errorPayload = await response.json();
          if (errorPayload?.message) {
            message = errorPayload.message;
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      return (await response.json()) as {
        paymentQrCodeUrl?: string | null;
        vendor?: VendorProfileResponse["vendor"];
        message?: string;
      };
    },
    onSuccess: (data) => {
      const nextUrl =
        data?.paymentQrCodeUrl ?? data?.vendor?.paymentQrCodeUrl ?? null;
      setPaymentQrUrl(nextUrl ?? null);
      queryClient.setQueryData<VendorProfileResponse | undefined>(
        ["/api/vendor/profile"],
        (previous) => {
          if (!previous) {
            return previous;
          }
          return {
            ...previous,
            vendor: {
              ...(previous.vendor ?? {}),
              paymentQrCodeUrl: nextUrl ?? null,
            },
          };
        },
      );
      toast({
        title: "Payment QR saved",
        description: "Customers will see the QR code on printed bills.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to upload QR",
        description: error?.message || "Please try again with a PNG or JPG file.",
        variant: "destructive",
      });
    },
  });

  const removePaymentQr = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/vendor/payment-qr", {
        method: "DELETE",
        credentials: "include",
      });

      if (!response.ok) {
        let message = "Failed to remove payment QR";
        try {
          const errorPayload = await response.json();
          if (errorPayload?.message) {
            message = errorPayload.message;
          }
        } catch {
          // ignore parse errors
        }
        throw new Error(message);
      }

      return (await response.json()) as {
        paymentQrCodeUrl?: string | null;
        vendor?: VendorProfileResponse["vendor"];
        message?: string;
      };
    },
    onSuccess: (data) => {
      setPaymentQrUrl(data?.paymentQrCodeUrl ?? null);
      queryClient.setQueryData<VendorProfileResponse | undefined>(
        ["/api/vendor/profile"],
        (previous) => {
          if (!previous) {
            return previous;
          }
          return {
            ...previous,
            vendor: {
              ...(previous.vendor ?? {}),
              paymentQrCodeUrl: null,
            },
          };
        },
      );
      toast({
        title: "Payment QR removed",
        description: "Upload a new QR code anytime.",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/profile"] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to remove QR",
        description: error?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleChange = (field: keyof FormState, value: string | boolean) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();

    const payload: Partial<FormState> = {};
    (Object.keys(formState) as Array<keyof FormState>).forEach((key) => {
      if (formState[key] !== initialState[key]) {
      Object.assign(payload, { [key]: formState[key] });
      }
    });

    if (Object.keys(payload).length === 0) {
      toast({
        title: "No changes to save",
        description: "Update a field before submitting.",
        variant: "destructive",
      });
      return;
    }

    updateProfile.mutate(payload);
  };

  const handlePaymentQrChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    const input = event.target;

    if (!file) {
      input.value = "";
      return;
    }

    const allowedTypes = new Set(["image/png", "image/jpeg", "image/jpg"]);
    if (!allowedTypes.has(file.type)) {
      toast({
        title: "Unsupported file type",
        description: "Please select a PNG or JPG image.",
        variant: "destructive",
      });
      input.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5 MB.",
        variant: "destructive",
      });
      input.value = "";
      return;
    }

    uploadPaymentQr.mutate(file, {
      onSettled: () => {
        input.value = "";
      },
    });
  };

  const vendorStatus = profile?.vendor?.status ?? "pending";
  const statusBadgeVariant = vendorStatus === "approved" ? "secondary" : "outline";
  const deliveryAllowed = coerceBoolean(profile?.vendor?.isDeliveryAllowed, false);
  const pickupAllowed = coerceBoolean(profile?.vendor?.isPickupAllowed, false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Profile</h1>
        <p className="text-muted-foreground mt-2">
          Keep your restaurant information and contact details up to date.
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-10 w-60" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle>Profile Overview</CardTitle>
              <CardDescription>
                Quick snapshot of the information currently stored for your restaurant.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Restaurant</p>
                <p className="text-sm font-medium">
                  {profile?.vendor?.restaurantName || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Cuisine</p>
                <p className="text-sm font-medium">
                  {profile?.vendor?.cuisineType || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">FSSAI Licence</p>
                <p className="text-sm font-medium">
                  {profile?.vendor?.cnic || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">GSTIN</p>
                <p className="text-sm font-medium">
                  {profile?.vendor?.gstin || "Not set"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Delivery</p>
                <p className="text-sm font-medium">
                  {coerceBoolean(profile?.vendor?.isDeliveryEnabled, true) ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Pickup</p>
                <p className="text-sm font-medium">
                  {coerceBoolean(profile?.vendor?.isPickupEnabled, true) ? "Enabled" : "Disabled"}
                </p>
              </div>
              <div className="md:col-span-2">
                <p className="text-xs font-semibold text-muted-foreground">Address</p>
                <p className="text-sm font-medium">
                  {profile?.vendor?.address || "Not set"}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle>Restaurant Details</CardTitle>
                <CardDescription>Information shown to your customers</CardDescription>
              </div>
              <Badge variant={statusBadgeVariant}>
                Status: {vendorStatus ? vendorStatus.toUpperCase() : "PENDING"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="restaurantName">Restaurant name</Label>
                  <Input
                    id="restaurantName"
                    value={formState.restaurantName}
                    onChange={(e) => handleChange("restaurantName", e.target.value)}
                    placeholder="e.g. QuickBite Kitchen"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cuisineType">Cuisine type</Label>
                  <Input
                    id="cuisineType"
                    value={formState.cuisineType}
                    onChange={(e) => handleChange("cuisineType", e.target.value)}
                    placeholder="e.g. Italian, Mexican"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formState.address}
                  onChange={(e) => handleChange("address", e.target.value)}
                  placeholder="Street, city, postal code"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formState.description}
                  onChange={(e) => handleChange("description", e.target.value)}
                  placeholder="Tell customers about your restaurant..."
                  rows={4}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Restaurant phone</Label>
                  <Input
                    id="phone"
                    value={formState.phone}
                    onChange={(e) => handleChange("phone", e.target.value)}
                    placeholder="+1 555 123 456"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cnic">FSSAI Licence Number</Label>
                  <Input
                    id="cnic"
                    value={formState.cnic}
                    onChange={(e) => handleChange("cnic", e.target.value)}
                    placeholder="Enter the FSSAI licence number"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gstin">GSTIN</Label>
                  <Input
                    id="gstin"
                    value={formState.gstin}
                    onChange={(e) => handleChange("gstin", e.target.value.toUpperCase())}
                    placeholder="e.g., 22AAAAA0000A1Z5"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
                  <div>
                    <p className="font-medium">Enable delivery</p>
                    <p className="text-xs text-muted-foreground">
                      Allow customers to place delivery orders.
                    </p>
                    {!deliveryAllowed && (
                      <p className="text-xs text-destructive mt-1">
                        Awaiting admin approval to manage delivery orders.
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={formState.isDeliveryEnabled}
                    onCheckedChange={(checked) => {
                      if (!deliveryAllowed && checked) return;
                      handleChange("isDeliveryEnabled", deliveryAllowed ? checked : false);
                    }}
                    disabled={!deliveryAllowed || updateProfile.isPending}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
                  <div>
                    <p className="font-medium">Enable pickup</p>
                    <p className="text-xs text-muted-foreground">
                      Allow customers to pick up their orders.
                    </p>
                    {!pickupAllowed && (
                      <p className="text-xs text-destructive mt-1">
                        Awaiting admin approval to manage pickup orders.
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={formState.isPickupEnabled}
                    onCheckedChange={(checked) => {
                      if (!pickupAllowed && checked) return;
                      handleChange("isPickupEnabled", pickupAllowed ? checked : false);
                    }}
                    disabled={!pickupAllowed || updateProfile.isPending}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Online Payment QR</CardTitle>
              <CardDescription>
                Upload a QR code image to let guests pay instantly from printed bills.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col gap-4 md:flex-row md:items-start">
                <div className="flex h-40 w-40 items-center justify-center rounded-md border bg-muted/40 p-2">
                  {paymentQrUrl ? (
                    <img
                      src={paymentQrUrl}
                      alt="Online payment QR"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <p className="text-center text-xs text-muted-foreground">
                      No QR uploaded yet
                    </p>
                  )}
                </div>
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="paymentQrUpload">Upload QR image</Label>
                    <Input
                      id="paymentQrUpload"
                      type="file"
                      accept="image/png,image/jpeg"
                      onChange={handlePaymentQrChange}
                      disabled={uploadPaymentQr.isPending}
                    />
                    <p className="text-xs text-muted-foreground">
                      PNG or JPG, up to 5 MB. This QR appears on printed invoices and receipts.
                    </p>
                  </div>
                  {paymentQrUrl && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => removePaymentQr.mutate()}
                      disabled={removePaymentQr.isPending}
                    >
                      {removePaymentQr.isPending ? "Removing..." : "Remove QR code"}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex justify-end gap-3">
            <Button
              type="button"
              variant="ghost"
              disabled={updateProfile.isPending || !hasChanges}
              onClick={() => setFormState(initialState)}
            >
              Reset
            </Button>
            <Button type="submit" disabled={updateProfile.isPending || !hasChanges}>
              {updateProfile.isPending ? "Saving..." : "Save changes"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

