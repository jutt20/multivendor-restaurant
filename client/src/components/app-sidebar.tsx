import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Grid3x3,
  Users,
  UtensilsCrossed,
  ClipboardList,
  Shield,
  CheckSquare,
  Settings,
  LogOut,
  QrCode,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "./ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import logoImage from "@assets/generated_images/logo.jpg";

type VendorProfileResponse = {
  vendor?: {
    restaurantName?: string | null;
  } | null;
};

const fallbackRestaurantName = "Hukam Mere Aaka";

export function AppSidebar() {
  const [location] = useLocation();
  const { user, isVendor, isOwner, isCaptain, isAdmin } = useAuth();
  const queryClient = useQueryClient();

  type NavItem = { title: string; url: string; icon: LucideIcon };
  type NavSection = { label: string; items: NavItem[] };

  const vendorLinks: NavItem[] = [
    { title: "Dashboard", url: "/vendor", icon: LayoutDashboard },
    { title: "Tables", url: "/vendor/tables", icon: Grid3x3 },
    { title: "Captains", url: "/vendor/captains", icon: Users },
    { title: "Menu", url: "/vendor/menu", icon: UtensilsCrossed },
    { title: "Orders", url: "/vendor/orders", icon: ClipboardList },
    { title: "Profile", url: "/vendor/profile", icon: Settings },
  ];

  const ownerLinks: NavItem[] = [
    { title: "Insights", url: "/owner", icon: LayoutDashboard },
  ];

  const captainLinks: NavItem[] = [
    { title: "My Tables", url: "/captain", icon: Grid3x3 },
    { title: "Orders", url: "/captain/orders", icon: ClipboardList },
  ];

  const adminLinks: NavItem[] = [
    { title: "Dashboard", url: "/admin", icon: LayoutDashboard },
    { title: "Vendor Approvals", url: "/admin/vendors", icon: CheckSquare },
    { title: "App Users", url: "/admin/users", icon: Users },
    { title: "Settings", url: "/admin/settings", icon: Settings },
  ];

  const navSections: NavSection[] = (() => {
    if (isOwner) {
      return [{ label: "Owner Overview", items: ownerLinks }];
    }
    if (isVendor) {
      return [{ label: "Restaurant Operations", items: vendorLinks }];
    }
    if (isCaptain) {
      return [{ label: "Captain Tools", items: captainLinks }];
    }
    if (isAdmin) {
      return [
        { label: "Platform Control", items: adminLinks.slice(0, 3) },
        { label: "Configuration", items: adminLinks.slice(3) },
      ];
    }
    return [];
  })();

  const getRoleColor = () => {
    if (isVendor || isOwner) return "text-vendor";
    if (isCaptain) return "text-captain";
    if (isAdmin) return "text-admin";
    return "text-primary";
  };

  const displayName = (user?.fullName && user.fullName.trim()) || user?.email || "User";
  const displayEmail = user?.email || user?.phoneNumber || "";
  const initials =
    displayName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "U";

  const { data: vendorProfile } = useQuery<VendorProfileResponse | null>({
    queryKey: ["/api/vendor/profile"],
    enabled: isVendor || isOwner,
    retry: false,
    queryFn: async () => {
      const res = await fetch("/api/vendor/profile", {
        credentials: "include",
        cache: "no-store",
      });

      if (res.status === 304) {
        return (
          queryClient.getQueryData<VendorProfileResponse | null>([
            "/api/vendor/profile",
          ]) ?? null
        );
      }

      if (res.status === 404) {
        return null;
      }

      if (!res.ok) {
        const message = (await res.text()) || "Failed to load vendor profile";
        throw new Error(message);
      }

      return res.json();
    },
  });

  const restaurantName =
    ((isVendor || isOwner) && vendorProfile?.vendor?.restaurantName) ||
    fallbackRestaurantName;

  const profileImageUrl =
    (user as Record<string, any> | undefined)?.profileImageUrl;

  return (
    <Sidebar>
      <SidebarHeader className="border-b p-4">
        <div className="flex items-center gap-3">
          <img src={logoImage} alt="Logo" className={`h-8 w-8 ${getRoleColor()}`} />
          <div className="flex flex-col">
            <span className="font-bold text-lg truncate" title={restaurantName}>
              {restaurantName}
            </span>
            <span className="text-xs text-muted-foreground capitalize">
              {user?.role} Panel
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {navSections.length === 0 ? (
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <div className="px-2 py-6 text-xs text-muted-foreground">
                No navigation items available for your role yet.
              </div>
            </SidebarGroupContent>
          </SidebarGroup>
        ) : (
          navSections.map((section) => (
            <SidebarGroup key={section.label}>
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {section.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={location === item.url}>
                        <a
                          href={item.url}
                          data-testid={`link-${item.title
                            .toLowerCase()
                            .replace(/\s+/g, "-")}`}
                        >
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </a>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))
        )}
      </SidebarContent>

      <SidebarFooter className="border-t p-4">
        <div className="flex items-center gap-3 mb-3">
          <Avatar className="h-10 w-10">
            <AvatarImage src={profileImageUrl || undefined} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{displayEmail}</p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          data-testid="button-logout"
          onClick={async () => {
            try {
              const res = await fetch("/api/logout", {
                method: "GET",
                credentials: "include",
              });
              const data = await res.json();

              if (data.success) {
                // Optional: clear local auth state if you store user info client-side
                localStorage.removeItem("user");
                window.location.href = "/"; // Redirect to home
              } else {
                alert(data.message || "Logout failed");
              }
            } catch (err) {
              console.error("Logout error:", err);
              alert("An error occurred during logout.");
            }
          }}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Sign Out
        </Button>
      </SidebarFooter>
    </Sidebar>
  );
}
