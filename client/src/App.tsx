import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeProvider } from "./components/ThemeProvider";
import { ThemeToggle } from "./components/ThemeToggle";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import VendorLogin from "@/pages/VendorLogin";

import VendorDashboard from "@/pages/vendor/VendorDashboard";
import TableManagement from "@/pages/vendor/TableManagement";
import CaptainManagement from "@/pages/vendor/CaptainManagement";
import MenuManagement from "@/pages/vendor/MenuManagement";
import OrderManagement from "@/pages/vendor/OrderManagement";
import ProfileSettings from "@/pages/vendor/ProfileSettings";

import CaptainDashboard from "@/pages/captain/CaptainDashboard";

import AdminDashboard from "@/pages/admin/AdminDashboard";
import VendorApprovals from "@/pages/admin/VendorApprovals";
import AdminSettings from "@/pages/admin/AdminSettings";
import UsersManagement from "@/pages/admin/UsersManagement";
import { useEffect } from "react";
import { useToast } from "@/hooks/use-toast";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  // 1️⃣ While auth is loading, show loader (NOT Landing)
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Loading...</p>
      </div>
    );
  }

  // 2️⃣ If user not authenticated → public routes only
  if (!isAuthenticated) {
    return (
      <Switch>
        <Route path="/" component={Landing} />
        <Route path="/login" component={VendorLogin} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  // 3️⃣ Authenticated routes
  const isVendor = user?.role === "vendor";
  const isCaptain = user?.role === "captain";
  const isAdmin = user?.role === "admin";

  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <SidebarProvider style={sidebarStyle as React.CSSProperties}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-col flex-1 overflow-hidden">
          <header className="flex items-center justify-between gap-4 p-4 border-b bg-background">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <ThemeToggle />
          </header>

          <main className="flex-1 overflow-y-auto p-6 bg-background">
            <Switch>
              {isVendor && (
                <>
                  <Route path="/vendor/profile" component={ProfileSettings} />
                  <Route path="/vendor/tables" component={TableManagement} />
                  <Route path="/vendor/captains" component={CaptainManagement} />
                  <Route path="/vendor/menu" component={MenuManagement} />
                  <Route path="/vendor/orders" component={OrderManagement} />
                  <Route path="/vendor" component={VendorDashboard} />
                  <Route path="/" component={VendorDashboard} />
                </>
              )}
              {isCaptain && (
                <>
                  <Route path="/captain" component={CaptainDashboard} />
                  <Route path="/" component={CaptainDashboard} />
                </>
              )}
              {isAdmin && (
                <>
                  <Route path="/admin" component={AdminDashboard} />
                  <Route path="/admin/vendors" component={VendorApprovals} />
                  <Route path="/admin/users" component={UsersManagement} />
                  <Route path="/admin/settings" component={AdminSettings} />
                  <Route path="/" component={AdminDashboard} />
                </>
              )}
              <Route component={NotFound} />
            </Switch>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
