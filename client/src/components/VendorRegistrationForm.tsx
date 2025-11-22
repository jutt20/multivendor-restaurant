"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import LocationCapture from "@/components/LocationCapture"; // adjust path if needed
import { Eye, EyeOff } from "lucide-react";

interface VendorRegistrationFormProps {
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}

export default function VendorRegistrationForm({ step, onStepChange, onClose }: VendorRegistrationFormProps) {
  const { toast } = useToast();
  const [gpsLocation, setGpsLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [formData, setFormData] = useState<any>({});
  const [files, setFiles] = useState<any>({});
  const [errors, setErrors] = useState<any>({});
  const [loading, setLoading] = useState(false);
  const [checkingUsername, setCheckingUsername] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { id, value } = e.target;
    const normalizedValue = id === "gstin" ? value.toUpperCase() : value;
    setFormData({ ...formData, [id]: normalizedValue });
    // Clear error for this field when user starts typing
    if (errors[id]) {
      setErrors({ ...errors, [id]: undefined });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFiles({ ...files, [e.target.id]: e.target.files[0] });
      // Clear error for this file field when user selects a file
      if (errors[e.target.id]) {
        setErrors({ ...errors, [e.target.id]: undefined });
      }
    }
  };

  const validate = async () => {
    const newErrors: any = {};

    if (!formData.firstName) newErrors.firstName = "First name is required";
    if (!formData.lastName) newErrors.lastName = "Last name is required";
    
    // Validate username format first
    if (!formData.username) {
      newErrors.username = "Username is required";
    } else if (!/^[a-zA-Z0-9_]{3,20}$/.test(formData.username)) {
      newErrors.username = "Username must be 3-20 characters and contain only letters, numbers, and underscores";
    } else {
      // If format is valid and we're on step 1, check availability
      if (step === 1) {
        setCheckingUsername(true);
        try {
          const res = await fetch(`/api/vendor/check-username?username=${encodeURIComponent(formData.username.trim())}`);
          const data = await res.json();
          
          if (!data.available) {
            newErrors.username = data.message || "Username already taken. Please choose another username.";
          }
        } catch (error) {
          console.error("Error checking username:", error);
          newErrors.username = "Failed to check username availability. Please try again.";
        } finally {
          setCheckingUsername(false);
        }
      }
    }

    if (!formData.email) newErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = "Invalid email";
    if (!formData.phone) newErrors.phone = "Phone number is required";
    else if (!/^[\d\s\-\+\(\)]{10,}$/.test(formData.phone)) {
      newErrors.phone = "Please enter a valid phone number";
    }
    // if (!formData.cnic) newErrors.cnic = "FSSAI License Number is required";
    if (formData.gstin && !/^[A-Za-z0-9]{1,20}$/.test(formData.gstin)) {
      newErrors.gstin = "GSTIN must be alphanumeric (max 20 characters)";
    }
    if (!formData.password) newErrors.password = "Password is required";
    else if (formData.password.length < 4) {
      newErrors.password = "Password must be at least 4 characters long";
    }

    if (step >= 2) {
      if (!formData.restaurantName) newErrors.restaurantName = "Restaurant name is required";
      if (!formData.address) newErrors.address = "Address is required";
      if (!formData.cuisineType) newErrors.cuisineType = "Cuisine type is required";
      if (!gpsLocation) newErrors.gps = "Location must be captured";
    }

    if (step === 3) {
      // Only logo is required, other documents are optional
      if (!files["logo"]) {
        newErrors.logo = "Logo is required";
      }
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
        toast({
          title: "Application sent successfully!",
          description: "Your vendor registration application has been submitted. We will review it and notify you once approved.",
        });
        onClose();
      } else {
        // Handle backend validation errors
        if (data.errors && typeof data.errors === "object") {
          // Display field-specific errors
          setErrors(data.errors);
          // Scroll to first error field
          const firstErrorField = Object.keys(data.errors)[0];
          if (firstErrorField) {
            const errorElement = document.getElementById(firstErrorField);
            if (errorElement) {
              errorElement.scrollIntoView({ behavior: "smooth", block: "center" });
              errorElement.focus();
            }
          }
          toast({
            title: "Validation Error",
            description: "Please fix the errors in the form.",
            variant: "destructive",
          });
        } else {
          // Generic error message
          toast({
            title: "Registration Failed",
            description: data.message || "Failed to register vendor. Please try again.",
            variant: "destructive",
          });
        }
      }
    } catch (err) {
      console.error("Submit error:", err);
      toast({
        title: "Error",
        description: "Something went wrong during submission. Please try again.",
        variant: "destructive",
      });
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
              <Input 
                id="firstName" 
                value={formData.firstName || ""} 
                onChange={handleChange}
                className={errors.firstName ? "border-red-500" : ""}
              />
              {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
            </div>
            <div>
              <Label htmlFor="lastName">Last Name</Label>
              <Input 
                id="lastName" 
                value={formData.lastName || ""} 
                onChange={handleChange}
                className={errors.lastName ? "border-red-500" : ""}
              />
              {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="username">Username</Label>
            <Input 
              id="username" 
              value={formData.username || ""} 
              onChange={handleChange}
              placeholder="e.g., john_doe123"
              className={errors.username ? "border-red-500" : ""}
              disabled={checkingUsername}
            />
            {checkingUsername ? (
              <p className="text-xs text-muted-foreground mt-1">Checking availability...</p>
            ) : errors.username ? (
              <p className="text-red-500 text-xs mt-1">{errors.username}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                3-20 characters, letters, numbers, and underscores only
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="email">Email</Label>
            <Input 
              id="email" 
              type="email" 
              value={formData.email || ""} 
              onChange={handleChange}
              className={errors.email ? "border-red-500" : ""}
            />
            {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
          </div>
          <div>
            <Label htmlFor="phone">Phone</Label>
            <Input 
              id="phone" 
              value={formData.phone || ""} 
              onChange={handleChange}
              className={errors.phone ? "border-red-500" : ""}
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <Label htmlFor="cnic">FSSAI License Number (Optional)</Label>
              <Input id="cnic" value={formData.cnic || ""} onChange={handleChange} />
              {errors.cnic && <p className="text-red-500 text-xs">{errors.cnic}</p>}
            </div>
            <div>
              <Label htmlFor="gstin">GSTIN (Optional)</Label>
              <Input
                id="gstin"
                value={formData.gstin || ""}
                onChange={handleChange}
                placeholder="e.g., 22AAAAA0000A1Z5"
                className={errors.gstin ? "border-red-500" : ""}
              />
              {errors.gstin && <p className="text-red-500 text-xs mt-1">{errors.gstin}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <div className="relative">
              <Input 
                id="password" 
                type={showPassword ? "text" : "password"} 
                value={formData.password || ""} 
                onChange={handleChange}
                className={errors.password ? "border-red-500 pr-10" : "pr-10"}
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
            {errors.password ? (
              <p className="text-red-500 text-xs mt-1">{errors.password}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Minimum 4 characters
              </p>
            )}
          </div>
          <Button 
            onClick={async () => {
              const isValid = await validate();
              if (isValid) {
                onStepChange(2);
              }
            }} 
            className="w-full"
            disabled={checkingUsername}
          >
            {checkingUsername ? "Checking username..." : "Next"}
          </Button>
        </div>
      )}

      {/* STEP 2 */}
      {step === 2 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Business Details</h3>
          <div>
            <Label htmlFor="restaurantName">Restaurant Name</Label>
            <Input 
              id="restaurantName" 
              value={formData.restaurantName || ""} 
              onChange={handleChange}
              className={errors.restaurantName ? "border-red-500" : ""}
            />
            {errors.restaurantName && <p className="text-red-500 text-xs mt-1">{errors.restaurantName}</p>}
          </div>
          <div>
            <Label htmlFor="address">Address</Label>
            <Textarea 
              id="address" 
              value={formData.address || ""} 
              onChange={handleChange}
              className={errors.address ? "border-red-500" : ""}
            />
            {errors.address && <p className="text-red-500 text-xs mt-1">{errors.address}</p>}
          </div>
          <LocationCapture onLocationChange={setGpsLocation} />
          {errors.gps && <p className="text-red-500 text-xs mt-1">{errors.gps}</p>}
          <div>
            <Label htmlFor="cuisineType">Cuisine Type</Label>
            <Input 
              id="cuisineType" 
              value={formData.cuisineType || ""} 
              onChange={handleChange}
              className={errors.cuisineType ? "border-red-500" : ""}
            />
            {errors.cuisineType && <p className="text-red-500 text-xs mt-1">{errors.cuisineType}</p>}
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

      {/* STEP 3 */}
      {step === 3 && (
        <div className="space-y-4">
          <h3 className="font-semibold text-lg">Upload Documents</h3>
          <div>
            <Label htmlFor="logo">Logo *</Label>
            <Input 
              id="logo" 
              type="file" 
              accept="image/*,.pdf" 
              onChange={handleFileChange}
              className={errors.logo ? "border-red-500" : ""}
            />
            {errors.logo && <p className="text-red-500 text-xs mt-1">{errors.logo}</p>}
          </div>
          {["businessLicense", "taxCert", "idProof"].map((id) => (
            <div key={id}>
              <Label htmlFor={id}>
                {id.charAt(0).toUpperCase() + id.slice(1).replace(/([A-Z])/g, " $1")} (Optional)
              </Label>
              <Input 
                id={id} 
                type="file" 
                accept="image/*,.pdf" 
                onChange={handleFileChange}
                className={errors[id] ? "border-red-500" : ""}
              />
              {errors[id] && <p className="text-red-500 text-xs mt-1">{errors[id]}</p>}
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
