import { Injectable } from "@nestjs/common";
import { prisma, BotHealth, InstanceStatus } from "@molthub/database";
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
  activeChangeSets: number;
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
  events: Array<{
    id: string;
    type: string;
    message: string;
    timestamp: Date;
    actor: string;
    resourceId?: string;
    resourceType?: string;
  }>;
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
    private readonly healthAggregator: HealthAggregatorService,
    private readonly alerting: AlertingService,
  ) {}

  async getDashboardMetrics(): Promise<DashboardMetrics> {
    // Get bot counts by health
    const botsByHealth = await prisma.botInstance.groupBy({
      by: ["health"],
      _count: { id: true },
    });

    const healthCounts = botsByHealth.reduce((acc, item) => {
      acc[item.health] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    // Get total fleets
    const totalFleets = await prisma.fleet.count();

    // Get active change sets (in progress)
    const activeChangeSets = await prisma.changeSet.count({
      where: { status: "IN_PROGRESS" },
    });

    // Get failed deployments in last hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const failedDeployments = await prisma.deploymentEvent.count({
      where: {
        eventType: "RECONCILE_ERROR",
        createdAt: { gte: oneHourAgo },
      },
    });

    // Get recent traces for metrics calculation
    const recentTraces = await prisma.trace.findMany({
      where: {
        startedAt: { gte: oneHourAgo },
      },
      select: {
        durationMs: true,
        status: true,
      },
    });

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

    // Estimate cost (mock calculation based on instance count)
    const totalBots = Object.values(healthCounts).reduce((a, b) => a + b, 0);
    const costPerHour = totalBots * 0.05; // $0.05 per bot per hour

    // Count unreachable bots from gateway connection status
    const unreachableBots = await prisma.gatewayConnection.count({
      where: {
        status: { in: ["ERROR", "DISCONNECTED"] },
      },
    });

    // Active alerts count from the alerting service
    const activeAlerts = this.alerting.getActiveAlertCount();

    return {
      totalBots,
      totalFleets,
      healthyBots: healthCounts[BotHealth.HEALTHY] || 0,
      degradedBots: healthCounts[BotHealth.DEGRADED] || 0,
      unhealthyBots: healthCounts[BotHealth.UNHEALTHY] || 0,
      unreachableBots,
      messageVolume,
      latencyP50: p50 || 0,
      latencyP95: p95 || 0,
      latencyP99: p99 || 0,
      failureRate: Math.round(failureRate * 100) / 100,
      costPerHour: Math.round(costPerHour * 100) / 100,
      activeChangeSets,
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
    const activeAlerts = this.alerting.getActiveAlerts();
    const recentAlerts = activeAlerts.slice(0, 10).map((alert) => ({
      id: alert.id,
      severity: alert.severity.toUpperCase(),
      message: alert.message,
      timestamp: alert.lastTriggeredAt,
      resourceId: alert.instanceId,
      resourceType: "INSTANCE",
    }));

    // Also include recent deployment errors for backward compat
    const recentErrors = await prisma.deploymentEvent.findMany({
      where: {
        eventType: "RECONCILE_ERROR",
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const deploymentAlerts = recentErrors.map((error) => ({
      id: error.id,
      severity: "WARNING" as const,
      message: error.message,
      timestamp: error.createdAt,
      resourceId: error.instanceId,
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

    // Get recent audit events
    const auditEvents = await prisma.auditEvent.findMany({
      where: {
        timestamp: { gte: oneHourAgo },
      },
      orderBy: { timestamp: "desc" },
      take: 20,
    });

    // Get recent traces with bot names
    const traces = await prisma.trace.findMany({
      where: {
        startedAt: { gte: oneHourAgo },
      },
      include: {
        botInstance: {
          select: { name: true },
        },
      },
      orderBy: { startedAt: "desc" },
      take: 20,
    });

    const events = auditEvents.map((event) => ({
      id: event.id,
      type: event.action,
      message: `${event.action} on ${event.resourceType}`,
      timestamp: event.timestamp,
      actor: event.actor,
      resourceId: event.resourceId,
      resourceType: event.resourceType,
    }));

    const traceData = traces.map((trace) => ({
      id: trace.id,
      traceId: trace.traceId,
      botName: trace.botInstance?.name || "Unknown",
      name: trace.name,
      type: trace.type,
      status: trace.status,
      durationMs: trace.durationMs || undefined,
      timestamp: trace.startedAt,
    }));

    return {
      events,
      traces: traceData,
    };
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;
    const index = Math.ceil(sortedValues.length * p) - 1;
    return sortedValues[Math.max(0, index)];
  }
}
