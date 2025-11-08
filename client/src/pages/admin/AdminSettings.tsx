import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Key, Bell, Map } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

interface AdminConfig {
  key: string;
  value: string | any;
  isEnabled: boolean;
  description?: string;
}

function safeParseConfigValue(value: any): any {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value;
}

export default function AdminSettings() {
  const { toast } = useToast();
  const [configs, setConfigs] = useState<Record<string, AdminConfig>>({});

  const { data: twilioConfig, isLoading: loadingTwilio } = useQuery<AdminConfig>({
    queryKey: ["/api/admin/config/twilio_enabled"],
    queryFn: async () => {
      const res = await fetch("/api/admin/config/twilio_enabled");
      if (!res.ok) throw new Error("Failed to fetch config");
      return res.json();
    },
  });

  const { data: firebaseConfig, isLoading: loadingFirebase } = useQuery<AdminConfig>({
    queryKey: ["/api/admin/config/firebase_enabled"],
    queryFn: async () => {
      const res = await fetch("/api/admin/config/firebase_enabled");
      if (!res.ok) throw new Error("Failed to fetch config");
      return res.json();
    },
  });

  const { data: mapsConfig, isLoading: loadingMaps } = useQuery<AdminConfig>({
    queryKey: ["/api/admin/config/maps_enabled"],
    queryFn: async () => {
      const res = await fetch("/api/admin/config/maps_enabled");
      if (!res.ok) throw new Error("Failed to fetch config");
      return res.json();
    },
  });

  const updateConfigMutation = useMutation({
    mutationFn: async ({ key, value, isEnabled }: { key: string; value: any; isEnabled: boolean }) => {
      return await apiRequest("PUT", `/api/admin/config/${key}`, { value, isEnabled });
    },
    onSuccess: (_, variables) => {
      // Invalidate the specific config query to refetch updated data
      queryClient.invalidateQueries({ queryKey: [`/api/admin/config/${variables.key}`] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config"] });
      toast({
        title: "Success",
        description: "Configuration updated successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to update configuration",
        variant: "destructive",
      });
    },
  });

  const handleUpdateConfig = (key: string, value: any, isEnabled: boolean) => {
    updateConfigMutation.mutate({ key, value, isEnabled });
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Platform Settings</h1>
        <p className="text-muted-foreground mt-2">
          Configure integration settings for Twilio, Firebase, and Google Maps
        </p>
      </div>

      <div className="grid gap-6">
        {/* Twilio SMS Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-50 dark:bg-blue-950">
                  <Bell className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle>Twilio SMS</CardTitle>
                  <CardDescription>Configure SMS notifications for order updates</CardDescription>
                </div>
              </div>
              {loadingTwilio ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <Switch
                  checked={twilioConfig?.isEnabled || false}
                  onCheckedChange={(checked) => {
                    const value = safeParseConfigValue(twilioConfig?.value);
                    handleUpdateConfig('twilio_enabled', value, checked);
                  }}
                  data-testid="switch-twilio"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="twilio-account-sid">Account SID</Label>
              <Input
                id="twilio-account-sid"
                placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                defaultValue={safeParseConfigValue(twilioConfig?.value).accountSid || ''}
                onBlur={(e) => {
                  const currentValue = safeParseConfigValue(twilioConfig?.value);
                  currentValue.accountSid = e.target.value;
                  handleUpdateConfig('twilio_enabled', currentValue, twilioConfig?.isEnabled || false);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twilio-auth-token">Auth Token</Label>
              <Input
                id="twilio-auth-token"
                type="password"
                placeholder="••••••••••••••••••••••••••••••••"
                defaultValue={safeParseConfigValue(twilioConfig?.value).authToken || ''}
                onBlur={(e) => {
                  const currentValue = safeParseConfigValue(twilioConfig?.value);
                  currentValue.authToken = e.target.value;
                  handleUpdateConfig('twilio_enabled', currentValue, twilioConfig?.isEnabled || false);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="twilio-phone">Phone Number</Label>
              <Input
                id="twilio-phone"
                placeholder="+1234567890"
                defaultValue={safeParseConfigValue(twilioConfig?.value).phoneNumber || ''}
                onBlur={(e) => {
                  const currentValue = safeParseConfigValue(twilioConfig?.value);
                  currentValue.phoneNumber = e.target.value;
                  handleUpdateConfig('twilio_enabled', currentValue, twilioConfig?.isEnabled || false);
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your Twilio credentials to enable SMS notifications for order status updates.
            </p>
          </CardContent>
        </Card>

        {/* Firebase Push Notifications Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-orange-50 dark:bg-orange-950">
                  <Settings className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <CardTitle>Firebase Push Notifications</CardTitle>
                  <CardDescription>Configure push notifications for mobile apps</CardDescription>
                </div>
              </div>
              {loadingFirebase ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <Switch
                  checked={firebaseConfig?.isEnabled || false}
                  onCheckedChange={(checked) => {
                    const value = safeParseConfigValue(firebaseConfig?.value);
                    handleUpdateConfig('firebase_enabled', value, checked);
                  }}
                  data-testid="switch-firebase"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="firebase-project-id">Project ID</Label>
              <Input
                id="firebase-project-id"
                placeholder="your-project-id"
                defaultValue={safeParseConfigValue(firebaseConfig?.value).projectId || ''}
                onBlur={(e) => {
                  const currentValue = safeParseConfigValue(firebaseConfig?.value);
                  currentValue.projectId = e.target.value;
                  handleUpdateConfig('firebase_enabled', currentValue, firebaseConfig?.isEnabled || false);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firebase-private-key">Private Key</Label>
              <Textarea
                id="firebase-private-key"
                placeholder="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
                rows={4}
                defaultValue={safeParseConfigValue(firebaseConfig?.value).privateKey || ''}
                onBlur={(e) => {
                  const currentValue = safeParseConfigValue(firebaseConfig?.value);
                  currentValue.privateKey = e.target.value;
                  handleUpdateConfig('firebase_enabled', currentValue, firebaseConfig?.isEnabled || false);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="firebase-client-email">Client Email</Label>
              <Input
                id="firebase-client-email"
                placeholder="firebase-adminsdk@your-project.iam.gserviceaccount.com"
                defaultValue={safeParseConfigValue(firebaseConfig?.value).clientEmail || ''}
                onBlur={(e) => {
                  const currentValue = safeParseConfigValue(firebaseConfig?.value);
                  currentValue.clientEmail = e.target.value;
                  handleUpdateConfig('firebase_enabled', currentValue, firebaseConfig?.isEnabled || false);
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your Firebase service account credentials to enable push notifications.
            </p>
          </CardContent>
        </Card>

        {/* Google Maps Configuration */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-green-50 dark:bg-green-950">
                  <Map className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <CardTitle>Google Maps</CardTitle>
                  <CardDescription>Configure location services for vendor registration</CardDescription>
                </div>
              </div>
              {loadingMaps ? (
                <Skeleton className="h-6 w-12" />
              ) : (
                <Switch
                  checked={mapsConfig?.isEnabled || false}
                  onCheckedChange={(checked) => {
                    const value = safeParseConfigValue(mapsConfig?.value);
                    handleUpdateConfig('maps_enabled', value, checked);
                  }}
                  data-testid="switch-maps"
                />
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="maps-api-key">API Key</Label>
              <Input
                id="maps-api-key"
                type="password"
                placeholder="AIzaSy••••••••••••••••••••••••••••••"
                defaultValue={safeParseConfigValue(mapsConfig?.value).apiKey || ''}
                onBlur={(e) => {
                  const currentValue = safeParseConfigValue(mapsConfig?.value);
                  currentValue.apiKey = e.target.value;
                  handleUpdateConfig('maps_enabled', currentValue, mapsConfig?.isEnabled || false);
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Enter your Google Maps API key to enable location capture during vendor registration.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
