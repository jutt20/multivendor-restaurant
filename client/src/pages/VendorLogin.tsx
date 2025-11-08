import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ThemeToggle } from "@/components/ThemeToggle";
import { QrCode, ArrowLeft, Mail, Lock, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import VendorRegistrationForm from "@/components/VendorRegistrationForm";
import heroImage from "@assets/generated_images/Restaurant_owner_with_tablet_dashboard_e0543e9e.png";
import logoImage from "@assets/generated_images/logo.jpg";

// ✅ Wrapper component for handling registration steps
function VendorRegistrationFormWrapper({ onBack }: { onBack: () => void }) {
  const [step, setStep] = useState(1);

  return (
    <>
      <VendorRegistrationForm
        step={step}
        onStepChange={setStep}
        onClose={onBack}
      />
      <div className="pt-4 border-t mt-4 text-center">
        <Button
          variant="ghost"
          className="text-xs underline hover:no-underline"
          onClick={onBack}
        >
          Back to Login
        </Button>
      </div>
    </>
  );
}

export default function VendorLogin() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showRegister, setShowRegister] = useState(false);

  const { data: user } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: async () => {
      const res = await fetch("/api/auth/user", { credentials: "include" });
      if (!res.ok) return null;
      return res.json();
    },
    retry: false,
  });

  useEffect(() => {
    if (user) {
      if (user.role === "vendor") {
        setLocation("/vendor");
      } else if (user.role === "admin") {
        setLocation("/admin");
      }
    }
  }, [user, setLocation]);

  const loginMutation = useMutation({
    mutationFn: async (credentials: { email: string; password: string }) => {
      const res = await fetch("/api/auth/email-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Login failed");
      }

      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      toast({
        title: "Login Successful",
        description: `Welcome back!`,
      });

      if (data.user.role === "vendor") {
        setLocation("/vendor");
      } else if (data.user.role === "admin") {
        setLocation("/admin");
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Login Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast({
        title: "Validation Error",
        description: "Please enter both email and password",
        variant: "destructive",
      });
      return;
    }
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-2">
              <img src={logoImage} alt="Logo" className="h-8 w-8 text-primary" />
              <span className="text-xl font-bold">Hukam Mere Aaka</span>
            </div>
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Button
                variant="ghost"
                onClick={() => setLocation("/")}
                data-testid="button-back-home"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-md mx-auto">
          {!showRegister ? (
            <Card>
              <CardHeader className="space-y-1 text-center">
                <div className="flex justify-center mb-4">
                  <div className="p-3 rounded-full bg-primary/10">
                    <img src={logoImage} className="h-12 w-12 text-primary" />
                  </div>
                </div>
                <CardTitle className="text-2xl">Vendor & Admin Sign In</CardTitle>
                <CardDescription>
                  Enter your email and password to access your dashboard
                </CardDescription>
              </CardHeader>

              <CardContent>
                {/* LOGIN FORM */}
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email Address</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="admin@quickbiteqr.com"
                        className="pl-10"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loginMutation.isPending}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="Enter your password"
                        className="pl-10"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loginMutation.isPending}
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={loginMutation.isPending}
                  >
                    {loginMutation.isPending && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {loginMutation.isPending ? "Signing in..." : "Sign In"}
                  </Button>
                </form>

                {/* LINK TO REGISTER */}
                <div className="pt-4 border-t mt-4 text-center">
                  <p className="text-xs text-muted-foreground">
                    Don’t have an account?{" "}
                    <Button
                      variant="ghost"
                      className="p-0 h-auto text-xs underline hover:no-underline"
                      onClick={() => setShowRegister(true)}
                    >
                      Register here
                    </Button>
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            // REGISTRATION FORM
            <Card>
              <CardHeader className="text-center">
                <CardTitle className="text-2xl">Vendor Registration</CardTitle>
                <CardDescription>Fill out your details to register</CardDescription>
              </CardHeader>
              <CardContent>
                <VendorRegistrationFormWrapper onBack={() => setShowRegister(false)} />
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
