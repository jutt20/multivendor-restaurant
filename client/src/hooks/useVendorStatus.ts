import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";

type VendorProfileResponse = {
  vendor?: {
    status?: string | null;
    rejectionReason?: string | null;
  } | null;
};

export function useVendorStatus() {
  const [, setLocation] = useLocation();
  const [shouldRedirect, setShouldRedirect] = useState(false);
  const [redirectData, setRedirectData] = useState<{ status: string; reason: string } | null>(null);

  const { data: profile, error, isLoading } = useQuery<VendorProfileResponse>({
    queryKey: ["/api/vendor/profile"],
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    // Handle API error (403 from middleware)
    if (error) {
      const err = error as any;
      if (err?.response?.status === 403 || err?.code === "VENDOR_NOT_APPROVED") {
        const vendorStatus = err?.vendorStatus || "pending";
        const rejectionReason = err?.rejectionReason || "";
        setRedirectData({ status: vendorStatus, reason: rejectionReason });
        setShouldRedirect(true);
        return;
      }
    }

    // Check vendor status from profile data
    if (profile?.vendor?.status && profile.vendor.status !== "approved") {
      const status = profile.vendor.status || "pending";
      const rejectionReason = profile.vendor.rejectionReason || "";
      setRedirectData({ status, reason: rejectionReason });
      setShouldRedirect(true);
      return;
    }

    setShouldRedirect(false);
  }, [profile, error]);

  useEffect(() => {
    if (shouldRedirect && redirectData) {
      const { status, reason } = redirectData;
      setLocation(`/vendor/status?status=${status}&reason=${encodeURIComponent(reason)}`);
    }
  }, [shouldRedirect, redirectData, setLocation]);

  return {
    isApproved: profile?.vendor?.status === "approved",
    isLoading,
    status: profile?.vendor?.status || null,
  };
}

