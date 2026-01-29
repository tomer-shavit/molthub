"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { HeartPulse, Wifi, MessageSquare, Wrench, Box } from "lucide-react";

export type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

export interface ComponentHealth {
  name: string;
  status: HealthStatus;
  message?: string;
}

export interface HealthSnapshotData {
  overall: HealthStatus;
  components: ComponentHealth[];
  lastChecked?: string;
}

interface HealthSnapshotProps {
  data: HealthSnapshotData;
  className?: string;
}

const statusConfig: Record<HealthStatus, { variant: "success" | "warning" | "destructive" | "secondary"; label: string }> = {
  healthy: { variant: "success", label: "Healthy" },
  degraded: { variant: "warning", label: "Degraded" },
  unhealthy: { variant: "destructive", label: "Unhealthy" },
  unknown: { variant: "secondary", label: "Unknown" },
};

const componentIcons: Record<string, React.ReactNode> = {
  gateway: <Wifi className="w-4 h-4" />,
  channels: <MessageSquare className="w-4 h-4" />,
  tools: <Wrench className="w-4 h-4" />,
  sandbox: <Box className="w-4 h-4" />,
};

const statusDotColors: Record<HealthStatus, string> = {
  healthy: "bg-green-500",
  degraded: "bg-yellow-500",
  unhealthy: "bg-red-500",
  unknown: "bg-gray-400",
};

export function HealthSnapshot({ data, className }: HealthSnapshotProps) {
  const { overall, components, lastChecked } = data;
  const overallConfig = statusConfig[overall];

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <HeartPulse className="w-4 h-4" />
            Health
          </CardTitle>
          <Badge variant={overallConfig.variant}>{overallConfig.label}</Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {components.map((component) => {
            const dotColor = statusDotColors[component.status];
            const icon = componentIcons[component.name.toLowerCase()] || <Box className="w-4 h-4" />;

            return (
              <div key={component.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{icon}</span>
                  <span className="text-sm capitalize">{component.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  {component.message && (
                    <span className="text-xs text-muted-foreground">{component.message}</span>
                  )}
                  <span className={cn("w-2.5 h-2.5 rounded-full", dotColor)} />
                </div>
              </div>
            );
          })}
        </div>

        {lastChecked && (
          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
            Last checked: {new Date(lastChecked).toLocaleString()}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
