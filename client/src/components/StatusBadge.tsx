import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "delivered" | "completed";
type VendorStatus = "pending" | "approved" | "rejected" | "suspended";

interface StatusBadgeProps {
  status: OrderStatus | VendorStatus;
  className?: string;
}

const orderStatusConfig = {
  pending: { label: "Pending", variant: "secondary" as const, color: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400" },
  accepted: { label: "Accepted", variant: "default" as const, color: "bg-blue-500/10 text-blue-700 dark:text-blue-400" },
  preparing: { label: "Preparing", variant: "default" as const, color: "bg-orange-500/10 text-orange-700 dark:text-orange-400" },
  ready: { label: "Ready", variant: "default" as const, color: "bg-green-500/10 text-green-700 dark:text-green-400" },
  delivered: { label: "Delivered", variant: "outline" as const, color: "bg-gray-500/10 text-gray-700 dark:text-gray-400" },
  completed: { label: "Completed", variant: "outline" as const, color: "bg-slate-500/10 text-slate-700 dark:text-slate-400" },
  approved: { label: "Approved", variant: "default" as const, color: "bg-green-500/10 text-green-700 dark:text-green-400" },
  rejected: { label: "Rejected", variant: "destructive" as const, color: "bg-red-500/10 text-red-700 dark:text-red-400" },
  suspended: { label: "Suspended", variant: "destructive" as const, color: "bg-red-500/10 text-red-700 dark:text-red-400" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = orderStatusConfig[status];

  return (
    <Badge
      variant="outline"
      className={cn(config.color, "font-medium", className)}
      data-testid={`badge-status-${status}`}
    >
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-current mr-1.5"></span>
      {config.label}
    </Badge>
  );
}
