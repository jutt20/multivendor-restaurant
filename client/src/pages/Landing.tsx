import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
  const [registrationStep, setRegistrationStep] = useState(1);
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
              <Dialog open={isRegistering} onOpenChange={setIsRegistering}>
                <DialogTrigger asChild>
                  <Button data-testid="button-register">Get Started</Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Vendor Registration</DialogTitle>
                    <DialogDescription>
                      Join our platform to start managing your restaurant with QR ordering
                    </DialogDescription>
                  </DialogHeader>
                  <VendorRegistrationForm 
                    step={registrationStep} 
                    onStepChange={setRegistrationStep}
                    onClose={() => setIsRegistering(false)}
                  />
                </DialogContent>
              </Dialog>
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
    </div>
  );
}

function VendorRegistrationForm({ step, onStepChange, onClose }: {
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}) {
  const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [files, setFiles] = useState<any>({});
  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.id]: e.target.value });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFiles({ ...files, [e.target.id]: e.target.files[0] });
    }
  };

  const validate = () => {
    const newErrors: any = {};

    if (!formData.firstName) newErrors.firstName = "First name is required";
    if (!formData.lastName) newErrors.lastName = "Last name is required";
    if (!formData.email) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = "Invalid email";
    if (!formData.phone) newErrors.phone = "Phone is required";
    // if (!formData.cnic) newErrors.cnic = "FSSAI License number is required";
    if (!formData.password) newErrors.password = "Password is required";

    if (step >= 2) {
      if (!formData.restaurantName) newErrors.restaurantName = "Restaurant name is required";
      if (!formData.address) newErrors.address = "Address is required";
      if (!formData.cuisineType) newErrors.cuisineType = "Cuisine type is required";
      if (!gpsLocation) newErrors.gps = "Location must be captured";
    }

    if (step === 3) {
      ["businessLicense", "taxCert", "idProof", "logo"].forEach((f) => {
        if (!files[f]) newErrors[f] = `${f} is required`;
      });
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    setLoading(true);

    const form = new FormData();
    Object.entries(formData).forEach(([k, v]) => form.append(k, v as string));

    if (gpsLocation) {
      form.append("latitude", String(gpsLocation.latitude));
      form.append("longitude", String(gpsLocation.longitude));
    }

    Object.entries(files).forEach(([k, v]) => form.append(k, v as File));

    try {
      const res = await fetch("/api/vendor/register", { method: "POST", body: form });
      const data = await res.json();

      if (res.ok) {
        alert("Vendor registered successfully!");
        onClose();
      } else {
        alert(data.message || "Failed to register vendor");
      }
    } catch (err) {
      console.error("Submit error:", err);
      alert("Something went wrong during submission.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center justify-between mb-8">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center flex-1">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full ${
              s <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
            }`}>{s}</div>
            {s < 3 && <div className={`flex-1 h-1 mx-2 ${s < step ? 'bg-primary' : 'bg-muted'}`} />}
          </div>
        ))}
      </div>

      {/* STEP 1 */}
      {step === 1 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Owner Details</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" value={formData.firstName || ""} onChange={handleChange} />
              {errors.firstName && <p className="text-red-500 text-xs">{errors.firstName}</p>}
            </div>
            <div>
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" value={formData.lastName || ""} onChange={handleChange} />
              {errors.lastName && <p className="text-red-500 text-xs">{errors.lastName}</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={formData.email || ""} onChange={handleChange} />
              {errors.email && <p className="text-red-500 text-xs">{errors.email}</p>}
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input id="phone" value={formData.phone || ""} onChange={handleChange} />
              {errors.phone && <p className="text-red-500 text-xs">{errors.phone}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="cnic">FSSAI License Number (Optional)</Label>
            <Input id="cnic" value={formData.cnic || ""} onChange={handleChange} />
            {errors.cnic && <p className="text-red-500 text-xs">{errors.cnic}</p>}
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input id="password" type="password" value={formData.password || ""} onChange={handleChange} />
            {errors.password && <p className="text-red-500 text-xs">{errors.password}</p>}
          </div>
          <Button onClick={() => validate() && onStepChange(2)} className="w-full">Next</Button>
        </div>
      )}

      {/* STEP 2 & STEP 3 (same as before, no backend change) */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Business Details</h3>
          <div>
            <Label htmlFor="restaurantName">Restaurant Name</Label>
            <Input id="restaurantName" value={formData.restaurantName || ""} onChange={handleChange} />
            {errors.restaurantName && <p className="text-red-500 text-xs">{errors.restaurantName}</p>}
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea id="address" value={formData.address || ""} onChange={handleChange} />
            {errors.address && <p className="text-red-500 text-xs">{errors.address}</p>}
          </div>
          <LocationCapture onLocationChange={setGpsLocation} />
          {errors.gps && <p className="text-red-500 text-xs">{errors.gps}</p>}
          <div>
            <Label htmlFor="cuisineType">Cuisine Type</Label>
            <Input id="cuisineType" value={formData.cuisineType || ""} onChange={handleChange} />
            {errors.cuisineType && <p className="text-red-500 text-xs">{errors.cuisineType}</p>}
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea id="description" value={formData.description || ""} onChange={handleChange} />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onStepChange(1)} className="flex-1">Back</Button>
            <Button onClick={() => validate() && onStepChange(3)} className="flex-1">Next</Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Upload Documents</h3>
          {["businessLicense", "taxCert", "idProof", "logo"].map((id) => (
            <div key={id}>
              <Label htmlFor={id}>{id}</Label>
              <Input id={id} type="file" accept="image/*,.pdf" onChange={handleFileChange} />
              {errors[id] && <p className="text-red-500 text-xs">{errors[id]}</p>}
            </div>
          ))}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onStepChange(2)} className="flex-1">Back</Button>
            <Button onClick={handleSubmit} className="flex-1" disabled={loading}>
              {loading ? "Submitting..." : "Submit Application"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function LocationCapture({ onLocationChange }: { onLocationChange: (location: { latitude: number; longitude: number } | null) => void }) {
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState("");

  const captureLocation = () => {
    setIsCapturing(true);
    setError("");
    
    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setIsCapturing(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        setLocation(coords);
        onLocationChange(coords);
        setIsCapturing(false);
      },
      (error) => {
        console.error("Geolocation error:", error);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setError("Permission denied. Please allow location access in your browser.");
            break;
          case error.POSITION_UNAVAILABLE:
            setError("Location information is unavailable.");
            break;
          case error.TIMEOUT:
            setError("Location request timed out.");
            break;
          default:
            setError("An unknown error occurred while retrieving your location.");
        }
        setIsCapturing(false);
      }
    );
  };

  return (
    <div className="space-y-2">
      <Label>Location (GPS Coordinates)</Label>
      <div className="flex gap-2">
        <Input
          value={location ? `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}` : ""}
          placeholder="Click to capture current location"
          readOnly
          className="flex-1"
          data-testid="input-location"
        />
        <Button
          type="button"
          variant="outline"
          onClick={captureLocation}
          disabled={isCapturing}
          data-testid="button-capture-location"
        >
          {isCapturing ? "Capturing..." : "Capture"}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {location && (
        <p className="text-sm text-muted-foreground">
          Location captured successfully. This will help customers find your restaurant.
        </p>
      )}
    </div>
  );
}

function CaptainLoginForm({ onClose }: { onClose: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async () => {
    setError("");
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/auth/captain/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        const data = await response.json();
        setError(data.message || "Login failed");
        return;
      }
      
      // Login successful, reload to redirect to dashboard
      window.location.href = "/captain";
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
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
