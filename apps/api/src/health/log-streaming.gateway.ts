import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayInit,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import { prisma } from "@clawster/database";
import {
  GatewayClient,
} from "@clawster/gateway-client";
import type {
  GatewayConnectionOptions,
  GatewayAuth,
} from "@clawster/gateway-client";

// ---- Types -----------------------------------------------------------------

type LogLevel = "debug" | "info" | "warn" | "error";

interface SubscribeLogsPayload {
  instanceId: string;
  level?: LogLevel; // minimum level to forward — defaults to "info"
}

interface UnsubscribeLogsPayload {
  instanceId: string;
}

/** Internal: tracks a gateway WS listener for a particular instance. */
interface InstanceLogStream {
  client: GatewayClient;
  subscribers: Map<string, LogLevel>; // socketId -> minLevel
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const STREAM_TIMEOUT_MS = 10_000;

// ---- Gateway ---------------------------------------------------------------

@WebSocketGateway({
  namespace: "/logs",
  cors: { origin: "*" },
})
export class LogStreamingGateway implements OnGatewayInit, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(LogStreamingGateway.name);

  /**
   * Active log streams keyed by instanceId. Each stream holds a single
   * GatewayClient connection that may serve multiple browser clients.
   */
  private readonly streams = new Map<string, InstanceLogStream>();

  /**
   * Reverse index: socketId -> set of instanceIds that socket is subscribed to.
   * Used for efficient cleanup on disconnect.
   */
  private readonly socketSubscriptions = new Map<string, Set<string>>();

  // ---- Lifecycle -----------------------------------------------------------

  afterInit(): void {
    this.logger.log("Log streaming WebSocket gateway initialized");
  }

  handleDisconnect(client: Socket): void {
    const subs = this.socketSubscriptions.get(client.id);
    if (!subs) return;

    for (const instanceId of subs) {
      this.removeSubscriber(instanceId, client.id);
    }
    this.socketSubscriptions.delete(client.id);
    this.logger.debug(`Client ${client.id} disconnected — cleaned up subscriptions`);
  }

  // ---- Message handlers ----------------------------------------------------

  @SubscribeMessage("subscribe-logs")
  async handleSubscribeLogs(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeLogsPayload,
  ): Promise<{ success: boolean; message?: string }> {
    const { instanceId, level = "info" } = payload;

    if (!instanceId) {
      return { success: false, message: "instanceId is required" };
    }

    this.logger.debug(
      `Client ${client.id} subscribing to logs for instance ${instanceId} (level>=${level})`,
    );

    // Track socket subscriptions
    let subs = this.socketSubscriptions.get(client.id);
    if (!subs) {
      subs = new Set();
      this.socketSubscriptions.set(client.id, subs);
    }
    subs.add(instanceId);

    // Ensure we have a stream for this instance
    let stream = this.streams.get(instanceId);
    if (!stream) {
      try {
        stream = await this.createStream(instanceId);
      } catch (err) {
        const msg = (err as Error).message;
        this.logger.warn(`Failed to create log stream for ${instanceId}: ${msg}`);
        return { success: false, message: `Failed to connect: ${msg}` };
      }
    }

    stream.subscribers.set(client.id, level);

    // Join the socket.io room for this instance
    client.join(`logs:${instanceId}`);

    return { success: true };
  }

  @SubscribeMessage("unsubscribe-logs")
  handleUnsubscribeLogs(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: UnsubscribeLogsPayload,
  ): { success: boolean } {
    const { instanceId } = payload;
    client.leave(`logs:${instanceId}`);
    this.removeSubscriber(instanceId, client.id);

    const subs = this.socketSubscriptions.get(client.id);
    if (subs) subs.delete(instanceId);

    return { success: true };
  }

