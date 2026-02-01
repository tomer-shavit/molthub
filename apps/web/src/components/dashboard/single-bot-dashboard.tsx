"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ContextualSuggestions } from "@/components/bots/contextual-suggestions";
import { JustDeployedBanner } from "@/components/dashboard/just-deployed-banner";
import { EvolutionIndicator } from "@/components/openclaw/evolution-indicator";
import { api, type BotInstance, type AgentEvolutionSnapshot } from "@/lib/api";
import Link from "next/link";
import {
  Bot,
  Wifi,
  WifiOff,
  HeartPulse,
  Clock,
  RefreshCw,
  Settings,
  FileText,
  Plus,
  MessageCircle,
  Send,
  Gamepad2,
  Hash,
  MessageSquare,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

interface SingleBotDashboardProps {
  bot: BotInstance;
}

const statusConfig: Record<string, { variant: "success" | "warning" | "destructive" | "secondary" | "default"; label: string }> = {
  RUNNING: { variant: "success", label: "Running" },
  CREATING: { variant: "secondary", label: "Creating" },
  PENDING: { variant: "secondary", label: "Pending" },
  DEGRADED: { variant: "warning", label: "Degraded" },
  STOPPED: { variant: "secondary", label: "Stopped" },
  PAUSED: { variant: "secondary", label: "Paused" },
  DELETING: { variant: "destructive", label: "Deleting" },
  ERROR: { variant: "destructive", label: "Error" },
  RECONCILING: { variant: "default", label: "Reconciling" },
};

const healthConfig: Record<string, { color: string; icon: React.ReactNode; label: string }> = {
  HEALTHY: {
    color: "text-green-500",
    icon: <CheckCircle2 className="w-4 h-4 text-green-500" />,
    label: "Healthy",
  },
  DEGRADED: {
    color: "text-yellow-500",
    icon: <AlertTriangle className="w-4 h-4 text-yellow-500" />,
    label: "Degraded",
  },
  UNHEALTHY: {
    color: "text-red-500",
    icon: <XCircle className="w-4 h-4 text-red-500" />,
    label: "Unhealthy",
  },
  UNKNOWN: {
    color: "text-gray-400",
    icon: <Activity className="w-4 h-4 text-gray-400" />,
    label: "Unknown",
  },
};

const channelIconMap: Record<string, React.ReactNode> = {
  whatsapp: <MessageCircle className="w-4 h-4" />,
  telegram: <Send className="w-4 h-4" />,
  discord: <Gamepad2 className="w-4 h-4" />,
  slack: <Hash className="w-4 h-4" />,
};

function getChannelIcon(type: string): React.ReactNode {
  return channelIconMap[type.toLowerCase()] || <MessageSquare className="w-4 h-4" />;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

export function SingleBotDashboard({ bot }: SingleBotDashboardProps) {
  const status = statusConfig[bot.status] || { variant: "secondary" as const, label: bot.status };
  const health = healthConfig[bot.health] || healthConfig.UNKNOWN;

  const [evolution, setEvolution] = useState<AgentEvolutionSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    api.getEvolution(bot.id)
      .then((data) => { if (!cancelled) setEvolution(data); })
      .catch((err) => { console.error("Failed to fetch evolution:", err); });
    return () => { cancelled = true; };
  }, [bot.id]);

  const manifest = bot.desiredManifest || {};
  const manifestObj = manifest as Record<string, unknown>;
  const gatewayConfig = (manifestObj?.gateway as Record<string, unknown>) || {};
  const channelsConfig: Array<{ type: string; enabled?: boolean; status?: string }> =
    (manifestObj?.channels as Array<{ type: string; enabled?: boolean; status?: string }>) || [];

  const isGatewayConnected = bot.status === "RUNNING" && bot.health !== "UNHEALTHY";

  return (
    <div className="space-y-6">
      {/* Just Deployed Banner */}
      {bot.createdAt && <JustDeployedBanner createdAt={bot.createdAt} />}

      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/10 rounded-lg">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold tracking-tight">{bot.name}</h2>
              <Badge variant={status.variant}>{status.label}</Badge>
              {health.icon}
              {evolution && (
                <EvolutionIndicator
                  hasEvolved={evolution.hasEvolved}
                  totalChanges={evolution.totalChanges}
                  lastSyncedAt={evolution.capturedAt}
                />
              )}
            </div>
            <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                Uptime: {formatUptime(bot.runningSince ? Math.max(0, Math.floor((Date.now() - new Date(bot.runningSince).getTime()) / 1000)) : 0)}
              </span>
              {bot.openclawVersion && (
                <span className="font-mono text-xs">v{bot.openclawVersion}</span>
              )}
              {bot.deploymentType && (
                <Badge variant="outline" className="text-xs">
                  {bot.deploymentType}
                </Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/setup">
            <Button variant="outline" size="sm">
              <Plus className="w-4 h-4 mr-2" />
              Add Another Bot
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Gateway Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              {isGatewayConnected ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-500" />
              )}
              Gateway
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={isGatewayConnected ? "success" : "destructive"}>
                  {isGatewayConnected ? "Connected" : "Disconnected"}
                </Badge>
              </div>
              {bot.gatewayPort && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Port</span>
                  <span className="font-mono font-medium">{bot.gatewayPort}</span>
                </div>
              )}
              {!!gatewayConfig.authMode && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Auth Mode</span>
                  <span className="font-medium capitalize">{String(gatewayConfig.authMode)}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Channel Status */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Channels
            </CardTitle>
          </CardHeader>
          <CardContent>
            {channelsConfig.length === 0 ? (
              <p className="text-sm text-muted-foreground">No channels configured.</p>
            ) : (
              <div className="space-y-2">
                {channelsConfig.map((ch, i) => (
                  <div
                    key={`${ch.type}-${i}`}
                    className="flex items-center justify-between text-sm"
                  >
                    <div className="flex items-center gap-2">
                      {getChannelIcon(ch.type)}
                      <span className="capitalize">{ch.type}</span>
                    </div>
                    <Badge
                      variant={
                        ch.enabled === false
                          ? "secondary"
                          : ch.status === "error"
                          ? "destructive"
                          : "success"
                      }
                    >
                      {ch.enabled === false
                        ? "Disabled"
                        : ch.status || "Active"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Health Overview */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <HeartPulse className="w-4 h-4" />
                Health
              </CardTitle>
              <Badge
                variant={
                  bot.health === "HEALTHY"
                    ? "success"
                    : bot.health === "DEGRADED"
                    ? "warning"
                    : bot.health === "UNHEALTHY"
                    ? "destructive"
                    : "secondary"
                }
              >
                {health.label}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Restarts</span>
                <span className={cn("font-medium", bot.restartCount > 0 && "text-yellow-600")}>
                  {bot.restartCount}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Errors</span>
                <span className={cn("font-medium", bot.errorCount > 0 && "text-red-600")}>
                  {bot.errorCount}
                </span>
              </div>
              {bot.lastHealthCheckAt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Last Check</span>
                  <span className="text-xs">
                    {new Date(bot.lastHealthCheckAt).toLocaleString()}
                  </span>
                </div>
              )}
              {bot.lastError && (
                <div className="mt-2 p-2 bg-red-50 rounded text-xs text-red-700">
                  {bot.lastError}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Link href={`/bots/${bot.id}`}>
              <Button variant="outline" size="sm">
                <RefreshCw className="w-4 h-4 mr-2" />
                Restart
              </Button>
            </Link>
            <Link href={`/bots/${bot.id}`}>
              <Button variant="outline" size="sm">
                <Settings className="w-4 h-4 mr-2" />
                View Config
              </Button>
            </Link>
            <Link href={`/bots/${bot.id}`}>
              <Button variant="outline" size="sm">
                <FileText className="w-4 h-4 mr-2" />
                View Logs
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Next Steps */}
      <ContextualSuggestions bot={bot} />
    </div>
  );
}
