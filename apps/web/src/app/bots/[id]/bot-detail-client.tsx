"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBadge, HealthIndicator } from "@/components/ui/status-badge";
import { EnvironmentBadge } from "@/components/ui/environment-badge";
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
import { cn } from "@/lib/utils";
import { resolveGatewayEndpoint, buildGatewayUrl } from "@/lib/bot-utils";
import { ContextualSuggestions } from "@/components/bots/contextual-suggestions";
import { BotChatPanel } from "@/components/chat/bot-chat-panel";
import { JustDeployedBanner } from "@/components/dashboard/just-deployed-banner";
import { EvolutionBanner } from "@/components/openclaw/evolution-banner";
import { api, type BotInstance, type Trace, type TraceStats, type DeploymentEvent, type AgentEvolutionSnapshot, type TokenUsageSummary, type AgentCard, type A2aJsonRpcResponse, type A2aApiKeyInfo, type A2aTaskInfo, type BotTeamMember } from "@/lib/api";
import { BotMiddlewaresTab } from "@/components/middlewares/bot-middlewares-tab";
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
  MessageSquare,
  Puzzle,
  Stethoscope,
  BarChart3,
  LayoutDashboard,
  ExternalLink,
  Network,
  Copy,
  Check,
  Loader2,
  Send,
  Key,
  Eye,
  EyeOff,
  Search,
  ChevronLeft,
  ChevronRight,
  Filter,
  Users,
  Smartphone,
  Settings,
  Terminal,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

interface BotDetailClientProps {
  bot: BotInstance;
  traces?: Trace[];
  metrics?: TraceStats | null;
  events?: DeploymentEvent[];
  evolution?: AgentEvolutionSnapshot | null;
}

