"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import LocationCapture from "@/components/LocationCapture"; // adjust path if needed

interface VendorRegistrationFormProps {
  step: number;
  onStepChange: (step: number) => void;
  onClose: () => void;
}

export default function VendorRegistrationForm({ step, onStepChange, onClose }: VendorRegistrationFormProps) {
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
    // if (!formData.cnic) newErrors.cnic = "FSSAI License Number is required";
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

      {/* STEP 2 */}
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

      {/* STEP 3 */}
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
