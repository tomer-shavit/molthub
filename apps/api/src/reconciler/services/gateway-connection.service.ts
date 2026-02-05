import { Injectable, Inject, Logger } from "@nestjs/common";
import {
  BotInstance,
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
  PRISMA_CLIENT,
} from "@clawster/database";
import type { PrismaClient } from "@clawster/database";
import type { GatewayConnectionOptions, IGatewayManager, IGatewayClient } from "@clawster/gateway-client";
import type { GatewayEndpoint } from "@clawster/cloud-providers";
import { GATEWAY_MANAGER } from "../interfaces/tokens";
import type { IGatewayConnectionService } from "../interfaces/gateway-connection.interface";

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * GatewayConnectionService — manages gateway WebSocket connections.
 *
 * Single Responsibility: Build gateway connection options, obtain connected
 * clients from the pool, and persist connection/profile records.
 *
 * Extracted from LifecycleManagerService (and DriftDetectionService) to follow SRP
 * and eliminate code duplication.
 */
@Injectable()
export class GatewayConnectionService implements IGatewayConnectionService {
  private readonly logger = new Logger(GatewayConnectionService.name);

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(GATEWAY_MANAGER) private readonly gatewayManager: IGatewayManager,
  ) {}

  /**
   * Build GatewayConnectionOptions from a BotInstance and obtain a connected
   * client from the GatewayManager pool.
   */
  async getGatewayClient(instance: BotInstance, timeoutMs?: number): Promise<IGatewayClient> {
    // Look up stored connection info
    const gwConn = await this.botInstanceRepo.getGatewayConnection(instance.id);

    const host = gwConn?.host ?? "localhost";
    const port = gwConn?.port ?? instance.gatewayPort ?? 18789;
    const token = gwConn?.authToken ?? undefined;

    const options: GatewayConnectionOptions = {
      host,
      port,
      auth: token ? { mode: "token", token } : { mode: "token", token: "clawster" },
      ...(timeoutMs ? { timeoutMs } : {}),
    };

    return this.gatewayManager.getClient(instance.id, options);
  }

  /**
   * Connect to a gateway endpoint with retry logic.
   * Uses exponential backoff with a maximum of 30 attempts.
   */
  async connectGateway(
    instanceId: string,
    endpoint: GatewayEndpoint,
    authToken?: string,
  ): Promise<IGatewayClient> {
    const options: GatewayConnectionOptions = {
      host: endpoint.host,
      port: endpoint.port,
      auth: { mode: "token", token: authToken ?? "" },
    };

    const maxAttempts = 30;
    const baseDelayMs = 5_000;
    const maxDelayMs = 15_000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const client = await this.gatewayManager.getClient(instanceId, options);
        return client;
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        if (attempt === maxAttempts) {
          this.logger.error(
            `Gateway connection failed for ${instanceId} after ${maxAttempts} attempts: ${errMsg}`,
          );
          throw error;
        }
        const delay = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs);
        this.logger.debug(
          `Gateway connection attempt ${attempt}/${maxAttempts} failed for ${instanceId}, retrying in ${delay}ms`,
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Unreachable, but satisfies TypeScript
    throw new Error("Gateway connection failed");
  }

  /**
   * Persist or update a GatewayConnection record in the database.
   */
  async upsertGatewayConnection(
    instanceId: string,
    endpoint: GatewayEndpoint,
    configHash: string,
    authToken?: string,
  ): Promise<void> {
    await this.botInstanceRepo.upsertGatewayConnection(instanceId, {
      host: endpoint.host,
      port: endpoint.port,
      status: "CONNECTED",
      configHash,
      lastHeartbeat: new Date(),
      ...(authToken ? { authToken } : {}),
    });
  }

  /**
   * Persist or update an OpenClawProfile record in the database.
   */
  async upsertOpenClawProfile(
    instanceId: string,
    profileName: string,
    basePort: number,
  ): Promise<void> {
    const configPath = `~/.openclaw/profiles/${profileName}/openclaw.json`;
    const stateDir = `~/.openclaw/profiles/${profileName}/state/`;
    const workspace = `~/openclaw/${profileName}/`;

    await this.prisma.openClawProfile.upsert({
      where: { instanceId },
      create: {
        instanceId,
        profileName,
        configPath,
        stateDir,
        workspace,
        basePort,
      },
      update: {
        profileName,
        configPath,
        stateDir,
        workspace,
        basePort,
      },
    });
  }
}
