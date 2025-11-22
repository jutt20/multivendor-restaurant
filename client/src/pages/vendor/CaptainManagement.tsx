import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import {
  Table as UITable,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Users as UsersIcon, Trash2, Eye, EyeOff } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { z } from "zod";
import type { Captain } from "@shared/schema";

const captainFormSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  username: z.string().min(3, "Username must be at least 3 characters"),
  password: z.string().min(4, "Password must be at least 4 characters"),
  phone: z.string().optional(),
});

type CaptainFormValues = z.infer<typeof captainFormSchema>;

export default function CaptainManagement() {
  const [isCreating, setIsCreating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { toast } = useToast();

  const { data: captains, isLoading } = useQuery<Captain[]>({
    queryKey: ["/api/vendor/captains"],
  });

  const form = useForm<CaptainFormValues>({
    resolver: zodResolver(captainFormSchema),
    defaultValues: {
      name: "",
      username: "",
      password: "",
      phone: "",
    },
  });

  const createCaptainMutation = useMutation({
    mutationFn: async (data: CaptainFormValues) => {
      return await apiRequest("POST", "/api/vendor/captains", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/captains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
      toast({
        title: "Success",
        description: "Captain created successfully",
      });
      setIsCreating(false);
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create captain",
        variant: "destructive",
      });
    },
  });

  const deleteCaptainMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/vendor/captains/${id}`, {});
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/captains"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vendor/stats"] });
      toast({
        title: "Success",
        description: "Captain deleted successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to delete captain",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CaptainFormValues) => {
    createCaptainMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Captain Management</h1>
          <p className="text-muted-foreground mt-2">
            Manage your staff members and assign them to tables
          </p>
        </div>
        <Dialog open={isCreating} onOpenChange={setIsCreating}>
          <DialogTrigger asChild>
            <Button data-testid="button-create-captain">
              <Plus className="h-4 w-4 mr-2" />
              Add Captain
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Captain</DialogTitle>
              <DialogDescription>
                Create login credentials for a new staff member
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="John Doe" data-testid="input-captain-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="john.doe" data-testid="input-captain-username" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input {...field} type={showPassword ? "text" : "password"} placeholder="••••••••" data-testid="input-captain-password" className="pr-10" />
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
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone (Optional)</FormLabel>
                      <FormControl>
                        <Input {...field} type="tel" placeholder="+1 234 567 8900" data-testid="input-captain-phone" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={createCaptainMutation.isPending} data-testid="button-submit-captain">
                  {createCaptainMutation.isPending ? "Creating..." : "Create Captain"}
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <Card>
          <CardContent className="p-6">
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      ) : captains && captains.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Staff Members</CardTitle>
            <CardDescription>
              {captains.length} captain{captains.length !== 1 ? 's' : ''} registered
            </CardDescription>
          </CardHeader>
          <CardContent>
            <UITable>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Username</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {captains.map((captain) => (
                  <TableRow key={captain.id} data-testid={`row-captain-${captain.id}`}>
                    <TableCell className="font-medium">{captain.name}</TableCell>
                    <TableCell className="font-mono text-sm">{captain.username}</TableCell>
                    <TableCell>{captain.phone || '-'}</TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${
                        captain.isActive
                          ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                          : 'bg-gray-100 text-gray-700 dark:bg-gray-950 dark:text-gray-400'
                      }`}>
                        <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                        {captain.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteCaptainMutation.mutate(captain.id)}
                        data-testid={`button-delete-captain-${captain.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </UITable>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16">
            <UsersIcon className="h-16 w-16 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No captains yet</h3>
            <p className="text-sm text-muted-foreground mb-6">
              Add staff members to help manage your tables and orders
            </p>
            <Button onClick={() => setIsCreating(true)} data-testid="button-add-first-captain">
              <Plus className="h-4 w-4 mr-2" />
              Add First Captain
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
