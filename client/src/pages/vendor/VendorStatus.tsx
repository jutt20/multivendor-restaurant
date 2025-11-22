import { useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, CheckCircle, Clock, XCircle, ArrowLeft } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import logoImage from "@assets/generated_images/logo.jpg";

export default function VendorStatus() {
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Parse query parameters from URL
  const searchParams = useMemo(() => {
    const search = location.includes('?') ? location.split('?')[1] : window.location.search.substring(1);
    return new URLSearchParams(search);
  }, [location]);
  
  const status = searchParams.get("status") || "pending";
  const rejectionReason = searchParams.get("reason") || "";

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
    // If user is not authenticated or not a vendor, redirect to login
    if (!user || user.role !== "vendor") {
      setLocation("/vendor-login");
    }
  }, [user, setLocation]);

  const getStatusInfo = () => {
    switch (status.toLowerCase()) {
      case "approved":
        return {
          icon: CheckCircle,
          title: "Application Approved!",
          description: "Your vendor application has been approved. You can now access the platform.",
          color: "text-green-600",
          bgColor: "bg-green-50",
          iconColor: "text-green-600",
        };
      case "pending":
        return {
          icon: Clock,
          title: "Application Under Review",
          description: "Your vendor application is currently being reviewed by our team. We will notify you once a decision has been made.",
          color: "text-yellow-600",
          bgColor: "bg-yellow-50",
          iconColor: "text-yellow-600",
        };
      case "rejected":
        return {
          icon: XCircle,
          title: "Application Rejected",
          description: rejectionReason || "Your vendor application has been rejected. Please review the reason and contact support if you have questions.",
          color: "text-red-600",
          bgColor: "bg-red-50",
          iconColor: "text-red-600",
        };
      case "suspended":
        return {
          icon: AlertCircle,
          title: "Account Suspended",
          description: "Your vendor account has been suspended. Please contact support for more information.",
          color: "text-orange-600",
          bgColor: "bg-orange-50",
          iconColor: "text-orange-600",
        };
      default:
        return {
          icon: Clock,
          title: "Application Status",
          description: "Your vendor application status is unknown. Please contact support.",
          color: "text-gray-600",
          bgColor: "bg-gray-50",
          iconColor: "text-gray-600",
        };
    }
  };

  const statusInfo = getStatusInfo();
  const StatusIcon = statusInfo.icon;

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      setLocation("/vendor-login");
    } catch (error) {
      console.error("Logout error:", error);
      toast({
        title: "Error",
        description: "Failed to logout. Please try again.",
        variant: "destructive",
      });
    }
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
              <Button variant="ghost" onClick={handleLogout}>
                Logout
              </Button>
              <Button variant="ghost" onClick={() => setLocation("/vendor-login")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Login
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* MAIN */}
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className={`p-4 rounded-full ${statusInfo.bgColor}`}>
                  <StatusIcon className={`h-12 w-12 ${statusInfo.iconColor}`} />
                </div>
              </div>
              <CardTitle className={`text-2xl ${statusInfo.color}`}>
                {statusInfo.title}
              </CardTitle>
              <CardDescription className="text-base mt-4">
                {statusInfo.description}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {status === "rejected" && rejectionReason && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                  <h4 className="font-semibold text-red-800 mb-2">Rejection Reason:</h4>
                  <p className="text-red-700">{rejectionReason}</p>
                </div>
              )}

              {status === "pending" && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-2">What's Next?</h4>
                  <ul className="text-blue-700 space-y-1 list-disc list-inside">
                    <li>Our team is reviewing your application and documents</li>
                    <li>This process usually takes 1-3 business days</li>
                    <li>You will receive a notification once a decision is made</li>
                    <li>Please check back later or contact support if you have questions</li>
                  </ul>
                </div>
              )}

              {status === "approved" && (
                <div className="flex justify-center">
                  <Button
                    onClick={() => {
                      // Refresh user data and redirect to dashboard
                      window.location.href = "/vendor";
                    }}
                    size="lg"
                    className="w-full"
                  >
                    Go to Dashboard
                  </Button>
                </div>
              )}

              {(status === "rejected" || status === "suspended") && (
                <div className="flex justify-center gap-4">
                  <Button
                    variant="outline"
                    onClick={() => setLocation("/vendor-login")}
                    className="flex-1"
                  >
                    Contact Support
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleLogout}
                    className="flex-1"
                  >
                    Logout
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

