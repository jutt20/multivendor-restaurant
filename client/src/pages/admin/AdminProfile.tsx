"use client";

import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Eye, EyeOff } from "lucide-react";

type UserProfile = {
  id: string;
  fullName: string | null;
  email: string | null;
  phoneNumber: string | null;
  username: string | null;
  role: string;
};

export default function AdminProfile() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [formState, setFormState] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    username: "",
    password: "",
    confirmPassword: "",
  });

  const { data: profile, isLoading } = useQuery<UserProfile>({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch profile");
      return res.json();
    },
  });

  useEffect(() => {
    if (profile) {
      setFormState({
        fullName: profile.fullName || "",
        email: profile.email || "",
        phoneNumber: profile.phoneNumber || "",
        username: profile.username || "",
        password: "",
        confirmPassword: "",
      });
    }
  }, [profile]);

  const updateProfileMutation = useMutation({
    mutationFn: async (updates: {
      fullName?: string;
      email?: string;
      phoneNumber?: string;
      username?: string;
      password?: string;
    }) => {
      const res = await apiRequest("PUT", `/api/admin/system-users/${currentUser?.id}`, updates);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      setFormState((prev) => ({ ...prev, password: "", confirmPassword: "" }));
      toast({
        title: "Success",
        description: "Profile updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update profile",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formState.password && formState.password.length < 4) {
      toast({
        title: "Error",
        description: "Password must be at least 4 characters long",
        variant: "destructive",
      });
      return;
    }

    if (formState.password && formState.password !== formState.confirmPassword) {
      toast({
        title: "Error",
        description: "Passwords do not match",
        variant: "destructive",
      });
      return;
    }

    const updates: {
      fullName?: string;
      email?: string;
      phoneNumber?: string;
      username?: string;
      password?: string;
    } = {
      fullName: formState.fullName || null,
      email: formState.email || null,
      phoneNumber: formState.phoneNumber || null,
    };

    if (formState.password) {
      updates.password = formState.password;
    }

    updateProfileMutation.mutate(updates);
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-10 w-60" />
          <Skeleton className="h-4 w-96 mt-2" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Profile</h1>
        <p className="text-muted-foreground mt-2">
          Manage your admin account information and password.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              Update your personal information and contact details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={formState.fullName}
                onChange={(e) =>
                  setFormState({ ...formState, fullName: e.target.value })
                }
                placeholder="Enter your full name"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formState.email}
                onChange={(e) =>
                  setFormState({ ...formState, email: e.target.value })
                }
                placeholder="Enter your email"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                value={formState.phoneNumber}
                onChange={(e) =>
                  setFormState({ ...formState, phoneNumber: e.target.value })
                }
                placeholder="Enter your phone number"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={formState.username}
                disabled
                className="bg-muted"
                placeholder="Username (cannot be changed)"
              />
              <p className="text-xs text-muted-foreground">
                Username cannot be changed after account creation.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change Password</CardTitle>
            <CardDescription>
              Leave blank to keep your current password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formState.password}
                  onChange={(e) =>
                    setFormState({ ...formState, password: e.target.value })
                  }
                  placeholder="Enter new password (min 4 characters)"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <div className="relative">
                <Input
                  id="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  value={formState.confirmPassword}
                  onChange={(e) =>
                    setFormState({ ...formState, confirmPassword: e.target.value })
                  }
                  placeholder="Confirm new password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-4">
          <Button
            type="submit"
            disabled={updateProfileMutation.isPending}
          >
            {updateProfileMutation.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}

