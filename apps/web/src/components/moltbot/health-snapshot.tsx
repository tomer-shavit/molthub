"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { HeartPulse, Wifi, MessageSquare, Wrench, Box } from "lucide-react";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { useHealthStream } from "@/hooks/use-health-stream";

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
  instanceId?: string;
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

export function HealthSnapshot({ data: initialData, instanceId, className }: HealthSnapshotProps) {
  const { health: streamHealth, lastUpdated, isConnected, status: wsStatus } = useHealthStream(instanceId ?? "");
  const data = streamHealth ?? initialData;
  const { overall, components, lastChecked } = data;
  const overallConfig = statusConfig[overall];

  // Live "seconds ago" counter
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  useEffect(() => {
    if (!lastUpdated) { setSecondsAgo(null); return; }
    const tick = () => setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lastUpdated]);

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <HeartPulse className="w-4 h-4" />
            Health
          </CardTitle>
          <div className="flex items-center gap-2">
            {instanceId && <ConnectionStatus status={wsStatus} showLabel={false} />}
            <Badge variant={overallConfig.variant}>{overallConfig.label}</Badge>
          </div>
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

        {(lastUpdated || lastChecked) && (
          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">
            {lastUpdated && secondsAgo !== null
              ? <>Last updated: {secondsAgo}s ago{isConnected && " \u2014 Real-time"}</>
              : lastChecked
                ? <>Last checked: {new Date(lastChecked).toLocaleString()}</>
                : "No health data"}
          </p>
        )}
        {!lastUpdated && !lastChecked && (
          <p className="text-xs text-muted-foreground mt-4 pt-3 border-t">No health data</p>
        )}
      </CardContent>
    </Card>
  );
}
