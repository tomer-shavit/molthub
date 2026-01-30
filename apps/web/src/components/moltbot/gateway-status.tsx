"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Wifi, WifiOff, Clock, Activity } from "lucide-react";
import { ConnectionStatus } from "@/components/ui/connection-status";
import { useGatewayWebSocket } from "@/hooks/use-gateway-websocket";

export interface GatewayStatusData {
  connected: boolean;
  latencyMs?: number;
  lastHeartbeat?: string;
  port: number;
  host?: string;
}

interface GatewayStatusProps {
  data: GatewayStatusData;
  instanceId?: string;
  className?: string;
}

export function GatewayStatus({ data, instanceId, className }: GatewayStatusProps) {
  const { connected, latencyMs, lastHeartbeat, port, host } = data;
  const { status: wsStatus } = useGatewayWebSocket(instanceId ?? "");
  const wsConnected = wsStatus === "connected";

  const heartbeatDisplay = lastHeartbeat
    ? formatTimeSince(new Date(lastHeartbeat))
    : "Never";

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between w-full">
          <CardTitle className="text-base flex items-center gap-2">
            {connected ? (
              <Wifi className="w-4 h-4 text-green-500" />
            ) : (
              <WifiOff className="w-4 h-4 text-red-500" />
            )}
            Gateway Connection
          </CardTitle>
          {instanceId && <ConnectionStatus status={wsStatus} />}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            <Badge variant={connected ? "success" : "destructive"}>
              {connected ? "Connected" : "Disconnected"}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              Latency
            </span>
            <span className={cn(
              "text-sm font-medium",
              latencyMs !== undefined && latencyMs > 500 ? "text-red-600" :
              latencyMs !== undefined && latencyMs > 200 ? "text-yellow-600" :
              "text-green-600"
            )}>
              {latencyMs !== undefined ? `${latencyMs}ms` : "N/A"}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Last Heartbeat
            </span>
            <span className="text-sm font-medium">{heartbeatDisplay}</span>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Port</span>
            <span className="text-sm font-mono font-medium">
              {host ? `${host}:` : ""}{port}
            </span>
          </div>

          {instanceId && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">WebSocket</span>
              <Badge variant={wsConnected ? "success" : "secondary"}>
                {wsConnected ? "Live" : "Not Connected"}
              </Badge>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function formatTimeSince(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleString();
}
