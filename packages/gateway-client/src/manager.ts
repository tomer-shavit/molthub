// ---------------------------------------------------------------------------
// GatewayManager — Fleet pool for managing multiple GatewayClient instances
// ---------------------------------------------------------------------------

import { GatewayClient } from "./client";
import type { GatewayConnectionOptions } from "./protocol";
import type { GatewayInterceptor } from "./interceptors/interface";

export class GatewayManager {
  private readonly clients = new Map<string, GatewayClient>();
  private readonly defaultInterceptors: GatewayInterceptor[];

  constructor(defaultInterceptors?: GatewayInterceptor[]) {
    this.defaultInterceptors = defaultInterceptors ?? [];
  }

  /**
   * Get an existing connected client for the given instance, or create and
   * connect a new one. If a client already exists but is disconnected, it is
   * replaced with a fresh connection.
   */
  async getClient(
    instanceId: string,
    options: GatewayConnectionOptions,
    interceptors?: GatewayInterceptor[],
  ): Promise<GatewayClient> {
    const existing = this.clients.get(instanceId);
    if (existing && existing.isConnected()) {
      return existing;
    }

    // Clean up stale entry if present
    if (existing) {
      try {
        await existing.disconnect();
      } catch {
        // ignore cleanup errors
      }
      this.clients.delete(instanceId);
    }

    const mergedInterceptors = [...this.defaultInterceptors, ...(interceptors ?? [])];
    const client = new GatewayClient(options, mergedInterceptors);
    await client.connect();
    this.clients.set(instanceId, client);

    // Auto-remove on intentional disconnect
    client.on("disconnect", () => {
      // Keep entry around so reconnect logic in the client can re-establish.
      // Only truly remove when removeClient() is called explicitly.
    });

    return client;
  }

  /**
   * Disconnect and remove a specific client from the pool.
   */
  removeClient(instanceId: string): void {
    const client = this.clients.get(instanceId);
    if (client) {
      client.disconnect().catch(() => {
        // fire-and-forget; we are removing anyway
      });
      this.clients.delete(instanceId);
    }
  }

  /**
   * Disconnect all clients and clear the pool.
   */
  async disconnectAll(): Promise<void> {
    const disconnects = Array.from(this.clients.values()).map((c) =>
      c.disconnect().catch(() => {
        // ignore individual disconnect errors
      }),
    );
    await Promise.all(disconnects);
    this.clients.clear();
  }

  /**
   * Return the instance IDs of all currently connected clients.
   */
  getConnectedInstances(): string[] {
    const ids: string[] = [];
    for (const [id, client] of this.clients) {
      if (client.isConnected()) {
        ids.push(id);
      }
    }
    return ids;
  }
}
