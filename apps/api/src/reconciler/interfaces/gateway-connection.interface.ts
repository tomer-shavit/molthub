import type { BotInstance } from "@clawster/database";
import type { IGatewayClient } from "@clawster/gateway-client";
import type { GatewayEndpoint } from "@clawster/cloud-providers";

/**
 * IGatewayConnectionService — manages gateway WebSocket connections.
 *
 * Single Responsibility: Build gateway connection options, obtain connected
 * clients from the pool, and persist connection/profile records.
 */
export interface IGatewayConnectionService {
  /**
   * Build GatewayConnectionOptions from a BotInstance and obtain a connected
   * client from the GatewayManager pool.
   *
   * @param instance - The bot instance
   * @param timeoutMs - Optional timeout in milliseconds for the connection
   */
  getGatewayClient(instance: BotInstance, timeoutMs?: number): Promise<IGatewayClient>;

  /**
   * Connect to a gateway endpoint with retry logic.
   *
   * @param instanceId - The bot instance ID
   * @param endpoint - The gateway endpoint (host/port)
   * @param authToken - Optional auth token for the gateway
   * @returns A connected gateway client
   */
  connectGateway(
    instanceId: string,
    endpoint: GatewayEndpoint,
    authToken?: string,
  ): Promise<IGatewayClient>;

  /**
   * Persist or update a GatewayConnection record in the database.
   */
  upsertGatewayConnection(
    instanceId: string,
    endpoint: GatewayEndpoint,
    configHash: string,
    authToken?: string,
  ): Promise<void>;

  /**
   * Persist or update an OpenClawProfile record in the database.
   */
  upsertOpenClawProfile(
    instanceId: string,
    profileName: string,
    basePort: number,
  ): Promise<void>;
}

/**
 * Injection token for IGatewayConnectionService.
 */
export const GATEWAY_CONNECTION_SERVICE = Symbol("GATEWAY_CONNECTION_SERVICE");
