import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  Prisma,
  prisma,
} from "@clawster/database";
import {
  GatewayClient,
  GatewayConnectionError,
  GatewayTimeoutError,
} from "@clawster/gateway-client";
import type {
  GatewayHealthSnapshot,
  GatewayConnectionOptions,
  GatewayAuth,
  CostUsageSummary,
} from "@clawster/gateway-client";

/** Maximum concurrent health polls. */
const CONCURRENCY_LIMIT = 10;

/** Timeout for a single health poll (ms). */
const POLL_TIMEOUT_MS = 10_000;

/**
 * After this many consecutive health-check failures, verify whether the
 * Docker container still exists and update bot status accordingly.
 * 5 failures × 30 s poll interval ≈ 2.5 minutes of unreachability.
 */
const CONTAINER_CHECK_THRESHOLD = 5;

export interface StoredHealthSnapshot {
  id: string;
  instanceId: string;
  data: GatewayHealthSnapshot;
  isHealthy: boolean;
  channelsLinked: number;
  channelsDegraded: number;
  gatewayLatencyMs: number | null;
  capturedAt: Date;
}

@Injectable()
export class OpenClawHealthService {
  private readonly logger = new Logger(OpenClawHealthService.name);

  // ---- Scheduled polling ---------------------------------------------------

  @Cron("*/30 * * * * *")
  async handleHealthPollCron(): Promise<void> {
    try {
      await this.pollAllInstances();
    } catch (err) {
      this.logger.error(
        `Scheduled health poll failed: ${(err as Error).message}`,
      );
    }
  }

  // ---- Public API ----------------------------------------------------------

  /**
   * Poll a single instance's gateway health, store the snapshot, and update
   * the GatewayConnection + BotInstance health status.
   */
  async pollInstanceHealth(instanceId: string): Promise<StoredHealthSnapshot | null> {
    const connection = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    if (!connection) {
      this.logger.warn(`No gateway connection configured for instance ${instanceId}`);
      return null;
    }

    const auth: GatewayAuth = connection.authMode === "token"
      ? { mode: "token", token: connection.authToken ?? "" }
      : { mode: "password", password: connection.authToken ?? "" };

    const options: GatewayConnectionOptions = {
      host: connection.host,
      port: connection.port,
      auth,
      timeoutMs: POLL_TIMEOUT_MS,
      reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 0, maxDelayMs: 0 },
    };

