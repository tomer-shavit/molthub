import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusType = 
  | 'CREATING' | 'RUNNING' | 'DEGRADED' | 'STOPPED' | 'DELETING' | 'ERROR'
  | 'PENDING' | 'PAUSED' | 'RECONCILING'
  | 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN'
  | 'ACTIVE' | 'INACTIVE' | 'DRAINING'
  | 'SUCCESS' | 'FAILED' | 'COMPLETED' | 'ROLLED_BACK' | 'IN_PROGRESS'
  | 'PENDING' | 'ALL' | 'PERCENTAGE' | 'CANARY';

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<string, { variant: "default" | "secondary" | "destructive" | "outline" | "success" | "warning"; label: string }> = {
  // Instance/Bot statuses
  CREATING: { variant: "warning", label: "Creating" },
  RUNNING: { variant: "success", label: "Running" },
  DEGRADED: { variant: "warning", label: "Degraded" },
  STOPPED: { variant: "secondary", label: "Stopped" },
  DELETING: { variant: "destructive", label: "Deleting" },
  ERROR: { variant: "destructive", label: "Error" },
  PENDING: { variant: "warning", label: "Pending" },
  PAUSED: { variant: "secondary", label: "Paused" },
  RECONCILING: { variant: "warning", label: "Reconciling" },
  
  // Health statuses
  HEALTHY: { variant: "success", label: "Healthy" },
  UNHEALTHY: { variant: "destructive", label: "Unhealthy" },
  UNKNOWN: { variant: "secondary", label: "Unknown" },
  
  // Fleet statuses
  ACTIVE: { variant: "success", label: "Active" },
  INACTIVE: { variant: "secondary", label: "Inactive" },
  DRAINING: { variant: "warning", label: "Draining" },
  
  // Change set statuses
  SUCCESS: { variant: "success", label: "Success" },
  FAILED: { variant: "destructive", label: "Failed" },
  COMPLETED: { variant: "success", label: "Completed" },
  ROLLED_BACK: { variant: "secondary", label: "Rolled Back" },
  IN_PROGRESS: { variant: "warning", label: "In Progress" },
  
  // Rollout strategies
  ALL: { variant: "default", label: "All" },
  PERCENTAGE: { variant: "secondary", label: "Percentage" },
  CANARY: { variant: "warning", label: "Canary" },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status] || { variant: "default", label: status };
  
  return (
    <Badge variant={config.variant} className={cn("capitalize", className)}>
      {config.label}
    </Badge>
  );
}

export function HealthIndicator({ health, showLabel = true, size = "md" }: { 
  health: 'HEALTHY' | 'UNHEALTHY' | 'UNKNOWN' | 'DEGRADED';
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
}) {
  const sizeClasses = {
    sm: "w-2 h-2",
    md: "w-3 h-3",
    lg: "w-4 h-4",
  };

  const colorClasses = {
    HEALTHY: "bg-green-500",
    DEGRADED: "bg-yellow-500",
    UNHEALTHY: "bg-red-500",
    UNKNOWN: "bg-gray-400",
  };

  return (
    <div className="flex items-center gap-2">
      <span className={cn("rounded-full", sizeClasses[size], colorClasses[health])} />
      {showLabel && (
        <span className={cn(
          "text-sm font-medium",
          health === 'HEALTHY' && "text-green-700",
          health === 'DEGRADED' && "text-yellow-700",
          health === 'UNHEALTHY' && "text-red-700",
          health === 'UNKNOWN' && "text-gray-500",
        )}>
          {health.charAt(0) + health.slice(1).toLowerCase()}
        </span>
      )}
    </div>
  );
}
