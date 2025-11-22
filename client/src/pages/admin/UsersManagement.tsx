import { useMemo, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Users,
  Phone,
  Mail,
  CheckCircle,
  XCircle,
  Calendar,
  Search,
  Filter,
  X,
  ArrowUpDown,
  MapPin,
  MoreHorizontal,
  Edit,
  Trash2,
  Power,
  Shield,
  UserPlus,
  Eye,
  EyeOff,
} from "lucide-react";
import type { User, AppUser } from "@shared/schema";

type UserWithRestaurant = User & { restaurantName?: string | null };
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

type AppUserWithStats = AppUser & { orderCount: number };
type SystemUserSortField = "name" | "email" | "role" | "createdAt";
type AppUserSortField = "name" | "phone" | "email" | "orderCount" | "createdAt";
type SortDirection = "asc" | "desc";

export default function UsersManagement() {
  const [activeTab, setActiveTab] = useState<"system" | "app">("system");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">User Management</h1>
        <p className="text-muted-foreground mt-2">
          Manage system users (Admins, Vendors, Captains) and mobile app users (Customers)
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "system" | "app")}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="system">System Users</TabsTrigger>
          <TabsTrigger value="app">Mobile App Users</TabsTrigger>
        </TabsList>

        <TabsContent value="system" className="space-y-6">
          <SystemUsersTab />
        </TabsContent>

        <TabsContent value="app" className="space-y-6">
          <AppUsersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SystemUsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user: currentUser } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [verificationFilter, setVerificationFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<SystemUserSortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [editingUser, setEditingUser] = useState<UserWithRestaurant | null>(null);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearchTerm.trim()) params.set("search", debouncedSearchTerm.trim());
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (statusFilter !== "all") params.set("isActive", statusFilter === "active" ? "true" : "false");
    if (verificationFilter !== "all") params.set("isVerified", verificationFilter === "verified" ? "true" : "false");
    return params.toString();
  }, [debouncedSearchTerm, roleFilter, statusFilter, verificationFilter]);

  const { data: users, isLoading } = useQuery<UserWithRestaurant[]>({
    queryKey: ["/api/admin/system-users", queryParams],
    queryFn: async () => {
      const url = `/api/admin/system-users${queryParams ? `?${queryParams}` : ""}`;
      const response = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const rawBody = await response.text();
      if (!response.ok) {
        throw new Error(rawBody || "Failed to fetch users");
      }

      try {
        return JSON.parse(rawBody) as UserWithRestaurant[];
      } catch {
        throw new Error(
          rawBody && rawBody.trim().startsWith("<")
            ? "The server returned HTML instead of JSON. Please check the API endpoint."
            : "Failed to parse users response.",
        );
      }
    },
    refetchInterval: 30000,
  });


  // Mutations
  const updateUserMutation = useMutation({
    mutationFn: async (data: { id: string; updates: Partial<UserWithRestaurant> }) => {
      const res = await apiRequest("PUT", `/api/admin/system-users/${data.id}`, data.updates);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-users"] });
      setEditingUser(null);
      toast({ title: "Success", description: "User updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      const res = await apiRequest("DELETE", `/api/admin/system-users/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-users"] });
      setDeleteUser(null);
      toast({ title: "Success", description: "User deactivated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async (data: { id: string; isActive: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/system-users/${data.id}/status`, { isActive: data.isActive });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-users"] });
      toast({ title: "Success", description: "User status updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update user status",
        variant: "destructive",
      });
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (data: typeof createForm) => {
      const res = await apiRequest("POST", `/api/admin/system-users`, data);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/system-users"] });
      setCreatingUser(false);
      setCreateForm({
        fullName: "",
        email: "",
        phoneNumber: "",
        role: "vendor",
        password: "",
        isActive: true,
        isVerified: false,
        vendorId: "",
      });
      toast({ title: "Success", description: "User created successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to create user",
        variant: "destructive",
      });
    },
  });

  const [editForm, setEditForm] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    role: "vendor" as "admin" | "vendor" | "captain" | "owner",
    password: "",
    isActive: true,
    isVerified: false,
    vendorId: "" as string | number | "",
  });

  const [createForm, setCreateForm] = useState({
    fullName: "",
    email: "",
    phoneNumber: "",
    role: "vendor" as "admin" | "vendor" | "captain" | "owner",
    password: "",
    isActive: true,
    isVerified: false,
    vendorId: "" as string | number | "",
  });

  // Fetch vendors for owner assignment
  const { data: vendors } = useQuery<Array<{ id: number; restaurantName: string }>>({
    queryKey: ["/api/admin/vendors"],
    queryFn: async () => {
      const response = await fetch("/api/admin/vendors", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        throw new Error("Failed to fetch vendors");
      }
      return (await response.json()) as Array<{ id: number; restaurantName: string }>;
    },
    enabled: createForm.role === "owner" || editForm.role === "owner",
  });

  const sortedUsers = useMemo(() => {
    if (!users) return [];
    
    const sorted = [...users].sort((a, b) => {
      let aValue: string | number | Date | null | undefined;
      let bValue: string | number | Date | null | undefined;

      switch (sortField) {
        case "name":
          aValue = a.fullName ?? "";
          bValue = b.fullName ?? "";
          break;
        case "email":
          aValue = a.email ?? "";
          bValue = b.email ?? "";
          break;
        case "role":
          aValue = a.role ?? "";
          bValue = b.role ?? "";
          break;
        case "createdAt":
          aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aValue === bValue) return 0;
      
      const comparison = 
        typeof aValue === "string" && typeof bValue === "string"
          ? aValue.localeCompare(bValue)
          : typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [users, sortField, sortDirection]);

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    try {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "N/A";
    }
  };

  const getRoleBadgeVariant = (role: string) => {
    switch (role.toLowerCase()) {
      case "admin":
        return "destructive";
      case "vendor":
        return "default";
      case "owner":
        return "default";
      case "captain":
        return "secondary";
      default:
        return "outline";
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setRoleFilter("all");
    setStatusFilter("all");
    setVerificationFilter("all");
  };

  const hasActiveFilters = 
    searchTerm.trim() !== "" ||
    roleFilter !== "all" ||
    statusFilter !== "all" ||
    verificationFilter !== "all";

  const stats = useMemo(() => {
    if (!users) {
      return { total: 0, admins: 0, vendors: 0, owners: 0, captains: 0, active: 0, inactive: 0, verified: 0, unverified: 0 };
    }

    return {
      total: users.length,
      admins: users.filter((u) => u.role === "admin").length,
      vendors: users.filter((u) => u.role === "vendor").length,
      owners: users.filter((u) => u.role === "owner").length,
      captains: users.filter((u) => u.role === "captain").length,
      active: users.filter((u) => u.isActive).length,
      inactive: users.filter((u) => !u.isActive).length,
      verified: users.filter((u) => u.isVerified).length,
      unverified: users.filter((u) => !u.isVerified).length,
    };
  }, [users]);

  const handleSort = (field: SystemUserSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleEdit = (user: UserWithRestaurant) => {
    setEditForm({
      fullName: user.fullName || "",
      email: user.email || "",
      phoneNumber: user.phoneNumber || "",
      role: user.role as "admin" | "vendor" | "captain" | "owner",
      password: "",
      isActive: user.isActive ?? true,
      isVerified: user.isVerified ?? false,
      vendorId: "",
    });
    setEditingUser(user);
    setShowEditPassword(false);
  };

  const handleSaveEdit = () => {
    if (!editingUser) return;
    const updates: Partial<typeof editForm> = { ...editForm };
    // Only include password if it's not empty
    if (!updates.password || updates.password.trim() === "") {
      delete updates.password;
    }
    updateUserMutation.mutate({
      id: editingUser.id,
      updates,
    });
  };

  const handleCreateUser = () => {
    createUserMutation.mutate(createForm);
  };

  const handleToggleStatus = (user: User) => {
    toggleStatusMutation.mutate({
      id: user.id,
      isActive: !user.isActive,
    });
  };

  const handleDelete = (user: User) => {
    deleteUserMutation.mutate(user.id);
  };

  const isCurrentUser = (userId: string) => userId === currentUser?.id;

  const SortButton = ({ field, children }: { field: SystemUserSortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 lg:px-3"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field && (
        <ArrowUpDown className={`ml-2 h-3 w-3 ${sortDirection === "desc" ? "rotate-180" : ""}`} />
      )}
    </Button>
  );

  return (
    <>
      {/* Stats Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats.total}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Vendors</CardTitle>
            <Users className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats.vendors}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Owners</CardTitle>
            <Users className="h-4 w-4 text-orange-600 dark:text-orange-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats.owners}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Captains</CardTitle>
            <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats.captains}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Users</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats.active}</div>}
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>System Users</CardTitle>
          <Button onClick={() => setCreatingUser(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Filters */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by name, email, phone, or ID..."
                    className="pl-9"
                  />
                </div>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="sm:w-auto">
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Filters:</span>
                </div>
                
                <Select value={roleFilter} onValueChange={setRoleFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="vendor">Vendor</SelectItem>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="captain">Captain</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={verificationFilter} onValueChange={setVerificationFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Verification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="unverified">Unverified</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {!isLoading && users && (
                <span className="text-sm text-muted-foreground">
                  Showing {sortedUsers.length} of {users.length} users
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !users || users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No users found</p>
              </div>
            ) : sortedUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No users match your filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold">
                        <SortButton field="name">Name</SortButton>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">
                        <SortButton field="email">Contact</SortButton>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">
                        <SortButton field="role">Role</SortButton>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">Restaurant</th>
                      <th className="text-left py-3 px-4 font-semibold">Status</th>
                      <th className="text-left py-3 px-4 font-semibold">
                        <SortButton field="createdAt">Created</SortButton>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-medium">{user.fullName || "N/A"}</p>
                            <p className="text-sm text-muted-foreground">ID: {user.id}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="space-y-1">
                            {user.email && (
                              <div className="flex items-center gap-2 text-sm">
                                <Mail className="h-3 w-3 text-muted-foreground" />
                                <span>{user.email}</span>
                              </div>
                            )}
                            {user.phoneNumber && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Phone className="h-3 w-3" />
                                <span>{user.phoneNumber}</span>
                              </div>
                            )}
                            {!user.email && !user.phoneNumber && (
                              <span className="text-sm text-muted-foreground">N/A</span>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <Badge variant={getRoleBadgeVariant(user.role)}>
                            {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                          </Badge>
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-sm">{user.restaurantName || "N/A"}</span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex flex-col gap-1">
                            {user.isActive ? (
                              <Badge variant="default" className="bg-green-600 w-fit">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="w-fit">
                                <XCircle className="h-3 w-3 mr-1" />
                                Inactive
                              </Badge>
                            )}
                            {user.isVerified ? (
                              <Badge variant="outline" className="w-fit text-green-600 border-green-600">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                Verified
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="w-fit text-muted-foreground">
                                <XCircle className="h-3 w-3 mr-1" />
                                Unverified
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDate(user.createdAt)}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleEdit(user)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => handleToggleStatus(user)}
                                  disabled={isCurrentUser(user.id) && (user.isActive === true)}
                                >
                                  <Power className="h-4 w-4 mr-2" />
                                  {user.isActive ? "Deactivate" : "Activate"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setDeleteUser(user)}
                                  disabled={isCurrentUser(user.id)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information below.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                value={editForm.fullName}
                onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                placeholder="Enter full name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="Enter email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phoneNumber">Phone Number</Label>
              <Input
                id="phoneNumber"
                value={editForm.phoneNumber}
                onChange={(e) => setEditForm({ ...editForm, phoneNumber: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="role">Role</Label>
              <Select value={editForm.role} onValueChange={(value) => setEditForm({ ...editForm, role: value as "admin" | "vendor" | "captain" | "owner" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="captain">Captain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-password">Password (leave blank to keep current)</Label>
              <div className="relative">
                <Input
                  id="edit-password"
                  type={showEditPassword ? "text" : "password"}
                  value={editForm.password}
                  onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                  placeholder="Enter new password (min 4 characters)"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowEditPassword(!showEditPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showEditPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={editForm.isActive}
                  onChange={(e) => setEditForm({ ...editForm, isActive: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="isActive" className="cursor-pointer">Active</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="isVerified"
                  checked={editForm.isVerified}
                  onChange={(e) => setEditForm({ ...editForm, isVerified: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="isVerified" className="cursor-pointer">Verified</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate the user account. They will not be able to log in. This action can be reversed by activating the user again.
              {deleteUser && (
                <>
                  <br />
                  <br />
                  <strong>User:</strong> {deleteUser.fullName || deleteUser.email || deleteUser.id}
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser && handleDelete(deleteUser)}
              disabled={deleteUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUserMutation.isPending ? "Deactivating..." : "Deactivate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create User Dialog */}
      <Dialog open={creatingUser} onOpenChange={(open) => !open && setCreatingUser(false)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>Fill in the information to create a new system user.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="create-fullName">Full Name</Label>
              <Input
                id="create-fullName"
                value={createForm.fullName}
                onChange={(e) => setCreateForm({ ...createForm, fullName: e.target.value })}
                placeholder="Enter full name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-email">Email *</Label>
              <Input
                id="create-email"
                type="email"
                value={createForm.email}
                onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                placeholder="Enter email"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-password">Password *</Label>
              <div className="relative">
                <Input
                  id="create-password"
                  type={showPassword ? "text" : "password"}
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                  placeholder="Enter password (min 4 characters)"
                  required
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
              <Label htmlFor="create-phoneNumber">Phone Number</Label>
              <Input
                id="create-phoneNumber"
                value={createForm.phoneNumber}
                onChange={(e) => setCreateForm({ ...createForm, phoneNumber: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="create-role">Role *</Label>
              <Select value={createForm.role} onValueChange={(value) => setCreateForm({ ...createForm, role: value as "admin" | "vendor" | "captain" | "owner", vendorId: "" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="vendor">Vendor</SelectItem>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="captain">Captain</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {createForm.role === "owner" && (
              <div className="grid gap-2">
                <Label htmlFor="create-vendorId">Assign to Vendor *</Label>
                <Select 
                  value={String(createForm.vendorId || "")} 
                  onValueChange={(value) => setCreateForm({ ...createForm, vendorId: value ? Number(value) : "" })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors?.map((vendor) => (
                      <SelectItem key={vendor.id} value={String(vendor.id)}>
                        {vendor.restaurantName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="flex items-center gap-4">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="create-isActive"
                  checked={createForm.isActive}
                  onChange={(e) => setCreateForm({ ...createForm, isActive: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="create-isActive" className="cursor-pointer">Active</Label>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="create-isVerified"
                  checked={createForm.isVerified}
                  onChange={(e) => setCreateForm({ ...createForm, isVerified: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="create-isVerified" className="cursor-pointer">Verified</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreatingUser(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateUser} 
              disabled={createUserMutation.isPending || !createForm.email || !createForm.password || (createForm.role === "owner" && !createForm.vendorId)}
            >
              {createUserMutation.isPending ? "Creating..." : "Create User"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AppUsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
  const [verificationFilter, setVerificationFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [sortField, setSortField] = useState<AppUserSortField>("createdAt");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");
  const [editingUser, setEditingUser] = useState<AppUserWithStats | null>(null);
  const [deleteUser, setDeleteUser] = useState<AppUserWithStats | null>(null);

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    if (debouncedSearchTerm.trim()) params.set("search", debouncedSearchTerm.trim());
    if (verificationFilter !== "all") params.set("isPhoneVerified", verificationFilter === "verified" ? "true" : "false");
    if (cityFilter !== "all") params.set("city", cityFilter);
    if (stateFilter !== "all") params.set("state", stateFilter);
    return params.toString();
  }, [debouncedSearchTerm, verificationFilter, cityFilter, stateFilter]);

  const { data: users, isLoading } = useQuery<AppUserWithStats[]>({
    queryKey: ["/api/admin/users", queryParams],
    queryFn: async () => {
      const url = `/api/admin/users${queryParams ? `?${queryParams}` : ""}`;
      const response = await fetch(url, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });

      const rawBody = await response.text();
      if (!response.ok) {
        throw new Error(rawBody || "Failed to fetch users");
      }

      try {
        return JSON.parse(rawBody) as AppUserWithStats[];
      } catch {
        throw new Error(
          rawBody && rawBody.trim().startsWith("<")
            ? "The server returned HTML instead of JSON. Please check the API endpoint."
            : "Failed to parse users response.",
        );
      }
    },
    refetchInterval: 30000,
  });

  // Mutations
  const updateUserMutation = useMutation({
    mutationFn: async (data: { id: number; updates: Partial<AppUser> }) => {
      const res = await apiRequest("PUT", `/api/admin/users/${data.id}`, data.updates);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setEditingUser(null);
      toast({ title: "Success", description: "User updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update user",
        variant: "destructive",
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId: number) => {
      const res = await apiRequest("DELETE", `/api/admin/users/${userId}`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      setDeleteUser(null);
      toast({ title: "Success", description: "User deleted successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to delete user",
        variant: "destructive",
      });
    },
  });

  const toggleVerificationMutation = useMutation({
    mutationFn: async (data: { id: number; isPhoneVerified: boolean }) => {
      const res = await apiRequest("PATCH", `/api/admin/users/${data.id}/verification`, { isPhoneVerified: data.isPhoneVerified });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({ title: "Success", description: "User verification status updated successfully" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error?.message || "Failed to update verification status",
        variant: "destructive",
      });
    },
  });

  const [editForm, setEditForm] = useState({
    name: "",
    email: "",
    phone: "",
    city: "",
    state: "",
    isPhoneVerified: false,
  });

  const sortedUsers = useMemo(() => {
    if (!users) return [];
    
    const sorted = [...users].sort((a, b) => {
      let aValue: string | number | Date | null | undefined;
      let bValue: string | number | Date | null | undefined;

      switch (sortField) {
        case "name":
          aValue = a.name ?? "";
          bValue = b.name ?? "";
          break;
        case "phone":
          aValue = a.phone ?? "";
          bValue = b.phone ?? "";
          break;
        case "email":
          aValue = a.email ?? "";
          bValue = b.email ?? "";
          break;
        case "orderCount":
          aValue = a.orderCount ?? 0;
          bValue = b.orderCount ?? 0;
          break;
        case "createdAt":
          aValue = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          bValue = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          break;
        default:
          return 0;
      }

      if (aValue === bValue) return 0;
      
      const comparison = 
        typeof aValue === "string" && typeof bValue === "string"
          ? aValue.localeCompare(bValue)
          : typeof aValue === "number" && typeof bValue === "number"
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));

      return sortDirection === "asc" ? comparison : -comparison;
    });

    return sorted;
  }, [users, sortField, sortDirection]);

  // Get unique cities and states for filters
  const uniqueCities = useMemo(() => {
    if (!users) return [];
    const cities = new Set<string>();
    users.forEach((u) => {
      if (u.city) cities.add(u.city);
    });
    return Array.from(cities).sort();
  }, [users]);

  const uniqueStates = useMemo(() => {
    if (!users) return [];
    const states = new Set<string>();
    users.forEach((u) => {
      if (u.state) states.add(u.state);
    });
    return Array.from(states).sort();
  }, [users]);

  const formatDate = (date: Date | string | null) => {
    if (!date) return "N/A";
    try {
      return new Date(date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "N/A";
    }
  };

  const formatLocation = (city?: string | null, state?: string | null) => {
    const parts = [city, state].map((value) => (typeof value === "string" ? value.trim() : "")).filter((value) => value.length > 0);
    if (parts.length === 0) return "N/A";
    return parts.join(", ");
  };

  const clearFilters = () => {
    setSearchTerm("");
    setVerificationFilter("all");
    setCityFilter("all");
    setStateFilter("all");
  };

  const hasActiveFilters = 
    searchTerm.trim() !== "" ||
    verificationFilter !== "all" ||
    cityFilter !== "all" ||
    stateFilter !== "all";

  const stats = useMemo(() => {
    if (!users) {
      return { total: 0, verified: 0, unverified: 0, totalOrders: 0 };
    }

    return {
      total: users.length,
      verified: users.filter((u) => u.isPhoneVerified).length,
      unverified: users.filter((u) => !u.isPhoneVerified).length,
      totalOrders: users.reduce((sum, u) => sum + (u.orderCount || 0), 0),
    };
  }, [users]);

  const handleSort = (field: AppUserSortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const handleEdit = (user: AppUserWithStats) => {
    setEditForm({
      name: user.name || "",
      email: user.email || "",
      phone: user.phone || "",
      city: user.city || "",
      state: user.state || "",
      isPhoneVerified: user.isPhoneVerified || false,
    });
    setEditingUser(user);
  };

  const handleSaveEdit = () => {
    if (!editingUser) return;
    updateUserMutation.mutate({
      id: editingUser.id,
      updates: editForm,
    });
  };

  const handleToggleVerification = (user: AppUserWithStats) => {
    toggleVerificationMutation.mutate({
      id: user.id,
      isPhoneVerified: !user.isPhoneVerified,
    });
  };

  const handleDelete = (user: AppUserWithStats) => {
    deleteUserMutation.mutate(user.id);
  };

  const SortButton = ({ field, children }: { field: AppUserSortField; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 px-2 lg:px-3"
      onClick={() => handleSort(field)}
    >
      {children}
      {sortField === field && (
        <ArrowUpDown className={`ml-2 h-3 w-3 ${sortDirection === "desc" ? "rotate-180" : ""}`} />
      )}
    </Button>
  );

  return (
    <>
      {/* Stats Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Users</CardTitle>
            <Users className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats.total}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Verified Users</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats.verified}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unverified Users</CardTitle>
            <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats.unverified}</div>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
            <Calendar className="h-4 w-4 text-purple-600 dark:text-purple-400" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Skeleton className="h-8 w-16" /> : <div className="text-3xl font-bold">{stats.totalOrders}</div>}
          </CardContent>
        </Card>
      </div>

      {/* Users Table */}
      <Card>
        <CardHeader>
          <CardTitle>Mobile App Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {/* Filters */}
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                    placeholder="Search by name, phone, email, city, state, or ID..."
                    className="pl-9"
                  />
                </div>
                {hasActiveFilters && (
                  <Button variant="outline" size="sm" onClick={clearFilters} className="sm:w-auto">
                    <X className="h-4 w-4 mr-2" />
                    Clear Filters
                  </Button>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Filter className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Filters:</span>
                </div>
                
                <Select value={verificationFilter} onValueChange={setVerificationFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Verification" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="verified">Verified</SelectItem>
                    <SelectItem value="unverified">Unverified</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={cityFilter} onValueChange={setCityFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="City" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {uniqueCities.map((city) => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={stateFilter} onValueChange={setStateFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="State" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {uniqueStates.map((state) => (
                      <SelectItem key={state} value={state}>{state}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!isLoading && users && (
                <span className="text-sm text-muted-foreground">
                  Showing {sortedUsers.length} of {users.length} users
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !users || users.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No users found</p>
              </div>
            ) : sortedUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No users match your filters.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-semibold">
                        <SortButton field="name">Customer</SortButton>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">
                        <SortButton field="phone">Contact</SortButton>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">Location</th>
                      <th className="text-left py-3 px-4 font-semibold">Status</th>
                      <th className="text-left py-3 px-4 font-semibold">
                        <SortButton field="orderCount">Orders</SortButton>
                      </th>
                      <th className="text-left py-3 px-4 font-semibold">
                        <SortButton field="createdAt">Registered</SortButton>
                      </th>
                      <th className="text-right py-3 px-4 font-semibold">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedUsers.map((user) => (
                      <tr key={user.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-4 px-4">
                          <div>
                            <p className="font-medium">{user.name}</p>
                            <p className="text-sm text-muted-foreground">ID: {user.id}</p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span>{user.phone}</span>
                            </div>
                            {user.email && (
                              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Mail className="h-3 w-3" />
                                <span>{user.email}</span>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <MapPin className="h-3 w-3" />
                            <span>{formatLocation(user.city, user.state)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          {user.isPhoneVerified ? (
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Verified
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <XCircle className="h-3 w-3 mr-1" />
                              Unverified
                            </Badge>
                          )}
                        </td>
                        <td className="py-4 px-4">
                          <span className="text-sm font-medium">{user.orderCount || 0}</span>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDate(user.createdAt)}
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex justify-end">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="sm">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => handleEdit(user)}>
                                  <Edit className="h-4 w-4 mr-2" />
                                  Edit
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleVerification(user)}>
                                  <Shield className="h-4 w-4 mr-2" />
                                  {user.isPhoneVerified ? "Mark as Unverified" : "Mark as Verified"}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={() => setDeleteUser(user)}
                                  className="text-destructive"
                                >
                                  <Trash2 className="h-4 w-4 mr-2" />
                                  Delete
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <Dialog open={!!editingUser} onOpenChange={(open) => !open && setEditingUser(null)}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user information below.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="app-name">Name</Label>
              <Input
                id="app-name"
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                placeholder="Enter name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="app-email">Email</Label>
              <Input
                id="app-email"
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                placeholder="Enter email"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="app-phone">Phone</Label>
              <Input
                id="app-phone"
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                placeholder="Enter phone number"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="app-city">City</Label>
              <Input
                id="app-city"
                value={editForm.city}
                onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                placeholder="Enter city"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="app-state">State</Label>
              <Input
                id="app-state"
                value={editForm.state}
                onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                placeholder="Enter state"
              />
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="app-isPhoneVerified"
                checked={editForm.isPhoneVerified}
                onChange={(e) => setEditForm({ ...editForm, isPhoneVerified: e.target.checked })}
                className="rounded border-gray-300"
              />
              <Label htmlFor="app-isPhoneVerified" className="cursor-pointer">Phone Verified</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingUser(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateUserMutation.isPending}>
              {updateUserMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete User?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the user account. This action cannot be undone.
              {deleteUser && (
                <>
                  <br />
                  <br />
                  <strong>User:</strong> {deleteUser.name} ({deleteUser.phone})
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteUserMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteUser && handleDelete(deleteUser)}
              disabled={deleteUserMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteUserMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