    let client: GatewayClient | null = null;
    try {
      client = new GatewayClient(options);
      const startMs = Date.now();
      await client.connect();
      const snapshot = await client.health();
      const latencyMs = Date.now() - startMs;

      // channels may be an array or an object map from OpenClaw
      const channelsList = Array.isArray(snapshot.channels)
        ? snapshot.channels
        : Object.values(snapshot.channels ?? {});
      const linkedChannels = channelsList.length;
      const degradedChannels = channelsList.filter((ch: Record<string, unknown>) => !ch.ok).length;
      const isHealthy = snapshot.ok && degradedChannels === 0;

      // Persist snapshot
      const record = await prisma.healthSnapshot.create({
        data: {
          instanceId,
          data: JSON.stringify(snapshot),
          isHealthy,
          channelsLinked: linkedChannels,
          channelsDegraded: degradedChannels,
          gatewayLatencyMs: latencyMs,
        },
      });

      // Update gateway connection status
      await prisma.gatewayConnection.update({
        where: { instanceId },
        data: {
          status: "CONNECTED",
          lastHeartbeat: new Date(),
          latencyMs,
          configHash: undefined, // preserve existing
        },
      });

      // Derive BotHealth from snapshot
      // Channel readiness is a config concern, not a machine health concern.
      // Health only reflects whether the gateway process itself is healthy.
      const health = snapshot.ok ? "HEALTHY" : "UNHEALTHY";
      const healthReason = snapshot.ok ? null : "Gateway reported unhealthy";

      await prisma.botInstance.update({
        where: { id: instanceId },
        data: {
          health,
          lastHealthCheckAt: new Date(),
          errorCount: 0,
          lastError: healthReason,
        },
      });

      return {
        id: record.id,
        instanceId: record.instanceId,
        data: snapshot,
        isHealthy,
        channelsLinked: linkedChannels,
        channelsDegraded: degradedChannels,
        gatewayLatencyMs: latencyMs,
        capturedAt: record.capturedAt,
      };
    } catch (err) {
      const message = (err as Error).message ?? "Unknown error";
      this.logger.warn(`Health poll failed for ${instanceId}: ${message}`);

      // Mark as unreachable
      await this.markUnreachable(instanceId, message);
      return null;
    } finally {
      if (client) {
        try {
          await client.disconnect();
        } catch {
          // ignore disconnect errors
        }
      }
    }
  }

  /**
   * Poll all active instances with a concurrency limit.
   */
  async pollAllInstances(): Promise<void> {
    const instances = await prisma.botInstance.findMany({
      where: {
        status: { in: ["RUNNING", "DEGRADED"] },
        gatewayConnection: { isNot: null },
      },
      select: { id: true },
    });

    this.logger.debug(`Polling health for ${instances.length} active instances`);

    // Simple concurrency limiter
    const queue = [...instances];
    const executing = new Set<Promise<void>>();

    while (queue.length > 0 || executing.size > 0) {
      while (queue.length > 0 && executing.size < CONCURRENCY_LIMIT) {
        const inst = queue.shift()!;
        const p = this.pollInstanceHealth(inst.id)
          .then(() => {})
          .catch(() => {})
          .finally(() => executing.delete(p));
        executing.add(p);
      }
      if (executing.size > 0) {
        await Promise.race(executing);
      }
    }
  }

  /**
   * Return the latest stored health snapshot for an instance.
   */
  async getHealth(instanceId: string): Promise<StoredHealthSnapshot | null> {
    const record = await prisma.healthSnapshot.findFirst({
      where: { instanceId },
      orderBy: { capturedAt: "desc" },
    });

    if (!record) return null;

    return {
      id: record.id,
      instanceId: record.instanceId,
      data: JSON.parse(record.data as string) as GatewayHealthSnapshot,
      isHealthy: record.isHealthy,
      channelsLinked: record.channelsLinked,
      channelsDegraded: record.channelsDegraded,
      gatewayLatencyMs: record.gatewayLatencyMs,
      capturedAt: record.capturedAt,
    };
  }

  /**
   * Perform a live deep health check against the instance's gateway.
   * This makes a real-time connection, bypassing cached snapshots.
   */
  async getDeepHealth(instanceId: string): Promise<{
    snapshot: GatewayHealthSnapshot;
    status: GatewayStatusSummaryCompat;
    latencyMs: number;
    reachable: boolean;
  }> {
    const connection = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    if (!connection) {
      return {
        snapshot: { ok: false, channels: [], uptime: 0 },
        status: { state: "unknown", version: "unknown", configHash: "" },
        latencyMs: -1,
        reachable: false,
      };
    }

    const auth: GatewayAuth = connection.authMode === "token"
      ? { mode: "token", token: connection.authToken ?? "" }
      : { mode: "password", password: connection.authToken ?? "" };

    const options: GatewayConnectionOptions = {
      host: connection.host,
      port: connection.port,
      auth,
      timeoutMs: POLL_TIMEOUT_MS,
      reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 0, maxDelayMs: 0 },
    };

    let client: GatewayClient | null = null;
    try {
      client = new GatewayClient(options);
      const startMs = Date.now();
      await client.connect();
      const [snapshot, statusSummary] = await Promise.all([
        client.health(),
        client.status(),
      ]);
      const latencyMs = Date.now() - startMs;

      // Also store a snapshot for history
      await prisma.healthSnapshot.create({
        data: {
          instanceId,
          data: JSON.stringify(snapshot),
          isHealthy: snapshot.ok,
          channelsLinked: (Array.isArray(snapshot.channels) ? snapshot.channels : Object.values(snapshot.channels ?? {})).length,
          channelsDegraded: (Array.isArray(snapshot.channels) ? snapshot.channels : Object.values(snapshot.channels ?? {})).filter((ch: Record<string, unknown>) => !ch.ok).length,
          gatewayLatencyMs: latencyMs,
        },
      });

      return { snapshot, status: statusSummary, latencyMs, reachable: true };
    } catch (err) {
      return {
        snapshot: { ok: false, channels: [], uptime: 0 },
        status: { state: "unreachable", version: "unknown", configHash: "" },
        latencyMs: -1,
        reachable: false,
      };
    } finally {
      if (client) {
        try { await client.disconnect(); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Fetch token usage from the gateway's usage.cost RPC.
   */
  async getUsage(instanceId: string): Promise<CostUsageSummary | null> {
    const connection = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    if (!connection) {
      this.logger.warn(`No gateway connection configured for instance ${instanceId}`);
      return null;
    }

    const auth: GatewayAuth = connection.authMode === "token"
      ? { mode: "token", token: connection.authToken ?? "" }
      : { mode: "password", password: connection.authToken ?? "" };

    const options: GatewayConnectionOptions = {
      host: connection.host,
      port: connection.port,
      auth,
      timeoutMs: POLL_TIMEOUT_MS,
      reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 0, maxDelayMs: 0 },
    };

    let client: GatewayClient | null = null;
    try {
      client = new GatewayClient(options);
      await client.connect();
      return await client.usageCost();
    } catch (err) {
      this.logger.warn(`Usage fetch failed for ${instanceId}: ${(err as Error).message}`);
      return null;
    } finally {
      if (client) {
        try { await client.disconnect(); } catch { /* ignore */ }
      }
    }
  }

  // ---- Internals -----------------------------------------------------------

  private async markUnreachable(instanceId: string, errorMessage: string): Promise<void> {
    // Update gateway connection
    try {
      await prisma.gatewayConnection.update({
        where: { instanceId },
        data: {
          status: "ERROR",
          lastHeartbeat: new Date(),
        },
      });
    } catch {
      // connection record may not exist
    }

    // Update bot instance
    try {
      const updated = await prisma.botInstance.update({
        where: { id: instanceId },
        data: {
          health: "UNHEALTHY",
          lastHealthCheckAt: new Date(),
          lastError: errorMessage,
          errorCount: { increment: 1 },
        },
      });

      // After enough consecutive failures, check if the container still exists
      if (
        updated.errorCount >= CONTAINER_CHECK_THRESHOLD &&
        updated.status === "RUNNING"
      ) {
        await this.verifyContainerExists(updated);
      }
    } catch {
      // instance may have been deleted
    }
  }

  /**
   * Shell out to `docker inspect` to check whether the container is still
   * present. If not, transition the bot from RUNNING → STOPPED.
   */
  private async verifyContainerExists(
    instance: { id: string; name: string; errorCount: number },
  ): Promise<void> {
    const containerName = `openclaw-${instance.name}`;
    try {
      const { execSync } = await import("child_process");
      const output = execSync(
        `docker inspect --format "{{.State.Status}}" ${containerName} 2>/dev/null`,
        { encoding: "utf-8", timeout: 5_000 },
      ).trim();

      if (output === "running") {
        this.logger.debug(
          `Container ${containerName} is running; gateway may be temporarily unreachable`,
        );
        return;
      }

      // Container exists but is not running
      this.logger.warn(
        `Container ${containerName} state is "${output}" — marking instance ${instance.id} as STOPPED`,
      );
      await prisma.botInstance.update({
        where: { id: instance.id },
        data: {
          status: "STOPPED",
          runningSince: null,
          lastError: `Container is ${output}`,
        },
      });
    } catch {
      // docker inspect failed — container doesn't exist
      this.logger.warn(
        `Container ${containerName} not found after ${instance.errorCount} health failures — marking instance ${instance.id} as STOPPED`,
      );
      await prisma.botInstance.update({
        where: { id: instance.id },
        data: {
          status: "STOPPED",
          runningSince: null,
          lastError: "Container no longer running",
        },
      });
    }
  }
}

/**
 * Local type alias so we don't need a separate import for the deep-health
 * return shape — matches GatewayStatusSummary from the protocol.
 */
export interface GatewayStatusSummaryCompat {
  state: string;
  version: string;
  configHash: string;
}
