import { useState } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import VendorRegistrationModal from "@/components/VendorRegistrationModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { 
  QrCode, 
  Users, 
  ClipboardList, 
  BarChart3, 
  Smartphone, 
  Clock,
  CheckCircle2,
  ArrowRight,
  Upload,
} from "lucide-react";
import heroImage from "@assets/generated_images/Restaurant_owner_with_tablet_dashboard_e0543e9e.png";
import logoImage from "@assets/generated_images/logo.jpg";

export default function Landing() {
  const [isRegistering, setIsRegistering] = useState(false);
  const [isCaptainLogin, setIsCaptainLogin] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <img
                  src={logoImage}
                  alt="Logo"
                  className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">Hukam Mere Aaka</span>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Dialog open={isCaptainLogin} onOpenChange={setIsCaptainLogin}>
                <DialogTrigger asChild>
                  <Button variant="ghost" data-testid="button-captain-login">Captain Login</Button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle>Captain Login</DialogTitle>
                    <DialogDescription>
                      Sign in with your captain credentials
                    </DialogDescription>
                  </DialogHeader>
                  <CaptainLoginForm onClose={() => setIsCaptainLogin(false)} />
                </DialogContent>
              </Dialog>
              <Button variant="ghost" onClick={() => window.location.href = "/login"} data-testid="button-login">
                Vendor Sign In
              </Button>
              <Button
                data-testid="button-register"
                onClick={() => setIsRegistering(true)}
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden border-b">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20 lg:py-32">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight">
                  Transform Your Restaurant with{" "}
                  <span className="text-primary">QR Ordering</span>
                </h1>
                <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl">
                  Streamline your dine-in service with our comprehensive platform. 
                  Manage tables, menus, staff, and orders all in one place.
                </p>
              </div>
              <div className="flex flex-wrap gap-8 pt-4">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">No credit card required</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Free setup support</span>
                </div>
              </div>
            </div>
            <div className="relative">
              <div className="relative rounded-lg overflow-hidden shadow-2xl">
                <img
                  src={heroImage}
                  alt="Restaurant owner managing orders on tablet"
                  className="w-full h-auto object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 lg:py-32 border-b">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold">How It Works</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              Get started in three simple steps and revolutionize your restaurant operations
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Register & Get Approved",
                description: "Sign up with your restaurant details and documents. Our team reviews and approves your account within 24 hours.",
                icon: Upload,
              },
              {
                step: "2",
                title: "Set Up Your Restaurant",
                description: "Create tables with unique QR codes, add your menu items, and assign staff members to tables.",
                icon: QrCode,
              },
              {
                step: "3",
                title: "Start Taking Orders",
                description: "Customers scan QR codes to order. You manage everything from a powerful dashboard in real-time.",
                icon: ClipboardList,
              },
            ].map((item, i) => (
              <Card key={i} className="relative hover-elevate">
                <CardHeader>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
                      <item.icon className="h-6 w-6" />
                    </div>
                    <span className="text-4xl font-bold text-muted-foreground/20">{item.step}</span>
                  </div>
                  <CardTitle>{item.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="text-base">{item.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-20 lg:py-32 border-b">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold">Everything You Need</h2>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
              A complete solution for modern restaurant management
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: QrCode,
                title: "QR Code Ordering",
                description: "Generate unique QR codes for each table. Customers scan and order directly from their phones.",
              },
              {
                icon: ClipboardList,
                title: "Menu Management",
                description: "Easily add, edit, and organize your menu items. Control availability and pricing in real-time.",
              },
              {
                icon: Users,
                title: "Staff Management",
                description: "Create captain accounts, assign tables, and track order handling by your team members.",
              },
              {
                icon: BarChart3,
                title: "Analytics & Reports",
                description: "Get insights into sales, popular items, and peak hours with comprehensive reporting.",
              },
              {
                icon: Clock,
                title: "Real-Time Updates",
                description: "Track order status from placement to delivery with live notifications for staff and customers.",
              },
              {
                icon: Smartphone,
                title: "Mobile Ready",
                description: "Manage your restaurant from any device. Perfect for floor staff and on-the-go management.",
              },
            ].map((feature, i) => (
              <Card key={i} className="hover-elevate">
                <CardHeader>
                  <div className="flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-4">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 lg:py-32">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Card className="bg-primary text-primary-foreground border-0">
            <CardContent className="p-12 lg:p-16 text-center space-y-6">
              <h2 className="text-3xl sm:text-4xl font-bold">Ready to Modernize Your Restaurant?</h2>
              <p className="text-lg opacity-90 max-w-2xl mx-auto">
                Join hundreds of restaurants already using Hukam Mere Aaka to streamline their operations
              </p>
              <Button
                size="lg"
                variant="secondary"
                onClick={() => setIsRegistering(true)}
                data-testid="button-cta-register"
              >
                Get Started Now
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2">
              <img src={logoImage} alt="Logo" className="h-6 w-6 text-primary" />
              <span className="font-semibold">Hukam Mere Aaka</span>
            </div>
            <p className="text-sm text-muted-foreground">
              © 2025 Hukam Mere Aaka. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
      <VendorRegistrationModal open={isRegistering} onOpenChange={setIsRegistering} />
    </div>
  );
}

function CaptainLoginForm({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const handleLogin = async () => {
    setError("");
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/auth/captain/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });
      
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || "Login failed");
        setIsLoading(false);
        return;
      }
      
      // Wait for auth query to refetch before redirecting
      await queryClient.refetchQueries({ queryKey: ["/api/auth/user"] });
      
      // Small delay to ensure auth state is updated in the router
      setTimeout(() => {
        setLocation("/captain");
        onClose();
      }, 100);
    } catch (err) {
      setError("Login failed. Please try again.");
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="captain-username">Username</Label>
        <Input
          id="captain-username"
          placeholder="captain1"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          data-testid="input-captain-username"
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="captain-password">Password</Label>
        <Input
          id="captain-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="input-captain-password"
          onKeyDown={(e) => e.key === "Enter" && handleLogin()}
        />
      </div>
      {error && (
        <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
      )}
      <Button
        onClick={handleLogin}
        disabled={isLoading || !username || !password}
        className="w-full"
        data-testid="button-captain-login-submit"
      >
        {isLoading ? "Signing in..." : "Sign In"}
      </Button>
    </div>
  );
}
