import { Injectable, Logger } from "@nestjs/common";
import { prisma, BotHealth, BotStatus } from "@molthub/database";
import type { GatewayHealthSnapshot, ChannelHealth } from "@molthub/gateway-client";

// ---- Response types --------------------------------------------------------

export interface FleetHealthSummary {
  fleetId: string;
  fleetName: string;
  total: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  unreachable: number;
  componentBreakdown: ComponentBreakdown[];
}

export interface ComponentBreakdown {
  component: string; // channel id/name
  type: string;
  healthy: number;
  degraded: number;
  total: number;
}

export interface WorkspaceHealthOverview {
  overallStatus: "HEALTHY" | "DEGRADED" | "UNHEALTHY" | "UNKNOWN";
  totalInstances: number;
  healthy: number;
  degraded: number;
  unhealthy: number;
  unreachable: number;
  fleets: FleetHealthSummary[];
  lastUpdated: Date;
}

export interface HealthHistoryPoint {
  capturedAt: Date;
  isHealthy: boolean;
  channelsLinked: number;
  channelsDegraded: number;
  gatewayLatencyMs: number | null;
  data: GatewayHealthSnapshot;
}

@Injectable()
export class HealthAggregatorService {
  private readonly logger = new Logger(HealthAggregatorService.name);

  /**
   * Aggregate health for all instances in a fleet.
   */
  async getFleetHealth(fleetId: string): Promise<FleetHealthSummary> {
    const fleet = await prisma.fleet.findUniqueOrThrow({
      where: { id: fleetId },
      include: {
        instances: {
          select: {
            id: true,
            health: true,
            status: true,
            gatewayConnection: {
              select: { status: true },
            },
          },
        },
      },
    });

    let healthy = 0;
    let degraded = 0;
    let unhealthy = 0;
    let unreachable = 0;

    for (const inst of fleet.instances) {
      const gwStatus = inst.gatewayConnection?.status;
      if (
        gwStatus === "ERROR" ||
        gwStatus === "DISCONNECTED" ||
        inst.status === BotStatus.STOPPED ||
        inst.status === BotStatus.ERROR
      ) {
        unreachable++;
      } else if (inst.health === BotHealth.HEALTHY) {
        healthy++;
      } else if (inst.health === BotHealth.DEGRADED) {
        degraded++;
      } else {
        unhealthy++;
      }
    }

    // Component breakdown: fetch latest snapshot per instance
    const componentBreakdown = await this.buildComponentBreakdown(
      fleet.instances.map((i) => i.id),
    );

    return {
      fleetId: fleet.id,
      fleetName: fleet.name,
      total: fleet.instances.length,
      healthy,
      degraded,
      unhealthy,
      unreachable,
      componentBreakdown,
    };
  }

  /**
   * Global health overview across the entire workspace.
   */
  async getWorkspaceHealth(): Promise<WorkspaceHealthOverview> {
    const fleets = await prisma.fleet.findMany({
      select: { id: true },
    });

    const fleetSummaries: FleetHealthSummary[] = [];
    for (const fleet of fleets) {
      try {
        const summary = await this.getFleetHealth(fleet.id);
        fleetSummaries.push(summary);
      } catch (err) {
        this.logger.warn(`Failed to aggregate fleet ${fleet.id}: ${(err as Error).message}`);
      }
    }

    const totalInstances = fleetSummaries.reduce((s, f) => s + f.total, 0);
    const healthy = fleetSummaries.reduce((s, f) => s + f.healthy, 0);
    const degraded = fleetSummaries.reduce((s, f) => s + f.degraded, 0);
    const unhealthy = fleetSummaries.reduce((s, f) => s + f.unhealthy, 0);
    const unreachable = fleetSummaries.reduce((s, f) => s + f.unreachable, 0);

    let overallStatus: WorkspaceHealthOverview["overallStatus"] = "UNKNOWN";
    if (totalInstances === 0) {
      overallStatus = "UNKNOWN";
    } else if (unhealthy > 0 || unreachable > 0) {
      overallStatus = "UNHEALTHY";
    } else if (degraded > 0) {
      overallStatus = "DEGRADED";
    } else {
      overallStatus = "HEALTHY";
    }

    return {
      overallStatus,
      totalInstances,
      healthy,
      degraded,
      unhealthy,
      unreachable,
      fleets: fleetSummaries,
      lastUpdated: new Date(),
    };
  }

  /**
   * Time-series health data for an instance between two dates.
   */
  async getHealthHistory(
    instanceId: string,
    from: Date,
    to: Date,
  ): Promise<HealthHistoryPoint[]> {
    const snapshots = await prisma.healthSnapshot.findMany({
      where: {
        instanceId,
        capturedAt: { gte: from, lte: to },
      },
      orderBy: { capturedAt: "asc" },
    });

    return snapshots.map((s) => ({
      capturedAt: s.capturedAt,
      isHealthy: s.isHealthy,
      channelsLinked: s.channelsLinked,
      channelsDegraded: s.channelsDegraded,
      gatewayLatencyMs: s.gatewayLatencyMs,
      data: s.data as unknown as GatewayHealthSnapshot,
    }));
  }

  // ---- Internals -----------------------------------------------------------

  /**
   * Build per-component (channel) breakdown from the latest snapshots
   * of the given instance IDs.
   */
  private async buildComponentBreakdown(
    instanceIds: string[],
  ): Promise<ComponentBreakdown[]> {
    if (instanceIds.length === 0) return [];

    // Fetch latest snapshot per instance using a raw approach:
    // get the most recent snapshot for each instance.
    const latestSnapshots = await Promise.all(
      instanceIds.map((id) =>
        prisma.healthSnapshot.findFirst({
          where: { instanceId: id },
          orderBy: { capturedAt: "desc" },
          select: { data: true },
        }),
      ),
    );

    // Aggregate channels across all snapshots
    const channelMap = new Map<
      string,
      { component: string; type: string; healthy: number; degraded: number; total: number }
    >();

    for (const snap of latestSnapshots) {
      if (!snap?.data) continue;
      const healthData = snap.data as unknown as GatewayHealthSnapshot;
      if (!healthData.channels) continue;

      for (const ch of healthData.channels) {
        const key = `${ch.type}:${ch.name}`;
        const entry = channelMap.get(key) ?? {
          component: ch.name,
          type: ch.type,
          healthy: 0,
          degraded: 0,
          total: 0,
        };
        entry.total++;
        if (ch.ok) {
          entry.healthy++;
        } else {
          entry.degraded++;
        }
        channelMap.set(key, entry);
      }
    }

    return Array.from(channelMap.values());
  }
}
