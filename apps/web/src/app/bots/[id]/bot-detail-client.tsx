"use client";

import { useState, useCallback, useEffect } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, HealthIndicator } from "@/components/ui/status-badge";
import { MetricCard } from "@/components/dashboard/metric-card";
import { TimeDisplay, DurationDisplay } from "@/components/ui/time-display";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { GatewayStatus, type GatewayStatusData } from "@/components/moltbot/gateway-status";
import { HealthSnapshot, type HealthSnapshotData } from "@/components/moltbot/health-snapshot";
import { ChannelStatusList, type ChannelStatusData } from "@/components/moltbot/channel-status";
import { ConfigEditor } from "@/components/moltbot/config-editor";
import { LogViewer, type LogEntry } from "@/components/moltbot/log-viewer";
import { QrPairing, type PairingState } from "@/components/moltbot/qr-pairing";
import { SkillSelector, type SkillItem } from "@/components/moltbot/skill-selector";
import { SandboxConfig as SandboxConfigComponent, type SandboxConfigData } from "@/components/moltbot/sandbox-config";
import { cn } from "@/lib/utils";
import { ContextualSuggestions } from "@/components/bots/contextual-suggestions";
import { JustDeployedBanner } from "@/components/dashboard/just-deployed-banner";
import { api, type BotInstance, type Trace, type TraceStats, type ChangeSet, type DeploymentEvent } from "@/lib/api";
import Link from "next/link";
import {
  ArrowLeft,
  Bot,
  Activity,
  RotateCcw,
  Pause,
  Play,
  Trash2,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Zap,
  FileText,
  GitBranch,
  Terminal,
  Wifi,
  MessageSquare,
  Settings,
  Puzzle,
  Stethoscope,
  BarChart3,
} from "lucide-react";

interface BotDetailClientProps {
  bot: BotInstance;
  traces: Trace[];
  metrics: TraceStats | null;
  changeSets: ChangeSet[];
  events: DeploymentEvent[];
}

