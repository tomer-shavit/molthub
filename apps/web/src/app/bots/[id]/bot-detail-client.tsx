"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
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
import { GatewayStatus, type GatewayStatusData } from "@/components/openclaw/gateway-status";
import { HealthSnapshot, type HealthSnapshotData } from "@/components/openclaw/health-snapshot";
import { ChannelStatusList, type ChannelStatusData } from "@/components/openclaw/channel-status";
import { QrPairing, type PairingState } from "@/components/openclaw/qr-pairing";
import { SkillSelector, type SkillItem } from "@/components/openclaw/skill-selector";
import { SandboxConfig as SandboxConfigComponent, type SandboxConfigData } from "@/components/openclaw/sandbox-config";
import { cn } from "@/lib/utils";
import { ContextualSuggestions } from "@/components/bots/contextual-suggestions";
import { BotChatPanel } from "@/components/chat/bot-chat-panel";
import { JustDeployedBanner } from "@/components/dashboard/just-deployed-banner";
import { EvolutionBanner, type EvolutionBannerData } from "@/components/openclaw/evolution-banner";
import { LiveSkills } from "@/components/openclaw/live-skills";
import { EvolutionDiff } from "@/components/openclaw/evolution-diff";
import { api, type BotInstance, type Trace, type TraceStats, type ChangeSet, type DeploymentEvent, type AgentEvolutionSnapshot, type TokenUsageSummary, type AgentCard, type A2aJsonRpcResponse } from "@/lib/api";
import { PairingTab } from "@/components/pairing/pairing-tab";
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
  Wifi,
  MessageSquare,
  Puzzle,
  Stethoscope,
  BarChart3,
  GitCompare,
  Smartphone,
  LayoutDashboard,
  ExternalLink,
  Network,
  Copy,
  Check,
  Loader2,
  Send,
} from "lucide-react";

interface BotDetailClientProps {
  bot: BotInstance;
  traces?: Trace[];
  metrics?: TraceStats | null;
  changeSets?: ChangeSet[];
  events?: DeploymentEvent[];
  evolution?: AgentEvolutionSnapshot | null;
}

