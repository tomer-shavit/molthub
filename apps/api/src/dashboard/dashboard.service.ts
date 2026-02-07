import { Injectable, Inject } from "@nestjs/common";
import {
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
  FLEET_REPOSITORY,
  IFleetRepository,
  TRACE_REPOSITORY,
  ITraceRepository,
} from "@clawster/database";
import { HealthAggregatorService } from "../health/health-aggregator.service";
import { AlertingService } from "../health/alerting.service";

export interface DashboardMetrics {
  totalBots: number;
  totalFleets: number;
  healthyBots: number;
  degradedBots: number;
  unhealthyBots: number;
  unreachableBots: number;
  messageVolume: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  failureRate: number;
  costPerHour: number;
  failedDeployments: number;
  activeAlerts: number;
}

export interface OverallHealth {
  status: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
  fleetHealth: Array<{
    fleetId: string;
    fleetName: string;
    totalInstances: number;
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
    unreachableCount: number;
  }>;
  recentAlerts: Array<{
    id: string;
    severity: "CRITICAL" | "WARNING" | "INFO" | string;
    message: string;
    timestamp: Date;
    resourceId?: string;
    resourceType?: string;
  }>;
}

export interface RecentActivity {
  traces: Array<{
    id: string;
    traceId: string;
    botName: string;
    name: string;
    type: string;
    status: string;
    durationMs?: number;
    timestamp: Date;
  }>;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(FLEET_REPOSITORY) private readonly fleetRepo: IFleetRepository,
    @Inject(TRACE_REPOSITORY) private readonly traceRepo: ITraceRepository,
    private readonly healthAggregator: HealthAggregatorService,
    private readonly alerting: AlertingService,
  ) {}

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    // Get bot counts by health
    const botsByHealth = await this.botInstanceRepo.groupByHealth();

    const healthCounts = botsByHealth.reduce((acc, item) => {
      acc[item.health] = item._count;
      return acc;
    }, {} as Record<string, number>);

    // Get total fleets
    const totalFleets = await this.fleetRepo.count();


    // Get failed deployments in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    // Note: The repository doesn't support date range filters directly, using status filter
    const failedResult = await this.botInstanceRepo.findMany({ status: "ERROR" }, { page: 1, limit: 1000 });
    const failedDeployments = failedResult.data.filter(
      (i) => new Date(i.updatedAt).getTime() >= oneHourAgo.getTime()
    ).length;

    // Get recent traces for metrics calculation
    const recentTracesResult = await this.traceRepo.findMany(
      { startedAfter: oneHourAgo },
      { page: 1, limit: 10000 }
    );
    const recentTraces = recentTracesResult.data;

    // Calculate latency percentiles
    const durations = recentTraces
      .map((t) => t.durationMs)
      .filter((d): d is number => d !== null && d !== undefined)
      .sort((a, b) => a - b);

    const p50 = this.percentile(durations, 0.5);
    const p95 = this.percentile(durations, 0.95);
    const p99 = this.percentile(durations, 0.99);

    // Calculate failure rate
    const totalTraces = recentTraces.length;
    const failedTraces = recentTraces.filter((t) => t.status === "ERROR").length;
    const failureRate = totalTraces > 0 ? (failedTraces / totalTraces) * 100 : 0;

    // Estimate message volume (traces in last hour)
    const messageVolume = totalTraces;

    // Total bots includes all instances (including UNKNOWN health)
    const totalBots = await this.botInstanceRepo.count();

    // Count unreachable bots from gateway connection status
    const unreachableBots = await this.botInstanceRepo.countGatewayConnections(["ERROR", "DISCONNECTED"]);

    // Active alerts count from the alerting service
    const activeAlerts = await this.alerting.getActiveAlertCount();

    return {
      totalBots,
      totalFleets,
      healthyBots: healthCounts["HEALTHY"] || 0,
      degradedBots: healthCounts["DEGRADED"] || 0,
      unhealthyBots: healthCounts["UNHEALTHY"] || 0,
      unreachableBots,
      messageVolume,
      latencyP50: p50 || 0,
      latencyP95: p95 || 0,
      latencyP99: p99 || 0,
      failureRate: Math.round(failureRate * 100) / 100,
      costPerHour: 0,
      failedDeployments,
      activeAlerts,
    };
  }

  async getOverallHealth(): Promise<OverallHealth> {
    // Use the health aggregator for real fleet health data
    const workspaceHealth = await this.healthAggregator.getWorkspaceHealth();

    const fleetHealth = workspaceHealth.fleets.map((fleet) => ({
      fleetId: fleet.fleetId,
      fleetName: fleet.fleetName,
      totalInstances: fleet.total,
      healthyCount: fleet.healthy,
      degradedCount: fleet.degraded,
      unhealthyCount: fleet.unhealthy,
      unreachableCount: fleet.unreachable,
    }));

    // Get recent alerts from the alerting service
    const activeAlerts = await this.alerting.getActiveAlerts();
    const recentAlerts = activeAlerts.slice(0, 10).map((alert) => ({
      id: alert.id,
      severity: alert.severity.toUpperCase(),
      message: alert.message,
      timestamp: alert.lastTriggeredAt,
      resourceId: alert.instanceId,
      resourceType: "INSTANCE",
    }));

    // Include recent bot instance errors
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const errorInstancesResult = await this.botInstanceRepo.findMany(
      { status: "ERROR" },
      { page: 1, limit: 100 }
    );
    const recentErrorInstances = errorInstancesResult.data
      .filter((i) => new Date(i.updatedAt).getTime() >= oneDayAgo.getTime())
      .slice(0, 10);

    const deploymentAlerts = recentErrorInstances.map((inst) => ({
      id: inst.id,
      severity: "WARNING" as const,
      message: inst.lastError || `Instance ${inst.name} is in error state`,
      timestamp: inst.updatedAt,
      resourceId: inst.id,
      resourceType: "INSTANCE",
    }));

    return {
      status: workspaceHealth.overallStatus,
      fleetHealth,
      recentAlerts: [...recentAlerts, ...deploymentAlerts].slice(0, 20),
    };
  }

  async getRecentActivity(): Promise<RecentActivity> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    // Get recent traces
    const tracesResult = await this.traceRepo.findMany(
      { startedAfter: oneHourAgo },
      { page: 1, limit: 20 }
    );

    // Note: Trace repository doesn't include botInstance relation by default
    // We'd need to look up bot names separately or add that to the repository
    const traceData = tracesResult.data.map((trace) => ({
      id: trace.id,
      traceId: trace.traceId,
      botName: "Unknown", // Would need additional lookup or repository enhancement
      name: trace.name,
      type: trace.type,
      status: trace.status,
      durationMs: trace.durationMs || undefined,
      timestamp: trace.startedAt,
    }));

    return {
      traces: traceData,
    };
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil(sortedValues.length * p) - 1;
    return sortedValues[Math.max(0, index)];
  }
}