export function BotDetailClient({ bot, traces, metrics, changeSets, events }: BotDetailClientProps) {
  const [activeTab, setActiveTab] = useState("overview");
  const [isApplyingConfig, setIsApplyingConfig] = useState(false);
  const [pairingChannel, setPairingChannel] = useState<string | null>(null);
  const [pairingState, setPairingState] = useState<PairingState>("loading");
  const [pairingQr, setPairingQr] = useState<string | undefined>();

  // Derive data from bot
  const uptimeHours = Math.floor(bot.uptimeSeconds / 3600);
  const uptimeMinutes = Math.floor((bot.uptimeSeconds % 3600) / 60);

  const successRate = metrics && metrics.total > 0
    ? Math.round((metrics.success / metrics.total) * 100)
    : 0;

  // Build gateway status from bot metadata
  const gatewayStatus: GatewayStatusData = {
    connected: bot.status === "RUNNING",
    latencyMs: (bot.metadata?.gatewayLatencyMs as number) || undefined,
    lastHeartbeat: (bot.metadata?.lastHeartbeat as string) || bot.lastHealthCheckAt || undefined,
    port: bot.gatewayPort || 18789,
    host: (bot.metadata?.gatewayHost as string) || undefined,
  };

  // Build health snapshot from bot data
  const healthSnapshot: HealthSnapshotData = {
    overall: bot.health.toLowerCase() as HealthSnapshotData["overall"],
    components: [
      {
        name: "gateway",
        status: bot.status === "RUNNING" ? "healthy" : bot.status === "DEGRADED" ? "degraded" : "unhealthy",
      },
      {
        name: "channels",
        status: bot.health.toLowerCase() as "healthy" | "degraded" | "unhealthy" | "unknown",
      },
      {
        name: "tools",
        status: bot.errorCount > 0 ? "degraded" : "healthy",
      },
      {
        name: "sandbox",
        status: "healthy",
      },
    ],
    lastChecked: bot.lastHealthCheckAt || undefined,
  };

  // Build channel status from desiredManifest
  const manifest = bot.desiredManifest;
  const spec = (manifest?.spec as Record<string, unknown>) || manifest;
  const moltbotConfig = (spec?.moltbotConfig as Record<string, unknown>) || spec;
  const channelsConfig = (moltbotConfig?.channels as Record<string, unknown>) || {};

  const channels: ChannelStatusData[] = Object.entries(channelsConfig).map(([type, config]) => {
    const channelConf = config as Record<string, unknown>;
    return {
      id: type,
      type,
      enabled: channelConf?.enabled !== false,
      authState: "paired" as const, // Default assumption; real status comes from API
      dmPolicy: (channelConf?.dmPolicy as string) || "pairing",
      groupPolicy: (channelConf?.groupPolicy as string) || "disabled",
    };
  });

  // Build skills list
  const skillsConfig = (moltbotConfig?.skills as Record<string, unknown>) || {};
  const skillEntries = (skillsConfig?.entries as Record<string, Record<string, unknown>>) || {};
  const bundledSkills = (skillsConfig?.allowBundled as string[]) || [];

  const skills: SkillItem[] = [
    ...Object.entries(skillEntries).map(([id, entry]) => ({
      id,
      name: id,
      description: entry.config ? "Custom configuration" : undefined,
      enabled: entry.enabled !== false,
    })),
    ...bundledSkills.map((id) => ({
      id,
      name: id,
      description: "Bundled skill",
      enabled: true,
      category: "bundled",
    })),
  ];

  // Build sandbox config
  const sandboxConf = (moltbotConfig?.sandbox as Record<string, unknown>) || {};
  const sandboxData: SandboxConfigData = {
    mode: (sandboxConf?.mode as SandboxConfigData["mode"]) || "off",
    scope: (sandboxConf?.scope as SandboxConfigData["scope"]) || undefined,
    workspaceAccess: (sandboxConf?.workspaceAccess as SandboxConfigData["workspaceAccess"]) || "rw",
    docker: sandboxConf?.docker
      ? {
          image: (sandboxConf.docker as Record<string, unknown>)?.image as string,
          memory: (sandboxConf.docker as Record<string, unknown>)?.memory as string,
          cpus: (sandboxConf.docker as Record<string, unknown>)?.cpus as number,
        }
      : undefined,
  };

  // Mock log entries from recent traces (in production, these come from a real log endpoint)
  const logEntries: LogEntry[] = traces.slice(0, 50).map((trace, i) => ({
    id: trace.id || String(i),
    timestamp: trace.startedAt,
    level: trace.status === "ERROR" ? "error" : trace.status === "PENDING" ? "warn" : "info",
    message: `[${trace.type}] ${trace.name}${trace.durationMs ? ` (${trace.durationMs}ms)` : ""}${trace.error ? ` - ${JSON.stringify(trace.error)}` : ""}`,
    source: trace.type.toLowerCase(),
  }));

  // Config editor
  const currentConfigStr = JSON.stringify(bot.desiredManifest, null, 2);

  const handleApplyConfig = useCallback(async (configStr: string) => {
    setIsApplyingConfig(true);
    try {
      await api.applyConfig(bot.id, configStr);
    } catch (err) {
      console.error("Failed to apply config:", err);
    } finally {
      setIsApplyingConfig(false);
    }
  }, [bot.id]);

  // Channel auth
  const handleStartAuth = useCallback(async (channelId: string) => {
    setPairingChannel(channelId);
    setPairingState("loading");
    try {
      const result = await api.startChannelAuth(bot.id, channelId);
      setPairingQr(result.qrCodeUrl);
      setPairingState(result.state === "pending" ? "ready" : (result.state as PairingState));
    } catch {
      setPairingState("error");
    }
  }, [bot.id]);

  // Reconcile
  const handleReconcile = useCallback(async () => {
    try {
      await api.reconcileInstance(bot.id);
    } catch (err) {
      console.error("Failed to reconcile:", err);
    }
  }, [bot.id]);

  // Run diagnostics
  const handleDiagnostics = useCallback(async () => {
    try {
      await api.runDiagnostics(bot.id);
    } catch (err) {
      console.error("Failed to run diagnostics:", err);
    }
  }, [bot.id]);

  const recentTraces = traces.slice(0, 20);
  const traceTypeStats = traces.reduce((acc, trace) => {
    acc[trace.type] = (acc[trace.type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <>
      {/* Just Deployed Banner */}
      {bot.createdAt && <JustDeployedBanner createdAt={bot.createdAt} />}

      {/* Header */}
      <div className="mb-6">
        <Link
          href={bot.fleetId ? `/fleets/${bot.fleetId}` : "/"}
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Fleet
        </Link>
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight">{bot.name}</h1>
              <StatusBadge status={bot.status} />
            </div>
            <p className="text-muted-foreground mt-1">
              Moltbot instance
              {bot.moltbotVersion && <> &middot; v{bot.moltbotVersion}</>}
              {bot.profileName && <> &middot; {bot.profileName}</>}
              {bot.deploymentType && <> &middot; {bot.deploymentType}</>}
              {" "}&middot; {bot.id.slice(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleReconcile}>
              <RotateCcw className="w-4 h-4 mr-2" />
              Reconcile
            </Button>
            <Button variant="outline" size="sm" onClick={handleDiagnostics}>
              <Stethoscope className="w-4 h-4 mr-2" />
              Diagnose
            </Button>
            {bot.status === "RUNNING" ? (
              <Button variant="outline" size="sm">
                <Pause className="w-4 h-4 mr-2" />
                Stop
              </Button>
            ) : (
              <Button variant="outline" size="sm">
                <Play className="w-4 h-4 mr-2" />
                Start
              </Button>
            )}
            <Button variant="destructive" size="sm">
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="flex flex-wrap gap-4 mb-8">
        <HealthIndicator health={bot.health} />
        {bot.lastError && (
          <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1 rounded-full text-sm">
            <AlertCircle className="w-4 h-4" />
            Error state
          </div>
        )}
        {bot.errorCount > 0 && (
          <div className="flex items-center gap-2 text-orange-600 bg-orange-50 px-3 py-1 rounded-full text-sm">
            <AlertCircle className="w-4 h-4" />
            {bot.errorCount} errors
          </div>
        )}
        {bot.configHash && (
          <div className="flex items-center gap-2 text-gray-600 bg-gray-100 px-3 py-1 rounded-full text-sm font-mono">
            Config: {bot.configHash.slice(0, 8)}
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start">
          <TabsTrigger active={activeTab === "overview"} onClick={() => setActiveTab("overview")}>
            <Activity className="w-4 h-4 mr-1.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger active={activeTab === "channels"} onClick={() => setActiveTab("channels")}>
            <MessageSquare className="w-4 h-4 mr-1.5" />
            Channels
          </TabsTrigger>
          <TabsTrigger active={activeTab === "config"} onClick={() => setActiveTab("config")}>
            <Settings className="w-4 h-4 mr-1.5" />
            Config
          </TabsTrigger>
          <TabsTrigger active={activeTab === "logs"} onClick={() => setActiveTab("logs")}>
            <Terminal className="w-4 h-4 mr-1.5" />
            Logs
          </TabsTrigger>
          <TabsTrigger active={activeTab === "skills"} onClick={() => setActiveTab("skills")}>
            <Puzzle className="w-4 h-4 mr-1.5" />
            Skills
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent active={activeTab === "overview"} className="mt-6">
          {/* Metrics Grid */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
            <MetricCard
              title="Uptime"
              value={`${uptimeHours}h ${uptimeMinutes}m`}
              description="Since last restart"
              icon={<Clock className="w-4 h-4" />}
            />
            <MetricCard
              title="Success Rate"
              value={`${successRate}%`}
              description={`${metrics?.success || 0} / ${metrics?.total || 0} requests`}
              icon={<CheckCircle className="w-4 h-4" />}
              className={cn(
                successRate < 90 ? "border-l-4 border-l-red-500" :
                successRate < 95 ? "border-l-4 border-l-yellow-500" : ""
              )}
            />
            <MetricCard
              title="Avg Latency"
              value={metrics?.avgDuration ? `${Math.round(metrics.avgDuration)}ms` : "N/A"}
              description="Response time"
              icon={<Zap className="w-4 h-4" />}
            />
            <MetricCard
              title="Restarts"
              value={bot.restartCount}
              description="Total restart count"
              icon={<RotateCcw className="w-4 h-4" />}
              className={bot.restartCount > 0 ? "border-l-4 border-l-yellow-500" : ""}
            />
          </div>

          {/* Gateway + Health + Deployment Info */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
            <GatewayStatus data={gatewayStatus} instanceId={bot.id} />
            <HealthSnapshot data={healthSnapshot} instanceId={bot.id} />
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Bot className="w-4 h-4" />
                  Deployment Info
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Deployment Type</span>
                    <Badge variant="outline">{bot.deploymentType || "local"}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono text-xs">{bot.moltbotVersion || "unknown"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Profile</span>
                    <span>{bot.profileName || "None"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Gateway Port</span>
                    <span className="font-mono">{bot.gatewayPort || 18789}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Config Hash</span>
                    <span className="font-mono text-xs">{bot.configHash?.slice(0, 12) || "N/A"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Last Reconcile</span>
                    <span>
                      {bot.lastReconcileAt ? (
                        <TimeDisplay date={bot.lastReconcileAt} />
                      ) : (
                        "Never"
                      )}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-6">
            {/* Trace Type Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Trace Types (24h)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(traceTypeStats)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([type, count]) => (
                      <div key={type} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="capitalize">{type.toLowerCase()}</span>
                          <span className="font-medium">{count}</span>
                        </div>
                        <Progress
                          value={traces.length > 0 ? (count / traces.length) * 100 : 0}
                          className="h-1.5"
                        />
                      </div>
                    ))}
                  {!Object.keys(traceTypeStats).length && (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No traces in last 24 hours
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Total Traces</span>
                    <span className="font-bold">{metrics?.total || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Successful</span>
                    <span className="font-bold text-green-600">{metrics?.success || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Failed</span>
                    <span className="font-bold text-red-600">{metrics?.error || 0}</span>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-muted rounded">
                    <span className="text-sm">Channels</span>
                    <span className="font-bold">{channels.length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Recent Activity Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Recent Activity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Activity className="w-4 h-4 text-blue-500" />
                    <span>{traces.length} traces in last 24h</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <GitBranch className="w-4 h-4 text-purple-500" />
                    <span>{changeSets.length} change sets</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-orange-500" />
                    <span>{events.length} deployment events</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-cyan-500" />
                    <span>{channels.length} channels configured</span>
                  </div>
                  {bot.lastHealthCheckAt && (
                    <div className="flex items-center gap-2 text-sm">
                      <Clock className="w-4 h-4 text-green-500" />
                      <span>Health checked <TimeDisplay date={bot.lastHealthCheckAt} /></span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Recent Traces Table */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Recent Traces</CardTitle>
                  <CardDescription>Last 24 hours of execution traces</CardDescription>
                </div>
                <Link href={`/traces?botInstanceId=${bot.id}`}>
                  <Button variant="outline" size="sm">View All</Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Trace ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Started</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentTraces.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No traces found for this bot in the last 24 hours.
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentTraces.map((trace) => (
                      <TableRow key={trace.id}>
                        <TableCell className="font-mono text-xs">
                          <Link href={`/traces/${trace.traceId}`} className="hover:underline text-primary">
                            {trace.traceId.slice(0, 16)}...
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium">{trace.name}</TableCell>
                        <TableCell>
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary">
                            {trace.type}
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            {trace.status === "SUCCESS" && <CheckCircle className="w-4 h-4 text-green-500" />}
                            {trace.status === "ERROR" && <XCircle className="w-4 h-4 text-red-500" />}
                            {trace.status === "PENDING" && <Clock className="w-4 h-4 text-yellow-500" />}
                            <span className={cn(
                              "text-sm",
                              trace.status === "SUCCESS" && "text-green-600",
                              trace.status === "ERROR" && "text-red-600",
                              trace.status === "PENDING" && "text-yellow-600",
                            )}>
                              {trace.status}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {trace.durationMs ? <DurationDisplay ms={trace.durationMs} /> : "-"}
                        </TableCell>
                        <TableCell>
                          <TimeDisplay date={trace.startedAt} />
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Contextual Suggestions */}
          <ContextualSuggestions bot={bot} />
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent active={activeTab === "channels"} className="mt-6">
          {pairingChannel ? (
            <QrPairing
              channelType={pairingChannel}
              qrCodeUrl={pairingQr}
              state={pairingState}
              onRefresh={() => handleStartAuth(pairingChannel)}
              onClose={() => setPairingChannel(null)}
            />
          ) : (
            <ChannelStatusList
              channels={channels}
              onStartAuth={handleStartAuth}
            />
          )}
        </TabsContent>

        {/* Config Tab */}
        <TabsContent active={activeTab === "config"} className="mt-6">
          <ConfigEditor
            currentConfig={currentConfigStr}
            onApply={handleApplyConfig}
            isApplying={isApplyingConfig}
          />
        </TabsContent>

        {/* Logs Tab */}
        <TabsContent active={activeTab === "logs"} className="mt-6">
          <LogViewer logs={logEntries} isLive={bot.status === "RUNNING"} instanceId={bot.id} />
        </TabsContent>

        {/* Skills Tab */}
        <TabsContent active={activeTab === "skills"} className="mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            <SkillSelector skills={skills} />
            <SandboxConfigComponent data={sandboxData} />
          </div>
        </TabsContent>
      </Tabs>

      {/* Last Error Alert */}
      {bot.lastError && (
        <Card className="mt-8 border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-800 flex items-center gap-2">
              <AlertCircle className="w-5 h-5" />
              Last Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-red-700 text-sm whitespace-pre-wrap overflow-auto max-h-48">{bot.lastError}</pre>
            <p className="text-red-600 text-xs mt-2">
              Error count: {bot.errorCount}
            </p>
          </CardContent>
        </Card>
      )}
    </>
  );
}