  @SubscribeMessage("update-log-level")
  handleUpdateLevel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribeLogsPayload,
  ): { success: boolean } {
    const { instanceId, level = "info" } = payload;
    const stream = this.streams.get(instanceId);
    if (stream && stream.subscribers.has(client.id)) {
      stream.subscribers.set(client.id, level);
    }
    return { success: true };
  }

  // ---- Internals -----------------------------------------------------------

  private async createStream(instanceId: string): Promise<InstanceLogStream> {
    const connection = await prisma.gatewayConnection.findUnique({
      where: { instanceId },
    });

    if (!connection) {
      throw new Error("No gateway connection configured for this instance");
    }

    const auth: GatewayAuth = connection.authMode === "token"
      ? { mode: "token", token: connection.authToken ?? "" }
      : { mode: "password", password: connection.authToken ?? "" };

    const options: GatewayConnectionOptions = {
      host: connection.host,
      port: connection.port,
      auth,
      timeoutMs: STREAM_TIMEOUT_MS,
      reconnect: { enabled: true, maxAttempts: 5, baseDelayMs: 2_000, maxDelayMs: 30_000 },
    };

    const client = new GatewayClient(options);
    await client.connect();

    const stream: InstanceLogStream = {
      client,
      subscribers: new Map(),
    };

    // Listen for agentOutput events (proxy as log entries)
    client.on("agentOutput", (event: { requestId: string; seq: number; chunk: string }) => {
      this.broadcastLog(instanceId, {
        level: "info",
        message: event.chunk,
        timestamp: new Date().toISOString(),
        source: "agent",
        requestId: event.requestId,
        seq: event.seq,
      });
    });

    // Listen for presence changes as informational logs
    client.on("presence", (event: unknown) => {
      this.broadcastLog(instanceId, {
        level: "info",
        message: "Presence change detected",
        timestamp: new Date().toISOString(),
        source: "presence",
        data: event,
      });
    });

    // Listen for shutdown events as critical logs
    client.on("shutdown", (event: { reason: string; gracePeriodMs: number }) => {
      this.broadcastLog(instanceId, {
        level: "error",
        message: `Gateway shutting down: ${event.reason}`,
        timestamp: new Date().toISOString(),
        source: "gateway",
        gracePeriodMs: event.gracePeriodMs,
      });
    });

    // Listen for keepalive as debug logs
    client.on("keepalive", () => {
      this.broadcastLog(instanceId, {
        level: "debug",
        message: "Gateway keepalive received",
        timestamp: new Date().toISOString(),
        source: "gateway",
      });
    });

    // Handle disconnect — clean up the stream
    client.on("disconnect", () => {
      this.logger.warn(`Gateway disconnected for instance ${instanceId}`);
      this.broadcastLog(instanceId, {
        level: "warn",
        message: "Gateway connection lost",
        timestamp: new Date().toISOString(),
        source: "system",
      });
    });

    client.on("error", (err: Error) => {
      this.broadcastLog(instanceId, {
        level: "error",
        message: `Gateway error: ${err.message}`,
        timestamp: new Date().toISOString(),
        source: "system",
      });
    });

    this.streams.set(instanceId, stream);
    return stream;
  }

  /**
   * Broadcast a log entry to all subscribers of an instance, respecting
   * each subscriber's minimum log level filter.
   */
  private broadcastLog(
    instanceId: string,
    logEntry: { level: LogLevel; message: string; [key: string]: unknown },
  ): void {
    const stream = this.streams.get(instanceId);
    if (!stream) return;

    const entryLevel = LOG_LEVEL_ORDER[logEntry.level] ?? 1;

    // Send to each subscriber that has a sufficient level
    for (const [socketId, minLevel] of stream.subscribers) {
      const minLevelOrder = LOG_LEVEL_ORDER[minLevel] ?? 1;
      if (entryLevel >= minLevelOrder) {
        this.server.to(socketId).emit("log", {
          instanceId,
          ...logEntry,
        });
      }
    }
  }

  /**
   * Remove a subscriber. If no more subscribers remain for an instance,
   * disconnect and clean up the stream.
   */
  private removeSubscriber(instanceId: string, socketId: string): void {
    const stream = this.streams.get(instanceId);
    if (!stream) return;

    stream.subscribers.delete(socketId);

    if (stream.subscribers.size === 0) {
      this.logger.debug(
        `No more subscribers for instance ${instanceId} — closing gateway stream`,
      );
      stream.client.disconnect().catch(() => {});
      this.streams.delete(instanceId);
    }
  }
}
