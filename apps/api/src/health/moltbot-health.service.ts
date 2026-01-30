import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  Prisma,
  prisma,
  BotHealth,
  BotStatus,
  GatewayConnectionStatus,
} from "@molthub/database";
import {
  GatewayClient,
  GatewayConnectionError,
  GatewayTimeoutError,
} from "@molthub/gateway-client";
import type {
  GatewayHealthSnapshot,
  GatewayConnectionOptions,
  GatewayAuth,
} from "@molthub/gateway-client";

/** Maximum concurrent health polls. */
const CONCURRENCY_LIMIT = 10;

/** Timeout for a single health poll (ms). */
const POLL_TIMEOUT_MS = 10_000;

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
export class MoltbotHealthService {
  private readonly logger = new Logger(MoltbotHealthService.name);

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

      const linkedChannels = snapshot.channels.length;
      const degradedChannels = snapshot.channels.filter((ch) => !ch.ok).length;
      const isHealthy = snapshot.ok && degradedChannels === 0;

      // Persist snapshot
      const record = await prisma.healthSnapshot.create({
        data: {
          instanceId,
          data: snapshot as unknown as Prisma.InputJsonValue,
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
          status: GatewayConnectionStatus.CONNECTED,
          lastHeartbeat: new Date(),
          latencyMs,
          configHash: undefined, // preserve existing
        },
      });

      // Derive BotHealth from snapshot
      let health: BotHealth;
      if (!snapshot.ok) {
        health = BotHealth.UNHEALTHY;
      } else if (degradedChannels > 0) {
        health = BotHealth.DEGRADED;
      } else {
        health = BotHealth.HEALTHY;
      }

      await prisma.botInstance.update({
        where: { id: instanceId },
        data: {
          health,
          lastHealthCheckAt: new Date(),
          errorCount: 0,
          lastError: null,
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
        status: { in: [BotStatus.RUNNING, BotStatus.DEGRADED] },
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
      data: record.data as unknown as GatewayHealthSnapshot,
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
          data: snapshot as unknown as Prisma.InputJsonValue,
          isHealthy: snapshot.ok,
          channelsLinked: snapshot.channels.length,
          channelsDegraded: snapshot.channels.filter((ch) => !ch.ok).length,
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

  // ---- Internals -----------------------------------------------------------

  private async markUnreachable(instanceId: string, errorMessage: string): Promise<void> {
    // Update gateway connection
    try {
      await prisma.gatewayConnection.update({
        where: { instanceId },
        data: {
          status: GatewayConnectionStatus.ERROR,
          lastHeartbeat: new Date(),
        },
      });
    } catch {
      // connection record may not exist
    }

    // Update bot instance
    try {
      await prisma.botInstance.update({
        where: { id: instanceId },
        data: {
          health: BotHealth.UNHEALTHY,
          lastHealthCheckAt: new Date(),
          lastError: errorMessage,
          errorCount: { increment: 1 },
        },
      });
    } catch {
      // instance may have been deleted
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