export function BotDetailClient({ bot, traces = [], metrics = null, events = [], evolution: initialEvolution }: BotDetailClientProps) {
  const router = useRouter();
  const { toast, confirm: showConfirm } = useToast();
  const [activeTab, setActiveTab] = useState("overview");
  const [isDeleting, setIsDeleting] = useState(false);
  const [isLifecycleAction, setIsLifecycleAction] = useState(false);
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
  const [apiKeys, setApiKeys] = useState<A2aApiKeyInfo[]>([]);
  const [isLoadingApiKeys, setIsLoadingApiKeys] = useState(false);
  const [newKeyLabel, setNewKeyLabel] = useState("");
  const [isGeneratingKey, setIsGeneratingKey] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<string | null>(null);
  const [showNewKey, setShowNewKey] = useState(true);
  const [a2aTasks, setA2aTasks] = useState<A2aTaskInfo[]>([]);
  const [isLoadingTasks, setIsLoadingTasks] = useState(false);
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState<string>("all");
  const [taskPage, setTaskPage] = useState(0);
  const TASKS_PER_PAGE = 10;
  const MAX_EXPANDED_TEXT = 500;

  // Streaming state
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingStatus, setStreamingStatus] = useState<string | null>(null);
  const [streamingTaskId, setStreamingTaskId] = useState<string | null>(null);
  const [streamAbortRef, setStreamAbortRef] = useState<AbortController | null>(null);

  // Team state
  const [teamMembers, setTeamMembers] = useState<BotTeamMember[]>([]);
  const [memberOfTeams, setMemberOfTeams] = useState<BotTeamMember[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [allBots, setAllBots] = useState<BotInstance[]>([]);
  const [newMemberBotId, setNewMemberBotId] = useState("");
  const [newMemberRole, setNewMemberRole] = useState("");
  const [newMemberDescription, setNewMemberDescription] = useState("");
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [isUpdatingMember, setIsUpdatingMember] = useState(false);

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

  // Fetch API keys when A2A tab is activated
  const fetchApiKeys = useCallback(() => {
    setIsLoadingApiKeys(true);
    api.listA2aApiKeys(bot.id)
      .then((keys) => setApiKeys(keys))
      .catch(() => setApiKeys([]))
      .finally(() => setIsLoadingApiKeys(false));
  }, [bot.id]);

  const fetchA2aTasks = useCallback(() => {
    setIsLoadingTasks(true);
    api.listA2aTasks(bot.id)
      .then((tasks) => setA2aTasks(tasks))
      .catch(() => setA2aTasks([]))
      .finally(() => setIsLoadingTasks(false));
  }, [bot.id]);

  useEffect(() => {
    if (activeTab !== "a2a") return;
    fetchApiKeys();
    fetchA2aTasks();
  }, [activeTab, fetchApiKeys, fetchA2aTasks]);

  // Fetch team data when Team tab is activated
  const fetchTeamData = useCallback(() => {
    setIsLoadingTeam(true);
    Promise.all([
      api.listTeamMembers(bot.id),
      api.listMemberOfTeams(bot.id),
      api.listBotInstances(),
    ])
      .then(([members, memberOf, bots]) => {
        setTeamMembers(members);
        setMemberOfTeams(memberOf);
        setAllBots(bots);
      })
      .catch(() => {
        setTeamMembers([]);
        setMemberOfTeams([]);
      })
      .finally(() => setIsLoadingTeam(false));
  }, [bot.id]);

  useEffect(() => {
    if (activeTab !== "team") return;
    fetchTeamData();
  }, [activeTab, fetchTeamData]);

  const handleAddTeamMember = useCallback(async () => {
    if (!newMemberBotId || !newMemberRole.trim() || !newMemberDescription.trim()) return;
    setIsAddingMember(true);
    try {
      await api.addTeamMember({
        ownerBotId: bot.id,
        memberBotId: newMemberBotId,
        role: newMemberRole.trim(),
        description: newMemberDescription.trim(),
      });
      toast("Team member added", "success");
      setShowAddForm(false);
      setNewMemberBotId("");
      setNewMemberRole("");
      setNewMemberDescription("");
      fetchTeamData();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add team member", "error");
    } finally {
      setIsAddingMember(false);
    }
  }, [bot.id, newMemberBotId, newMemberRole, newMemberDescription, fetchTeamData, toast]);

  const handleUpdateTeamMember = useCallback(async (id: string) => {
    setIsUpdatingMember(true);
    try {
      await api.updateTeamMember(id, {
        role: editRole.trim(),
        description: editDescription.trim(),
      });
      toast("Team member updated", "success");
      setEditingMemberId(null);
      fetchTeamData();
    } catch (err) {
      toast("Failed to update team member", "error");
    } finally {
      setIsUpdatingMember(false);
    }
  }, [editRole, editDescription, fetchTeamData, toast]);

  const handleToggleTeamMember = useCallback(async (id: string, enabled: boolean) => {
    try {
      await api.updateTeamMember(id, { enabled });
      fetchTeamData();
    } catch {
      toast("Failed to toggle team member", "error");
    }
  }, [fetchTeamData, toast]);

  const handleRemoveTeamMember = useCallback(async (member: BotTeamMember) => {
    const confirmed = await showConfirm({
      message: `Remove ${member.memberBot?.name || "this bot"} from the team?`,
      description: `${bot.name} will no longer be able to delegate tasks to it.`,
      confirmLabel: "Remove",
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await api.removeTeamMember(member.id);
      toast("Team member removed", "success");
      fetchTeamData();
    } catch {
      toast("Failed to remove team member", "error");
    }
  }, [bot.name, fetchTeamData, showConfirm, toast]);

  const handleGenerateApiKey = useCallback(async () => {
    setIsGeneratingKey(true);
    try {
      const result = await api.generateA2aApiKey(bot.id, newKeyLabel || undefined);
      setNewlyCreatedKey(result.key);
      setShowNewKey(true);
      setNewKeyLabel("");
      fetchApiKeys();
      toast("API key generated", "success");
    } catch (err) {
      toast("Failed to generate API key", "error");
    } finally {
      setIsGeneratingKey(false);
    }
  }, [bot.id, newKeyLabel, fetchApiKeys, toast]);

  const handleRevokeApiKey = useCallback(async (keyId: string) => {
    try {
      await api.revokeA2aApiKey(bot.id, keyId);
      fetchApiKeys();
      toast("API key revoked", "success");
    } catch {
      toast("Failed to revoke API key", "error");
    }
  }, [bot.id, fetchApiKeys, toast]);

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

  // Build gateway status from bot metadata
  const gatewayEndpoint = resolveGatewayEndpoint(bot);
  const gatewayStatus: GatewayStatusData = {
    connected: bot.status === "RUNNING",
    latencyMs: (bot.metadata?.gatewayLatencyMs as number) || undefined,
    lastHeartbeat: (bot.metadata?.lastHeartbeat as string) || bot.lastHealthCheckAt || undefined,
    port: gatewayEndpoint.port,
    host: gatewayEndpoint.host,
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
  const channelCount = Object.keys((openclawConfig?.channels as Record<string, unknown>) || {}).length;

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

  // Send A2A test message (uses newest active API key if available)
  const handleSendA2aTest = useCallback(async () => {
    if (!a2aTestMessage.trim() || isSendingA2a) return;
    setIsSendingA2a(true);
    setA2aTestResult(null);

    // Find the most recently created active key to use for auth
    const activeKey = newlyCreatedKey || undefined;

    try {
      const result = await api.sendA2aMessage(bot.id, a2aTestMessage.trim(), activeKey);
      setA2aTestResult(result);
      setA2aTestMessage("");
      fetchA2aTasks();
    } catch (err) {
      setA2aTestResult({
        jsonrpc: "2.0",
        id: "error",
        error: { code: -1, message: err instanceof Error ? err.message : "Unknown error" },
      });
    } finally {
      setIsSendingA2a(false);
    }
  }, [a2aTestMessage, isSendingA2a, bot.id, newlyCreatedKey, fetchA2aTasks]);

  // Stream A2A test message
  const handleStreamA2aTest = useCallback(() => {
    if (!a2aTestMessage.trim() || isStreaming) return;
    const activeKey = newlyCreatedKey || undefined;
    if (!activeKey) {
      setStreamingStatus("failed");
      setStreamingText("No API key available. Generate one above first.");
      return;
    }

    setIsStreaming(true);
    setStreamingText("");
    setStreamingStatus("working");
    setStreamingTaskId(null);
    setA2aTestResult(null);

    const controller = api.streamA2aMessage(bot.id, a2aTestMessage.trim(), activeKey, {
      onChunk: (text) => {
        setStreamingText((prev) => prev + text);
      },
      onStatus: (state, taskId) => {
        setStreamingStatus(state);
        if (taskId) setStreamingTaskId(taskId);
      },
      onDone: () => {
        setIsStreaming(false);
        setStreamAbortRef(null);
        fetchA2aTasks();
      },
      onError: (error) => {
        setStreamingStatus("failed");
        setStreamingText((prev) => prev || error);
        setIsStreaming(false);
        setStreamAbortRef(null);
      },
    });

    setStreamAbortRef(controller);
    setA2aTestMessage("");
  }, [a2aTestMessage, isStreaming, bot.id, newlyCreatedKey, fetchA2aTasks]);

  const handleCancelStream = useCallback(() => {
    if (streamAbortRef) {
      streamAbortRef.abort();
      setStreamAbortRef(null);
    }
    if (streamingTaskId && newlyCreatedKey) {
      api.cancelA2aTask(bot.id, streamingTaskId, newlyCreatedKey).catch(() => {});
    }
    setIsStreaming(false);
    setStreamingStatus("canceled");
  }, [streamAbortRef, streamingTaskId, bot.id, newlyCreatedKey]);

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
          href="/bots"
          className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Bots
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
              {" "}&middot; <span className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded" title={`Full ID: ${bot.id}`}>ID: {bot.id}</span>
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
              {bot.deploymentType === "ECS_EC2"
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
              {bot.lastError === "Container no longer running" || bot.lastError?.startsWith("Container is ")
                ? <>The Docker container was detected as no longer running. Click <strong>Start</strong> to re-provision it.</>
                : <>This instance has been manually stopped. Click <strong>Start</strong> to bring it back online.</>}
              {bot.deploymentType === "ECS_EC2" && " The ECS task has been scaled down to zero."}
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
      <div className="flex flex-wrap gap-4 mb-4">
        <HealthIndicator health={bot.health} />
        {bot.configHash && (
          <div className="flex items-center gap-2 text-gray-600 bg-gray-100 px-3 py-1 rounded-full text-sm font-mono">
            Config: {bot.configHash.slice(0, 8)}
          </div>
        )}
      </div>

      {/* Error Details Banner */}
      {(bot.lastError || bot.errorCount > 0) && bot.status !== "ERROR" && (
        <div className="flex items-start gap-3 p-4 mb-4 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-amber-800">
              {bot.errorCount > 0
                ? `${bot.errorCount} consecutive health check ${bot.errorCount === 1 ? "failure" : "failures"}`
                : "Last operation failed"}
            </p>
            {bot.lastError && (
              <p className="text-sm text-amber-700 mt-1">
                <span className="font-medium">Last error:</span> {bot.lastError}
              </p>
            )}
            {bot.errorCount >= 5 && bot.status === "RUNNING" && (
              <p className="text-sm text-amber-600 mt-1">
                The gateway has been unreachable for ~{Math.round(bot.errorCount * 30 / 60)} minutes. The container may have stopped.
              </p>
            )}
          </div>
        </div>
      )}

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
          <TabsTrigger active={activeTab === "a2a"} onClick={() => setActiveTab("a2a")}>
            <Network className="w-4 h-4 mr-1.5" />
            A2A
          </TabsTrigger>
          <TabsTrigger active={activeTab === "middlewares"} onClick={() => setActiveTab("middlewares")}>
            <Puzzle className="w-4 h-4 mr-1.5" />
            Middlewares
          </TabsTrigger>
          <TabsTrigger active={activeTab === "team"} onClick={() => setActiveTab("team")}>
            <Users className="w-4 h-4 mr-1.5" />
            Team
            {teamMembers.length > 0 && (
              <Badge variant="secondary" className="ml-1.5 text-xs px-1.5 py-0">
                {teamMembers.length}
              </Badge>
            )}
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
          <div className="grid gap-4 md:grid-cols-2 mb-6">
            <MetricCard
              title="Uptime"
              value={`${uptimeHours}h ${uptimeMinutes}m`}
              description="Since last restart"
              icon={<Clock className="w-4 h-4" />}
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
                  {bot.fleet && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Fleet</span>
                      <Link href={`/fleets/${bot.fleet.id}`} className="flex items-center gap-1.5 hover:underline">
                        <span className="font-medium">{bot.fleet.name}</span>
                        <EnvironmentBadge environment={bot.fleet.environment} />
                      </Link>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Deployment Type</span>
                    <Badge variant="outline">{bot.deploymentType || "local"}</Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Version</span>
                    <span className="font-mono text-xs">{bot.openclawVersion || "—"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Profile</span>
                    <span>{bot.profileName || "None"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Gateway Port</span>
                    <span className="font-mono">{gatewayEndpoint.port}</span>
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
                    <span className="font-bold">{channelCount}</span>
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
                  </div>                  <div className="flex items-center gap-2 text-sm">
                    <FileText className="w-4 h-4 text-orange-500" />
                    <span>{events.length} deployment events</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm">
                    <MessageSquare className="w-4 h-4 text-cyan-500" />
                    <span>{channelCount} channels configured</span>
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
          {bot.status === "RUNNING" && bot.health === "HEALTHY" ? (() => {
            const gatewayConfig = openclawConfig?.gateway as Record<string, unknown> | undefined;
            const gatewayAuth = gatewayConfig?.auth as Record<string, unknown> | undefined;
            const gatewayToken = (gatewayAuth?.token as string) || "";
            const baseUrl = buildGatewayUrl(gatewayEndpoint);
            const withToken = (path: string) => {
              const url = `${baseUrl}${path}`;
              return gatewayToken ? `${url}${url.includes("?") ? "&" : "?"}token=${encodeURIComponent(gatewayToken)}` : url;
            };

            const quickLinks: { label: string; description: string; icon: LucideIcon; path: string }[] = [
              { label: "Chat", description: "Talk to your agent directly", icon: MessageSquare, path: "/chat?session=main" },
              { label: "Channels", description: "WhatsApp, Telegram, and more", icon: Smartphone, path: "/channels" },
              { label: "Sessions", description: "Active conversation sessions", icon: Users, path: "/sessions" },
              { label: "Agents", description: "Agent definitions and routing", icon: Bot, path: "/agents" },
              { label: "Skills", description: "Installed skills and tools", icon: Puzzle, path: "/skills" },
              { label: "Config", description: "Gateway configuration", icon: Settings, path: "/config" },
              { label: "Logs", description: "Real-time gateway logs", icon: ScrollText, path: "/logs" },
              { label: "Debug", description: "Diagnostics and debugging", icon: Terminal, path: "/debug" },
            ];

            return (
              <div className="space-y-6">
                {/* Hero card */}
                <Card className="overflow-hidden">
                  <div className="bg-gradient-to-r from-zinc-900 to-zinc-800 dark:from-zinc-800 dark:to-zinc-900 px-6 py-8">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          <LayoutDashboard className="w-5 h-5" />
                          OpenClaw Control Panel
                        </h3>
                        <p className="text-sm text-zinc-400 max-w-md">
                          Full management interface for your gateway instance. Configure channels, manage sessions, monitor logs, and debug your agent.
                        </p>
                      </div>
                      <a href={withToken("/")} target="_blank" rel="noopener noreferrer">
                        <Button size="lg" className="bg-white text-zinc-900 hover:bg-zinc-100">
                          <ExternalLink className="w-4 h-4 mr-2" />
                          Open Dashboard
                        </Button>
                      </a>
                    </div>
                    <div className="mt-4 flex items-center gap-4 text-xs text-zinc-500">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3 text-emerald-500" />
                        <span className="text-zinc-400">Gateway healthy</span>
                      </span>
                      <span className="text-zinc-600">|</span>
                      <span className="font-mono text-zinc-400">{gatewayEndpoint.host}</span>
                    </div>
                  </div>
                </Card>

                {/* Quick links grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {quickLinks.map((link) => (
                    <a
                      key={link.path}
                      href={withToken(link.path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group"
                    >
                      <Card className="h-full transition-colors hover:bg-muted/50 hover:border-foreground/20">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className="rounded-md bg-muted p-2 group-hover:bg-background transition-colors">
                              <link.icon className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium flex items-center gap-1">
                                {link.label}
                                <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">{link.description}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </a>
                  ))}
                </div>
              </div>
            );
          })() : (
            <Card>
              <CardContent className="py-12 text-center">
                {bot.status === "RUNNING" && bot.health !== "HEALTHY" ? (
                  <div className="space-y-3">
                    <AlertCircle className="w-10 h-10 mx-auto text-amber-500" />
                    <p className="font-medium">Gateway Unreachable</p>
                    <p className="text-sm text-muted-foreground">
                      The bot&apos;s gateway is not responding.
                      {bot.errorCount > 0 && ` (${bot.errorCount} consecutive errors)`}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Check if the Docker container is still running, or try clicking <strong>Reconcile</strong> above.
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Bot must be running and healthy to access the OpenClaw Dashboard.
                  </p>
                )}
              </CardContent>
            </Card>
          )}
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

              {/* Authentication / API Keys */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Key className="w-4 h-4" />
                    Authentication
                  </CardTitle>
                  <CardDescription>
                    API keys for authenticating A2A JSON-RPC requests to this bot
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Newly created key banner */}
                  {newlyCreatedKey && (
                    <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/20 p-3 space-y-2">
                      <p className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                        Save this key — it won&apos;t be shown again
                      </p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded border font-mono truncate">
                          {showNewKey ? newlyCreatedKey : "•".repeat(40)}
                        </code>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowNewKey(!showNewKey)}
                        >
                          {showNewKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleCopy(newlyCreatedKey, "newApiKey")}
                        >
                          {copiedField === "newApiKey" ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs text-muted-foreground"
                        onClick={() => setNewlyCreatedKey(null)}
                      >
                        Dismiss
                      </Button>
                    </div>
                  )}

                  {/* Generate form */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newKeyLabel}
                      onChange={(e) => setNewKeyLabel(e.target.value)}
                      placeholder="Key label (optional)"
                      className="flex-1 px-3 py-2 text-sm rounded-md border bg-background"
                      disabled={isGeneratingKey}
                    />
                    <Button
                      onClick={handleGenerateApiKey}
                      disabled={isGeneratingKey}
                      size="sm"
                    >
                      {isGeneratingKey ? <Loader2 className="w-4 h-4 animate-spin mr-1.5" /> : <Key className="w-4 h-4 mr-1.5" />}
                      Generate Key
                    </Button>
                  </div>

                  {/* Key list */}
                  {isLoadingApiKeys ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    </div>
                  ) : apiKeys.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">
                      No API keys yet. Generate one to secure this bot&apos;s A2A endpoint.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {apiKeys.map((k) => (
                        <div
                          key={k.id}
                          className={cn(
                            "flex items-center justify-between px-3 py-2 rounded-md border text-sm",
                            !k.isActive && "opacity-50",
                          )}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <code className="font-mono text-xs text-muted-foreground">{k.keyPrefix}</code>
                            {k.label && <span className="text-foreground truncate">{k.label}</span>}
                            {!k.isActive && <Badge variant="secondary" className="text-[10px]">Revoked</Badge>}
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-xs text-muted-foreground">
                              {k.lastUsedAt ? `Used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "Never used"}
                            </span>
                            {k.isActive && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                                onClick={() => handleRevokeApiKey(k.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
                  {!newlyCreatedKey && apiKeys.filter((k) => k.isActive).length === 0 && (
                    <div className="rounded-md border border-yellow-200 bg-yellow-50 dark:bg-yellow-950/20 px-3 py-2 text-xs text-yellow-700 dark:text-yellow-300">
                      Generate an API key above to test — the A2A endpoint requires authentication.
                    </div>
                  )}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={a2aTestMessage}
                      onChange={(e) => setA2aTestMessage(e.target.value)}
                      placeholder="Type a message to send to this agent..."
                      className="flex-1 px-3 py-2 text-sm rounded-md border bg-background"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !isSendingA2a && !isStreaming && a2aTestMessage.trim()) {
                          handleSendA2aTest();
                        }
                      }}
                      disabled={isSendingA2a || isStreaming}
                    />
                    <Button
                      onClick={handleSendA2aTest}
                      disabled={isSendingA2a || isStreaming || !a2aTestMessage.trim()}
                      size="sm"
                      title="Send (blocking)"
                    >
                      {isSendingA2a ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </Button>
                    <Button
                      onClick={handleStreamA2aTest}
                      disabled={isSendingA2a || isStreaming || !a2aTestMessage.trim()}
                      size="sm"
                      variant="outline"
                      title="Stream (real-time)"
                    >
                      {isStreaming ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Zap className="w-4 h-4" />
                      )}
                    </Button>
                  </div>

                  {/* Streaming output */}
                  {(isStreaming || streamingText || streamingStatus) && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm">
                          <Badge
                            variant={
                              streamingStatus === "completed" ? "default"
                                : streamingStatus === "failed" ? "destructive"
                                : streamingStatus === "canceled" ? "secondary"
                                : "outline"
                            }
                          >
                            {isStreaming && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                            {streamingStatus || "connecting"}
                          </Badge>
                          {streamingTaskId && (
                            <span className="text-muted-foreground text-xs font-mono">
                              {streamingTaskId.slice(0, 8)}...
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {isStreaming && (
                            <Button variant="destructive" size="sm" onClick={handleCancelStream}>
                              <XCircle className="w-3.5 h-3.5 mr-1" />
                              Cancel
                            </Button>
                          )}
                          {!isStreaming && (
                            <button
                              onClick={() => { setStreamingText(""); setStreamingStatus(null); setStreamingTaskId(null); }}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                      {streamingText && (
                        <div className="rounded-md border bg-muted/50 p-3 max-h-64 overflow-auto">
                          <p className="text-sm whitespace-pre-wrap">{streamingText}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Non-streaming result */}
                  {a2aTestResult && !isStreaming && !streamingText && (
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

              {/* Recent Tasks */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        Recent Tasks
                        {a2aTasks.length > 0 && (
                          <span className="text-xs font-normal text-muted-foreground">({a2aTasks.length})</span>
                        )}
                      </CardTitle>
                      <CardDescription>
                        A2A tasks processed by this bot
                      </CardDescription>
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchA2aTasks} disabled={isLoadingTasks}>
                      {isLoadingTasks ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                    </Button>
                  </div>
                  {a2aTasks.length > 0 && (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="relative flex-1">
                        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Search by input or output..."
                          value={taskSearch}
                          onChange={(e) => { setTaskSearch(e.target.value); setTaskPage(0); }}
                          className="w-full rounded-md border bg-background pl-8 pr-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                        />
                      </div>
                      <select
                        value={taskStatusFilter}
                        onChange={(e) => { setTaskStatusFilter(e.target.value); setTaskPage(0); }}
                        className="rounded-md border bg-background px-2.5 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="all">All status</option>
                        <option value="completed">Completed</option>
                        <option value="failed">Failed</option>
                        <option value="working">Working</option>
                      </select>
                    </div>
                  )}
                </CardHeader>
                <CardContent>
                  {a2aTasks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">
                      No A2A tasks yet. Send a test message above to create one.
                    </p>
                  ) : (() => {
                    const filtered = a2aTasks.filter((task) => {
                      if (taskStatusFilter !== "all" && task.status.state !== taskStatusFilter) return false;
                      if (taskSearch) {
                        const q = taskSearch.toLowerCase();
                        const inputText = String(task.metadata?.inputText || "").toLowerCase();
                        const outputText = (task.status.message?.parts?.map((p) => p.text).join(" ") || "").toLowerCase();
                        if (!inputText.includes(q) && !outputText.includes(q) && !task.id.toLowerCase().includes(q)) return false;
                      }
                      return true;
                    });
                    const totalPages = Math.max(1, Math.ceil(filtered.length / TASKS_PER_PAGE));
                    const page = Math.min(taskPage, totalPages - 1);
                    const paged = filtered.slice(page * TASKS_PER_PAGE, (page + 1) * TASKS_PER_PAGE);

                    return (
                      <>
                        {filtered.length === 0 ? (
                          <p className="text-sm text-muted-foreground text-center py-6">
                            No tasks match your search.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {paged.map((task) => {
                              const isExpanded = expandedTaskId === task.id;
                              const inputText = String(task.metadata?.inputText || "");
                              const outputText = task.status.message?.parts
                                ?.map((p) => p.text)
                                .filter(Boolean)
                                .join("\n") || "";
                              const durationMs = task.metadata?.durationMs;
                              return (
                                <div key={task.id} className="border rounded-md overflow-hidden">
                                  <button
                                    onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                                  >
                                    <Badge
                                      variant={task.status.state === "completed" ? "default" : task.status.state === "failed" ? "destructive" : "secondary"}
                                      className="text-xs shrink-0"
                                    >
                                      {task.status.state}
                                    </Badge>
                                    <span className="text-sm truncate flex-1 text-muted-foreground">
                                      {inputText ? (inputText.length > 60 ? inputText.slice(0, 60) + "..." : inputText) : "—"}
                                    </span>
                                    {durationMs != null && (
                                      <span className="text-xs text-muted-foreground shrink-0">
                                        {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
                                      </span>
                                    )}
                                    <span className="text-xs text-muted-foreground shrink-0">
                                      {task.status.timestamp ? new Date(task.status.timestamp).toLocaleTimeString() : ""}
                                    </span>
                                  </button>
                                  {isExpanded && (
                                    <div className="border-t px-3 py-3 space-y-3 bg-muted/30">
                                      <div className="grid grid-cols-2 gap-2 text-xs">
                                        <div>
                                          <span className="text-muted-foreground">Task ID:</span>{" "}
                                          <span className="font-mono">{task.id.slice(0, 12)}...</span>
                                        </div>
                                        <div>
                                          <span className="text-muted-foreground">Context:</span>{" "}
                                          <span className="font-mono">{task.contextId.slice(0, 12)}...</span>
                                        </div>
                                      </div>
                                      {inputText && (
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Input</p>
                                          <div className="rounded-md border bg-background p-2 text-sm whitespace-pre-wrap max-h-48 overflow-auto">
                                            {inputText.length > MAX_EXPANDED_TEXT ? inputText.slice(0, MAX_EXPANDED_TEXT) + "..." : inputText}
                                          </div>
                                        </div>
                                      )}
                                      {outputText && (
                                        <div>
                                          <p className="text-xs font-medium text-muted-foreground mb-1">Output</p>
                                          <div className="rounded-md border bg-background p-2 text-sm whitespace-pre-wrap max-h-48 overflow-auto">
                                            {outputText.length > MAX_EXPANDED_TEXT ? outputText.slice(0, MAX_EXPANDED_TEXT) + "..." : outputText}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {totalPages > 1 && (
                          <div className="flex items-center justify-between mt-3 pt-3 border-t">
                            <span className="text-xs text-muted-foreground">
                              {filtered.length} task{filtered.length !== 1 ? "s" : ""} · page {page + 1}/{totalPages}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setTaskPage(page - 1)}>
                                <ChevronLeft className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm" disabled={page >= totalPages - 1} onClick={() => setTaskPage(page + 1)}>
                                <ChevronRight className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </TabsContent>
        {/* Team Tab */}
        <TabsContent active={activeTab === "team"} className="mt-6">
          {isLoadingTeam ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Loading team...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Add Form */}
              {showAddForm && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">Add Team Member</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium">Bot</label>
                      <select
                        value={newMemberBotId}
                        onChange={(e) => setNewMemberBotId(e.target.value)}
                        className="w-full mt-1 px-3 py-2 text-sm rounded-md border bg-background"
                      >
                        <option value="">Select a bot...</option>
                        {allBots
                          .filter((b) => b.id !== bot.id && !teamMembers.some((m) => m.memberBotId === b.id))
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} ({b.status})
                            </option>
                          ))}
                      </select>
                      {allBots.filter((b) => b.id !== bot.id && !teamMembers.some((m) => m.memberBotId === b.id)).length === 0 && (
                        <p className="text-xs text-muted-foreground mt-1">All bots in this workspace are already team members.</p>
                      )}
                    </div>
                    <div>
                      <label className="text-sm font-medium">Role</label>
                      <input
                        type="text"
                        value={newMemberRole}
                        onChange={(e) => setNewMemberRole(e.target.value)}
                        placeholder="e.g. Marketing Expert"
                        className="w-full mt-1 px-3 py-2 text-sm rounded-md border bg-background"
                      />
                      <p className="text-xs text-muted-foreground mt-1">Short label for what this bot specializes in.</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium">Description</label>
                      <textarea
                        value={newMemberDescription}
                        onChange={(e) => setNewMemberDescription(e.target.value)}
                        placeholder="Handles marketing strategy, content creation, and campaign planning..."
                        rows={3}
                        className="w-full mt-1 px-3 py-2 text-sm rounded-md border bg-background resize-none"
                      />
                      <p className="text-xs text-muted-foreground mt-1">This description helps the team lead bot decide when to delegate. Be specific about capabilities.</p>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
                      <Button
                        size="sm"
                        onClick={handleAddTeamMember}
                        disabled={isAddingMember || !newMemberBotId || !newMemberRole.trim() || !newMemberDescription.trim()}
                      >
                        {isAddingMember && <Loader2 className="w-4 h-4 animate-spin mr-1.5" />}
                        Add to Team
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Team Members List */}
              <Card>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        Team Members
                        {teamMembers.length > 0 && (
                          <span className="text-xs font-normal text-muted-foreground">({teamMembers.length})</span>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {teamMembers.length > 0
                          ? `These bots are available for "${bot.name}" to delegate tasks to during conversations.`
                          : `Add bots to this team so "${bot.name}" can delegate tasks to specialists during conversations.`}
                      </CardDescription>
                    </div>
                    {!showAddForm && (
                      <Button size="sm" onClick={() => setShowAddForm(true)}>
                        <Users className="w-4 h-4 mr-1.5" />
                        Add Member
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {teamMembers.length === 0 ? (
                    <div className="text-center py-8">
                      <Users className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                      <p className="text-sm text-muted-foreground mb-1">No team members yet</p>
                      <p className="text-xs text-muted-foreground mb-4">
                        When you add team members, this bot will learn about their roles and can autonomously decide when to ask them for help.
                      </p>
                      {!showAddForm && (
                        <Button variant="outline" size="sm" onClick={() => setShowAddForm(true)}>
                          Add Team Member
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {teamMembers.map((member) => {
                        const isEditing = editingMemberId === member.id;
                        return (
                          <div
                            key={member.id}
                            className={cn(
                              "border rounded-lg p-4",
                              !member.enabled && "opacity-50 bg-muted/30"
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                                  <Bot className="w-4 h-4 text-primary" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-2">
                                    <Link href={`/bots/${member.memberBotId}`} className="font-medium text-sm hover:underline">
                                      {member.memberBot?.name || member.memberBotId}
                                    </Link>
                                    {member.memberBot?.status && (
                                      <StatusBadge status={member.memberBot.status as BotInstance["status"]} />
                                    )}
                                  </div>
                                  {isEditing ? (
                                    <div className="mt-2 space-y-2">
                                      <input
                                        type="text"
                                        value={editRole}
                                        onChange={(e) => setEditRole(e.target.value)}
                                        className="w-full px-2 py-1 text-sm rounded border bg-background"
                                        placeholder="Role"
                                      />
                                      <textarea
                                        value={editDescription}
                                        onChange={(e) => setEditDescription(e.target.value)}
                                        className="w-full px-2 py-1 text-sm rounded border bg-background resize-none"
                                        rows={2}
                                        placeholder="Description"
                                      />
                                      <div className="flex gap-2">
                                        <Button
                                          size="sm"
                                          onClick={() => handleUpdateTeamMember(member.id)}
                                          disabled={isUpdatingMember}
                                        >
                                          {isUpdatingMember && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
                                          Save
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => setEditingMemberId(null)}>
                                          Cancel
                                        </Button>
                                      </div>
                                    </div>
                                  ) : (
                                    <>
                                      <p className="text-xs text-muted-foreground mt-0.5">
                                        Role: <span className="text-foreground">{member.role}</span>
                                      </p>
                                      <p className="text-xs text-muted-foreground mt-1">{member.description}</p>
                                    </>
                                  )}
                                </div>
                              </div>
                              {!isEditing && (
                                <div className="flex items-center gap-2">
                                  <button
                                    onClick={() => handleToggleTeamMember(member.id, !member.enabled)}
                                    className={cn(
                                      "w-9 h-5 rounded-full relative transition-colors",
                                      member.enabled ? "bg-primary" : "bg-muted-foreground/30"
                                    )}
                                    title={member.enabled ? "Disable" : "Enable"}
                                  >
                                    <span
                                      className={cn(
                                        "absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform",
                                        member.enabled ? "left-4.5" : "left-0.5"
                                      )}
                                    />
                                  </button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => {
                                      setEditingMemberId(member.id);
                                      setEditRole(member.role);
                                      setEditDescription(member.description);
                                    }}
                                  >
                                    <FileText className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0 text-muted-foreground hover:text-red-600"
                                    onClick={() => handleRemoveTeamMember(member)}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Member Of section */}
              {memberOfTeams.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Member Of</CardTitle>
                    <CardDescription>
                      This bot is a team member of the following bots:
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {memberOfTeams.map((membership) => (
                        <div key={membership.id} className="flex items-center gap-3 p-3 rounded-lg border">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                            <Bot className="w-4 h-4 text-primary" />
                          </div>
                          <div className="flex-1">
                            <Link href={`/bots/${membership.ownerBotId}`} className="text-sm font-medium hover:underline">
                              {membership.ownerBot?.name || membership.ownerBotId}
                            </Link>
                            <p className="text-xs text-muted-foreground">
                              as &quot;{membership.role}&quot; &mdash; {membership.description}
                            </p>
                          </div>
                          <Badge variant={membership.enabled ? "default" : "secondary"} className="text-xs">
                            {membership.enabled ? "Active" : "Disabled"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent active={activeTab === "middlewares"} className="mt-6">
          <BotMiddlewaresTab bot={bot} />
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