export function BotDetailClient({ bot, traces = [], metrics = null, changeSets = [], events = [], evolution: initialEvolution }: BotDetailClientProps) {
  const router = useRouter();
  const { toast, confirm: showConfirm } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLifecycleAction, setIsLifecycleAction] = useState(false);
  const [pairingChannel, setPairingChannel] = useState<string | null>(null);
  const [pairingState, setPairingState] = useState<PairingState>("loading");
  const [pairingQr, setPairingQr] = useState<string | undefined>();
  const [evolution, setEvolution] = useState<AgentEvolutionSnapshot | null>(initialEvolution || null);
  const [isSyncingEvolution, setIsSyncingEvolution] = useState(false);
  const [isReconciling, setIsReconciling] = useState(false);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagResult, setDiagResult] = useState<Record<string, unknown> | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsageSummary | null>(null);
  const [isLoadingUsage, setIsLoadingUsage] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [agentCard, setAgentCard] = useState<AgentCard | null>(null);
  const [isLoadingAgentCard, setIsLoadingAgentCard] = useState(false);
  const [agentCardError, setAgentCardError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [a2aTestMessage, setA2aTestMessage] = useState("");
  const [a2aTestResult, setA2aTestResult] = useState<A2aJsonRpcResponse | null>(null);
  const [isSendingA2a, setIsSendingA2a] = useState(false);

  // Fetch token usage when bot is running/degraded, poll every 15s
  useEffect(() => {
    if (bot.status !== "RUNNING" && bot.status !== "DEGRADED") return;

    const fetchUsage = () => {
      setIsLoadingUsage((prev) => prev); // keep current loading state for polls
      api.getTokenUsage(bot.id)
        .then((data) => setTokenUsage(data))
        .catch(() => setTokenUsage(null))
        .finally(() => setIsLoadingUsage(false));
    };

    setIsLoadingUsage(true);
    fetchUsage();

    const interval = setInterval(fetchUsage, 15_000);
    return () => clearInterval(interval);
  }, [bot.id, bot.status]);

  // Lazy-load agent card when A2A tab is activated
  useEffect(() => {
    if (activeTab !== "a2a") return;
    if (agentCard || isLoadingAgentCard) return;

    setIsLoadingAgentCard(true);
    setAgentCardError(null);
    api.getAgentCard(bot.id)
      .then((card) => setAgentCard(card))
      .catch((err) => setAgentCardError(err instanceof Error ? err.message : "Failed to load Agent Card"))
      .finally(() => setIsLoadingAgentCard(false));
  }, [activeTab, bot.id, agentCard, isLoadingAgentCard]);

  const handleCopy = useCallback((text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  }, []);

  const handleDelete = useCallback(async () => {
    const confirmed = await showConfirm({
      message: `Delete "${bot.name}"?`,
      description: "This action cannot be undone. The instance and all its data will be permanently removed.",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!confirmed) return;
    setIsDeleting(true);
    try {
      await api.deleteBotInstance(bot.id);
      toast("Instance deleted", "success");
      router.push("/bots");
    } catch (err) {
      console.error("Failed to delete bot:", err);
      toast("Failed to delete instance", "error");
      setIsDeleting(false);
    }
  }, [bot.id, bot.name, router, showConfirm, toast]);

  const handleStop = useCallback(async () => {
    const confirmed = await showConfirm({
      message: `Stop "${bot.name}"?`,
      description: "The instance will be shut down. You can restart it later.",
      confirmLabel: "Stop",
      variant: "destructive",
    });
    if (!confirmed) return;
    setIsLifecycleAction(true);
    try {
      await api.stopBotInstance(bot.id);
      toast("Instance stopped", "success");
      router.refresh();
    } catch (err) {
      console.error("Failed to stop bot:", err);
      toast("Failed to stop instance", "error");
    } finally {
      setIsLifecycleAction(false);
    }
  }, [bot.id, bot.name, router, showConfirm, toast]);

  const handleStart = useCallback(async () => {
    setIsLifecycleAction(true);
    try {
      await api.startBotInstance(bot.id);
      router.refresh();
    } catch (err) {
      console.error("Failed to start bot:", err);
    } finally {
      setIsLifecycleAction(false);
    }
  }, [bot.id, router]);
  const handleSyncEvolution = useCallback(async () => {
    setIsSyncingEvolution(true);
    try {
      const result = await api.syncEvolution(bot.id);
      setEvolution(result);
    } catch (err) {
      console.error("Failed to sync evolution:", err);
    } finally {
      setIsSyncingEvolution(false);
    }
  }, [bot.id]);

  // Derive data from bot
  const uptimeTotal = bot.runningSince
    ? Math.max(0, Math.floor((Date.now() - new Date(bot.runningSince).getTime()) / 1000))
    : 0;
  const uptimeHours = Math.floor(uptimeTotal / 3600);
  const uptimeMinutes = Math.floor((uptimeTotal % 3600) / 60);

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
  const rawManifest = bot.desiredManifest;
  const manifest = (typeof rawManifest === "string" ? JSON.parse(rawManifest) : rawManifest) as Record<string, unknown>;
  const spec = (manifest?.spec as Record<string, unknown>) || manifest;
  const openclawConfig = (spec?.openclawConfig as Record<string, unknown>) || spec;
  const channelsConfig = (openclawConfig?.channels as Record<string, unknown>) || {};

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
  const skillsConfig = (openclawConfig?.skills as Record<string, unknown>) || {};
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
  const sandboxConf = (openclawConfig?.sandbox as Record<string, unknown>) || {};
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
    setIsReconciling(true);
    try {
      await api.reconcileInstance(bot.id);
      toast("Reconciliation complete", "success");
      router.refresh();
    } catch (err) {
      console.error("Failed to reconcile:", err);
      toast("Reconcile failed. Check logs for details.", "error");
    } finally {
      setIsReconciling(false);
    }
  }, [bot.id, router, toast]);

  // Send A2A test message
  const handleSendA2aTest = useCallback(async () => {
    if (!a2aTestMessage.trim() || isSendingA2a) return;
    setIsSendingA2a(true);
    setA2aTestResult(null);
    try {
      const result = await api.sendA2aMessage(bot.id, a2aTestMessage.trim());
      setA2aTestResult(result);
      setA2aTestMessage("");
    } catch (err) {
      setA2aTestResult({
        jsonrpc: "2.0",
        id: "error",
        error: { code: -1, message: err instanceof Error ? err.message : "Unknown error" },
      });
    } finally {
      setIsSendingA2a(false);
    }
  }, [a2aTestMessage, isSendingA2a, bot.id]);

  // Run diagnostics
  const handleDiagnostics = useCallback(async () => {
    setIsDiagnosing(true);
    setDiagResult(null);
    try {
      const result = await api.runDiagnostics(bot.id);
      setDiagResult(result as unknown as Record<string, unknown>);
      toast("Diagnostics complete", "success");
    } catch (err) {
      console.error("Failed to run diagnostics:", err);
      toast("Diagnostics failed. Check logs for details.", "error");
    } finally {
      setIsDiagnosing(false);
    }
  }, [bot.id, toast]);

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
              OpenClaw instance
              {bot.openclawVersion && <> &middot; v{bot.openclawVersion}</>}
              {bot.profileName && <> &middot; {bot.profileName}</>}
              {bot.deploymentType && <> &middot; {bot.deploymentType}</>}
              {" "}&middot; {bot.id.slice(0, 8)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {bot.status === "RUNNING" && (
              <Button variant="outline" size="sm" onClick={() => setIsChatOpen(true)}>
                <MessageSquare className="w-4 h-4 mr-2" />
                Chat
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={handleReconcile} disabled={isReconciling}>
              <RotateCcw className={`w-4 h-4 mr-2 ${isReconciling ? "animate-spin" : ""}`} />
              {isReconciling ? "Reconciling..." : "Reconcile"}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDiagnostics} disabled={isDiagnosing}>
              <Stethoscope className="w-4 h-4 mr-2" />
              {isDiagnosing ? "Diagnosing..." : "Diagnose"}
            </Button>
            {bot.status === "RUNNING" || bot.status === "DEGRADED" ? (
              <Button variant="outline" size="sm" onClick={handleStop} disabled={isLifecycleAction}>
                <Pause className="w-4 h-4 mr-2" />
                {isLifecycleAction ? "Stopping..." : "Stop"}
              </Button>
            ) : bot.status === "STOPPED" || bot.status === "PAUSED" || bot.status === "ERROR" ? (
              <Button variant="outline" size="sm" onClick={handleStart} disabled={isLifecycleAction}>
                <Play className="w-4 h-4 mr-2" />
                {isLifecycleAction ? "Starting..." : "Start"}
              </Button>
            ) : null}
            <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isDeleting}>
              <Trash2 className="w-4 h-4 mr-2" />
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </div>
        </div>
      </div>

      {/* Status Insight Banner */}
      {bot.status === "PENDING" && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <Clock className="w-5 h-5 text-yellow-600 mt-0.5 animate-spin" />
          <div>
            <p className="font-medium text-yellow-800">Starting up...</p>
            <p className="text-sm text-yellow-700">
              This instance is queued for provisioning. The system will automatically start it shortly.
              If it stays in this state for more than a few minutes, try clicking <strong>Reconcile</strong>.
            </p>
          </div>
        </div>
      )}
      {bot.status === "CREATING" && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Clock className="w-5 h-5 text-blue-600 mt-0.5 animate-spin" />
          <div>
            <p className="font-medium text-blue-800">Provisioning infrastructure...</p>
            <p className="text-sm text-blue-700">
              {bot.deploymentType === "ECS_FARGATE"
                ? "Creating AWS resources (ECS task, networking, secrets). This typically takes 2-5 minutes."
                : "Building and starting the Docker container. This should complete within a minute."}
            </p>
          </div>
        </div>
      )}
      {bot.status === "RECONCILING" && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Clock className="w-5 h-5 text-blue-600 mt-0.5 animate-spin" />
          <div>
            <p className="font-medium text-blue-800">Reconciling configuration...</p>
            <p className="text-sm text-blue-700">
              Applying the desired configuration to the running instance. The gateway will restart if config changed.
            </p>
          </div>
        </div>
      )}
      {bot.status === "STOPPED" && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-gray-50 border border-gray-200 rounded-lg">
          <Pause className="w-5 h-5 text-gray-500 mt-0.5" />
          <div>
            <p className="font-medium text-gray-700">Instance stopped</p>
            <p className="text-sm text-gray-600">
              This instance has been manually stopped. Click <strong>Start</strong> to bring it back online.
              {bot.deploymentType === "ECS_FARGATE" && " The ECS task has been scaled down to zero."}
            </p>
          </div>
        </div>
      )}
      {bot.status === "ERROR" && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="w-5 h-5 text-red-600 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Instance encountered an error</p>
            <p className="text-sm text-red-700">
              {bot.lastError || "An unknown error occurred during provisioning or reconciliation."}
            </p>
            <p className="text-sm text-red-600 mt-1">
              Try clicking <strong>Reconcile</strong> to retry, or check the logs for more details.
            </p>
          </div>
        </div>
      )}

      {/* Diagnostics Result */}
      {diagResult && (
        <div className="p-4 mb-4 bg-indigo-50 border border-indigo-200 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <p className="font-medium text-indigo-800 flex items-center gap-2">
              <Stethoscope className="w-4 h-4" />
              Diagnostics Result
            </p>
            <Button variant="ghost" size="sm" onClick={() => setDiagResult(null)} className="text-indigo-600 h-6 px-2">
              Dismiss
            </Button>
          </div>
          <pre className="text-sm text-indigo-900 bg-indigo-100 rounded p-3 overflow-auto max-h-64 whitespace-pre-wrap">
            {JSON.stringify(diagResult, null, 2)}
          </pre>
        </div>
      )}

      {/* Status Bar */}
      <div className="flex flex-wrap gap-4 mb-8">
        <HealthIndicator health={bot.health} />
        {bot.lastError && (
          <div className="relative group">
            <div className="flex items-center gap-2 text-red-600 bg-red-50 px-3 py-1 rounded-full text-sm cursor-default">
              <AlertCircle className="w-4 h-4" />
              Error state
            </div>
            <div className="absolute left-0 top-full mt-1 z-50 hidden group-hover:block">
              <div className="bg-popover text-popover-foreground border rounded-md shadow-md px-3 py-2 text-xs max-w-sm whitespace-pre-wrap">
                {bot.lastError}
              </div>
            </div>
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
          <TabsTrigger active={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")}>
            <LayoutDashboard className="w-4 h-4 mr-1.5" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger active={activeTab === "channels"} onClick={() => setActiveTab("channels")}>
            <MessageSquare className="w-4 h-4 mr-1.5" />
            Channels
          </TabsTrigger>
          <TabsTrigger active={activeTab === "pairing"} onClick={() => setActiveTab("pairing")}>
            <Smartphone className="w-4 h-4 mr-1.5" />
            Pairing
          </TabsTrigger>
          <TabsTrigger active={activeTab === "skills"} onClick={() => setActiveTab("skills")}>
            <Puzzle className="w-4 h-4 mr-1.5" />
            Skills
          </TabsTrigger>
          <TabsTrigger active={activeTab === "evolution"} onClick={() => setActiveTab("evolution")}>
            <GitCompare className="w-4 h-4 mr-1.5" />
            Evolution
            {evolution?.hasEvolved && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                {evolution.totalChanges}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger active={activeTab === "a2a"} onClick={() => setActiveTab("a2a")}>
            <Network className="w-4 h-4 mr-1.5" />
            A2A
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent active={activeTab === "overview"} className="mt-6">
          {/* Evolution Banner */}
          <EvolutionBanner
            evolution={evolution ? {
              hasEvolved: evolution.hasEvolved,
              totalChanges: evolution.totalChanges,
              capturedAt: evolution.capturedAt,
              gatewayReachable: evolution.gatewayReachable,
              diff: evolution.diff,
              liveSkills: evolution.liveSkills,
              liveMcpServers: evolution.liveMcpServers,
              liveChannels: evolution.liveChannels,
            } : null}
            onSync={handleSyncEvolution}
            isSyncing={isSyncingEvolution}
          />

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

          {/* Token Usage */}
          {(bot.status === "RUNNING" || bot.status === "DEGRADED") && (
            <div className="grid gap-4 md:grid-cols-2 mb-6">
              <MetricCard
                title="Input Tokens"
                value={isLoadingUsage ? "..." : tokenUsage?.totals ? tokenUsage.totals.input.toLocaleString() : "N/A"}
                description="Total input tokens consumed"
                icon={<Zap className="w-4 h-4" />}
              />
              <MetricCard
                title="Output Tokens"
                value={isLoadingUsage ? "..." : tokenUsage?.totals ? tokenUsage.totals.output.toLocaleString() : "N/A"}
                description="Total output tokens generated"
                icon={<Zap className="w-4 h-4" />}
              />
            </div>
          )}

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
                    <span className="font-mono text-xs">{bot.openclawVersion || "unknown"}</span>
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

        {/* Dashboard Tab */}
        <TabsContent active={activeTab === "dashboard"} className="mt-6">
          {bot.status === "RUNNING" ? (() => {
            const gatewayPort = bot.gatewayPort || 18789;
            const gatewayConfig = openclawConfig?.gateway as Record<string, unknown> | undefined;
            const gatewayAuth = gatewayConfig?.auth as Record<string, unknown> | undefined;
            const gatewayToken = (gatewayAuth?.token as string) || "";
            const gatewayHost = bot.gatewayConnection?.host || (bot.metadata?.gatewayHost as string) || "localhost";
            const baseUrl = `http://${gatewayHost}:${gatewayPort}`;
            const dashboardUrl = gatewayToken ? `${baseUrl}?token=${encodeURIComponent(gatewayToken)}` : baseUrl;
            return (
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <LayoutDashboard className="w-4 h-4" />
                      OpenClaw Dashboard
                    </CardTitle>
                    <a
                      href={dashboardUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Button variant="outline" size="sm">
                        <ExternalLink className="w-4 h-4 mr-2" />
                        Open in New Tab
                      </Button>
                    </a>
                  </div>
                  <CardDescription>
                    Native OpenClaw Control UI for this instance. Use Channels &rarr; Show QR to pair WhatsApp.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <iframe
                    src={dashboardUrl}
                    className="w-full border-0 rounded-b-lg"
                    style={{ minHeight: "700px" }}
                    title="OpenClaw Dashboard"
                  />
                </CardContent>
              </Card>
            );
          })() : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                Bot must be running to access the OpenClaw Dashboard.
              </CardContent>
            </Card>
          )}
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

        {/* Pairing Tab */}
        <TabsContent active={activeTab === "pairing"} className="mt-6">
          <PairingTab botId={bot.id} />
        </TabsContent>



        {/* Skills Tab */}
        <TabsContent active={activeTab === "skills"} className="mt-6">
          {evolution?.hasEvolved && evolution.liveSkills ? (
            <div className="grid gap-4 md:grid-cols-2">
              <LiveSkills
                deployedSkills={skills.map((s) => s.name)}
                liveSkills={evolution.liveSkills}
                deployedMcpServers={[]}
                liveMcpServers={evolution.liveMcpServers || []}
              />
              <SandboxConfigComponent data={sandboxData} />
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <SkillSelector skills={skills} />
              <SandboxConfigComponent data={sandboxData} />
            </div>
          )}
        </TabsContent>

        {/* Evolution Tab */}
        <TabsContent active={activeTab === "evolution"} className="mt-6">
          <EvolutionDiff
            deployedConfig={openclawConfig as Record<string, unknown>}
            liveConfig={evolution?.diff?.changes ? openclawConfig as Record<string, unknown> : {}}
            changes={(evolution?.diff?.changes || []) as Array<{ category: string; field: string; changeType: "added" | "removed" | "modified"; deployedValue?: unknown; liveValue?: unknown }>}
          />
        </TabsContent>

        {/* A2A Tab */}
        <TabsContent active={activeTab === "a2a"} className="mt-6">
          {isLoadingAgentCard ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading Agent Card...</span>
            </div>
          ) : agentCardError ? (
            <Card>
              <CardContent className="py-8 text-center">
                <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                <p className="text-red-600 font-medium">Failed to load Agent Card</p>
                <p className="text-sm text-muted-foreground mt-1">{agentCardError}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-4"
                  onClick={() => {
                    setAgentCard(null);
                    setAgentCardError(null);
                  }}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : agentCard ? (
            <div className="space-y-6">
              {/* Endpoint URLs */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Network className="w-4 h-4" />
                    A2A Endpoints
                  </CardTitle>
                  <CardDescription>
                    Use these URLs to interact with this bot via the A2A protocol
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Agent Card URL</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono truncate">
                        GET {agentCard.url}/agent-card
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(`${agentCard.url}/agent-card`, "agentCardUrl")}
                      >
                        {copiedField === "agentCardUrl" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">A2A Endpoint (JSON-RPC)</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-sm bg-muted px-3 py-2 rounded-md font-mono truncate">
                        POST {agentCard.url}
                      </code>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleCopy(agentCard.url, "a2aUrl")}
                      >
                        {copiedField === "a2aUrl" ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      JSON-RPC 2.0 — methods: message/send, message/stream, tasks/get, tasks/cancel (coming in next chunks)
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Agent Identity */}
              <div className="grid gap-4 md:grid-cols-2">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Agent Identity</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Name</span>
                      <span className="font-medium">{agentCard.name}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Version</span>
                      <Badge variant="outline">{agentCard.version}</Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Provider</span>
                      <span>{agentCard.provider?.organization || "—"}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Description</span>
                      <p className="mt-1 text-foreground">{agentCard.description}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Capabilities</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Streaming</span>
                      <Badge variant={agentCard.capabilities.streaming ? "default" : "secondary"}>
                        {agentCard.capabilities.streaming ? "Enabled" : "Not yet"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Push Notifications</span>
                      <Badge variant={agentCard.capabilities.pushNotifications ? "default" : "secondary"}>
                        {agentCard.capabilities.pushNotifications ? "Enabled" : "Not yet"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">State History</span>
                      <Badge variant={agentCard.capabilities.stateTransitionHistory ? "default" : "secondary"}>
                        {agentCard.capabilities.stateTransitionHistory ? "Enabled" : "Not yet"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Input Modes</span>
                      <div className="flex gap-1">
                        {agentCard.defaultInputModes.map((mode) => (
                          <Badge key={mode} variant="outline" className="text-xs">{mode}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Output Modes</span>
                      <div className="flex gap-1">
                        {agentCard.defaultOutputModes.map((mode) => (
                          <Badge key={mode} variant="outline" className="text-xs">{mode}</Badge>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Auth Schemes</span>
                      <div className="flex gap-1">
                        {agentCard.authentication.schemes.map((scheme) => (
                          <Badge key={scheme} variant="outline" className="text-xs">{scheme}</Badge>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Skills */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Puzzle className="w-4 h-4" />
                    Agent Skills
                    <Badge variant="secondary" className="ml-1">{agentCard.skills.length}</Badge>
                  </CardTitle>
                  <CardDescription>
                    Skills this agent advertises to other A2A clients
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {agentCard.skills.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No skills configured. Add SkillPacks or configure skills in the bot&apos;s config.
                    </p>
                  ) : (
                    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                      {agentCard.skills.map((skill) => (
                        <div key={skill.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{skill.name}</p>
                            {skill.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">{skill.description}</p>
                            )}
                            {skill.tags && skill.tags.length > 0 && (
                              <div className="flex gap-1 mt-1.5">
                                {skill.tags.map((tag) => (
                                  <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">{tag}</Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Raw JSON */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">Raw Agent Card JSON</CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopy(JSON.stringify(agentCard, null, 2), "rawJson")}
                    >
                      {copiedField === "rawJson" ? <Check className="w-4 h-4 mr-1.5 text-green-500" /> : <Copy className="w-4 h-4 mr-1.5" />}
                      {copiedField === "rawJson" ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <pre className="text-xs bg-muted rounded-md p-4 overflow-auto max-h-64 font-mono">
                    {JSON.stringify(agentCard, null, 2)}
                  </pre>
                </CardContent>
              </Card>

              {/* Test A2A Message */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Send className="w-4 h-4" />
                    Test A2A Message
                  </CardTitle>
                  <CardDescription>
                    Send a test message via the A2A SendMessage JSON-RPC method
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={a2aTestMessage}
                      onChange={(e) => setA2aTestMessage(e.target.value)}
                      placeholder="Type a message to send to this agent..."
                      className="flex-1 px-3 py-2 text-sm rounded-md border bg-background"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isSendingA2a && a2aTestMessage.trim()) {
                          handleSendA2aTest();
                        }
                      }}
                      disabled={isSendingA2a}
                    />
                    <Button
                      onClick={handleSendA2aTest}
                      disabled={isSendingA2a || !a2aTestMessage.trim()}
                      size="sm"
                    >
                      {isSendingA2a ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  {a2aTestResult && (
                    <div className="space-y-3">
                      {a2aTestResult.error ? (
                        <div className="rounded-md border border-red-200 bg-red-50 dark:bg-red-950/20 p-3">
                          <p className="text-sm font-medium text-red-600">Error {a2aTestResult.error.code}</p>
                          <p className="text-sm text-red-500 mt-1">{a2aTestResult.error.message}</p>
                        </div>
                      ) : a2aTestResult.result ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-sm">
                            <Badge variant={a2aTestResult.result.status.state === "completed" ? "default" : "destructive"}>
                              {a2aTestResult.result.status.state}
                            </Badge>
                            <span className="text-muted-foreground text-xs">
                              Task: {a2aTestResult.result.id.slice(0, 8)}...
                            </span>
                          </div>
                          {a2aTestResult.result.status.message && (
                            <div className="rounded-md border bg-muted/50 p-3">
                              <p className="text-sm whitespace-pre-wrap">
                                {a2aTestResult.result.status.message.parts
                                  ?.map((p) => p.text)
                                  .filter(Boolean)
                                  .join("\n") || "No text content"}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : null}

                      <div>
                        <button
                          onClick={() => setA2aTestResult(null)}
                          className="text-xs text-muted-foreground hover:text-foreground"
                        >
                          Clear result
                        </button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>

      {/* Chat Panel */}
      <BotChatPanel
        instanceId={bot.id}
        botName={bot.name}
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
      />
    </>
  );
}
