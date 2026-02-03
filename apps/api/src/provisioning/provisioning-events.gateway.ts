import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";
import type {
  ProvisioningProgress,
  ProvisioningLogEntry,
} from "./provisioning-events.service";

interface SubscribePayload {
  instanceId: string;
}

@WebSocketGateway({
  namespace: "/provisioning",
  cors: {
    origin: process.env.FRONTEND_URL || "http://localhost:3000",
    credentials: true,
  },
})
export class ProvisioningEventsGateway
  implements OnGatewayInit, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ProvisioningEventsGateway.name);
  private readonly socketSubscriptions = new Map<string, Set<string>>();
  private recentLogsProvider:
    | ((instanceId: string) => ProvisioningLogEntry[])
    | null = null;

  afterInit(): void {
    this.logger.log("Provisioning WebSocket gateway initialized");
  }

  setRecentLogsProvider(
    fn: (instanceId: string) => ProvisioningLogEntry[],
  ): void {
    this.recentLogsProvider = fn;
  }

  handleDisconnect(client: Socket): void {
    const subs = this.socketSubscriptions.get(client.id);
    if (subs) {
      for (const instanceId of subs) {
        client.leave(`provisioning:${instanceId}`);
      }
    }
    this.socketSubscriptions.delete(client.id);
    this.logger.debug(`Client ${client.id} disconnected`);
  }

  @SubscribeMessage("subscribe")
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ): { success: boolean; message?: string } {
    const { instanceId } = payload;
    if (!instanceId) {
      return { success: false, message: "instanceId is required" };
    }

    this.logger.debug(
      `Client ${client.id} subscribing to provisioning events for ${instanceId}`,
    );

    let subs = this.socketSubscriptions.get(client.id);
    if (!subs) {
      subs = new Set();
      this.socketSubscriptions.set(client.id, subs);
    }
    subs.add(instanceId);
    client.join(`provisioning:${instanceId}`);

    const recentLogs = this.recentLogsProvider?.(instanceId) ?? [];
    if (recentLogs.length > 0) {
      client.emit("provisioning-logs-buffer", recentLogs);
    }

    return { success: true };
  }

  @SubscribeMessage("unsubscribe")
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: SubscribePayload,
  ): { success: boolean } {
    const { instanceId } = payload;
    client.leave(`provisioning:${instanceId}`);
    const subs = this.socketSubscriptions.get(client.id);
    if (subs) {
      subs.delete(instanceId);
    }
    return { success: true };
  }

  emitProgress(instanceId: string, progress: ProvisioningProgress): void {
    this.server
      .to(`provisioning:${instanceId}`)
      .emit("progress", progress);
  }

  emitLog(instanceId: string, entry: ProvisioningLogEntry): void {
    this.server
      .to(`provisioning:${instanceId}`)
      .emit("provisioning-log", entry);
  }
}
