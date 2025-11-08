"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface LocationCaptureProps {
  onLocationChange: (location: { latitude: number; longitude: number } | null) => void;
}

function LocationCapture({ onLocationChange }: LocationCaptureProps) {
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
        />
        <Button type="button" variant="outline" onClick={captureLocation} disabled={isCapturing}>
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

// ✅ Add default export to match your import
export default LocationCapture;
