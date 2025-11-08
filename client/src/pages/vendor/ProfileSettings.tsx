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
    status?: string | null;
    isDeliveryEnabled?: boolean | null;
    isPickupEnabled?: boolean | null;
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
  isDeliveryEnabled: coerceBoolean(true, true),
  isPickupEnabled: coerceBoolean(true, true),
};

export default function ProfileSettings() {
  const { toast } = useToast();

  const { data: profile, isLoading } = useQuery<VendorProfileResponse>({
    queryKey: ["/api/vendor/profile"],
  });

  const [formState, setFormState] = useState<FormState>(emptyState);
  const [initialState, setInitialState] = useState<FormState>(emptyState);

  useEffect(() => {
    if (!profile) return;

    const next: FormState = {
      restaurantName: profile.vendor?.restaurantName ?? "",
      address: profile.vendor?.address ?? "",
      description: profile.vendor?.description ?? "",
      cuisineType: profile.vendor?.cuisineType ?? "",
      phone: profile.vendor?.phone ?? "",
      cnic: profile.vendor?.cnic ?? "",
      isDeliveryEnabled: coerceBoolean(profile.vendor?.isDeliveryEnabled, true),
      isPickupEnabled: coerceBoolean(profile.vendor?.isPickupEnabled, true),
    };

    setFormState(next);
    setInitialState(next);
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
        const next: FormState = {
          restaurantName: data.vendor.restaurantName ?? "",
          address: data.vendor.address ?? "",
          description: data.vendor.description ?? "",
          cuisineType: data.vendor.cuisineType ?? "",
          phone: data.vendor.phone ?? "",
          cnic: data.vendor.cnic ?? "",
          isDeliveryEnabled: coerceBoolean(data.vendor.isDeliveryEnabled, true),
          isPickupEnabled: coerceBoolean(data.vendor.isPickupEnabled, true),
        };
        setFormState(next);
        setInitialState(next);
      }
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

  const vendorStatus = profile?.vendor?.status ?? "pending";
  const statusBadgeVariant = vendorStatus === "approved" ? "secondary" : "outline";

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
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
                  <div>
                    <p className="font-medium">Enable delivery</p>
                    <p className="text-xs text-muted-foreground">
                      Allow customers to place delivery orders.
                    </p>
                  </div>
                  <Switch
                    checked={formState.isDeliveryEnabled}
                    onCheckedChange={(checked) => handleChange("isDeliveryEnabled", checked)}
                  />
                </div>
                <div className="flex items-center justify-between rounded-md border border-muted px-4 py-3">
                  <div>
                    <p className="font-medium">Enable pickup</p>
                    <p className="text-xs text-muted-foreground">
                      Allow customers to pick up their orders.
                    </p>
                  </div>
                  <Switch
                    checked={formState.isPickupEnabled}
                    onCheckedChange={(checked) => handleChange("isPickupEnabled", checked)}
                  />
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

