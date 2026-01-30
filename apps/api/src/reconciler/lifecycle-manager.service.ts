import { Injectable, Logger } from "@nestjs/common";
import {
  prisma,
  BotInstance,
  BotStatus,
  BotHealth,
  GatewayConnectionStatus,
} from "@molthub/database";
import type { MoltbotManifest, MoltbotFullConfig } from "@molthub/core";
import {
  GatewayManager,
  GatewayClient,
} from "@molthub/gateway-client";
import type { GatewayConnectionOptions } from "@molthub/gateway-client";
import {
  DeploymentTargetFactory,
  DeploymentTargetType,
} from "@molthub/cloud-providers";
import type {
  DeploymentTarget,
  DeploymentTargetConfig,
  TargetStatus,
  GatewayEndpoint,
} from "@molthub/cloud-providers";
import { ConfigGeneratorService } from "./config-generator.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ProvisionResult {
  success: boolean;
  message: string;
  gatewayHost?: string;
  gatewayPort?: number;
}

export interface UpdateResult {
  success: boolean;
  message: string;
  method: "apply" | "patch" | "none";
  configHash?: string;
}

export interface StatusResult {
  infraState: string;
  gatewayConnected: boolean;
  gatewayHealth?: { ok: boolean; uptime: number };
  configHash?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * LifecycleManagerService — orchestrates full instance lifecycle operations
 * (provision, update, restart, destroy) across deployment targets and the
 * Moltbot Gateway WebSocket protocol.
 */
@Injectable()
export class LifecycleManagerService {
  private readonly logger = new Logger(LifecycleManagerService.name);
  private readonly gatewayManager = new GatewayManager();

  constructor(private readonly configGenerator: ConfigGeneratorService) {}

  // ------------------------------------------------------------------
  // Provision — full new instance setup
  // ------------------------------------------------------------------

  /**
   * Provision a brand-new Moltbot instance:
   *  1. Resolve deployment target from DB or manifest
   *  2. Install Moltbot via the deployment target
   *  3. Write configuration
   *  4. Start the service
   *  5. Establish gateway WS connection
   *  6. Update DB records (BotInstance, GatewayConnection, MoltbotProfile)
   */
  async provision(
    instance: BotInstance,
    manifest: MoltbotManifest,
  ): Promise<ProvisionResult> {
    this.logger.log(`Provisioning instance ${instance.id} (${instance.name})`);

    try {
      // 1. Resolve deployment target
      const target = await this.resolveTarget(instance);

      // 2. Generate config
      const config = this.configGenerator.generateMoltbotConfig(manifest);
      const configHash = this.configGenerator.generateConfigHash(config);
      const profileName = instance.profileName ?? manifest.metadata.name;
      const gatewayPort = instance.gatewayPort ?? config.gateway?.port ?? 18789;

      // 3. Install
      const installResult = await target.install({
        profileName,
        moltbotVersion: instance.moltbotVersion ?? undefined,
        port: gatewayPort,
      });

      if (!installResult.success) {
        throw new Error(`Install failed: ${installResult.message}`);
      }

      // 4. Configure
      const configureResult = await target.configure({
        profileName,
        gatewayPort,
        config: config as unknown as Record<string, unknown>,
      });

      if (!configureResult.success) {
        throw new Error(`Configure failed: ${configureResult.message}`);
      }

      // 5. Start
      await target.start();

      // 6. Get endpoint and establish WS connection
      const endpoint = await target.getEndpoint();
      const client = await this.connectGateway(instance.id, endpoint);

      // 7. Verify health
      const health = await client.health();

      // 8. Update DB
      await prisma.botInstance.update({
        where: { id: instance.id },
        data: {
          status: BotStatus.RUNNING,
          health: health.ok ? BotHealth.HEALTHY : BotHealth.DEGRADED,
          gatewayPort,
          profileName,
          configHash,
          lastReconcileAt: new Date(),
          lastHealthCheckAt: new Date(),
          lastError: null,
          errorCount: 0,
        },
      });

      // Upsert GatewayConnection record
      await this.upsertGatewayConnection(instance.id, endpoint, configHash);

      // Upsert MoltbotProfile record
      await this.upsertMoltbotProfile(instance.id, profileName, gatewayPort);

      this.logger.log(`Instance ${instance.id} provisioned successfully`);

      return {
        success: true,
        message: `Provisioned and started on ${endpoint.host}:${endpoint.port}`,
        gatewayHost: endpoint.host,
        gatewayPort: endpoint.port,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Provision failed for ${instance.id}: ${message}`);

      await prisma.botInstance.update({
        where: { id: instance.id },
        data: {
          status: BotStatus.ERROR,
          health: BotHealth.UNKNOWN,
          lastError: message,
          errorCount: { increment: 1 },
        },
      });

      return { success: false, message };
    }
  }

  // ------------------------------------------------------------------
  // Update — config change via Gateway WS
  // ------------------------------------------------------------------

  /**
   * Push an updated configuration to a running instance via the Gateway
   * WebSocket protocol.  If the config hash has not changed, this is a no-op.
   */
  async update(
    instance: BotInstance,
    manifest: MoltbotManifest,
  ): Promise<UpdateResult> {
    this.logger.log(`Updating config for instance ${instance.id}`);

    try {
      const config = this.configGenerator.generateMoltbotConfig(manifest);
      const desiredHash = this.configGenerator.generateConfigHash(config);

      // Fast-path: nothing to do if hashes match
      if (instance.configHash === desiredHash) {
        this.logger.debug(`Instance ${instance.id} config already up-to-date`);
        return { success: true, message: "Config already up-to-date", method: "none", configHash: desiredHash };
      }

      // Connect (or reuse) to gateway
      const client = await this.getGatewayClient(instance);

      // Get current remote config + hash
      const remote = await client.configGet();

      if (remote.hash === desiredHash) {
        // DB was stale — update local record and return
        await prisma.botInstance.update({
          where: { id: instance.id },
          data: { configHash: desiredHash },
        });
        return { success: true, message: "Remote config already matches", method: "none", configHash: desiredHash };
      }

      // Full apply with the new config
      const raw = JSON.stringify(config);
      const applyResult = await client.configApply({
        raw,
        baseHash: remote.hash,
      });

      if (!applyResult.success) {
        const errors = applyResult.validationErrors?.join("; ") ?? "Unknown validation error";
        throw new Error(`config.apply rejected: ${errors}`);
      }

      // Persist new hash
      await prisma.botInstance.update({
        where: { id: instance.id },
        data: {
          configHash: desiredHash,
          lastReconcileAt: new Date(),
          lastError: null,
        },
      });

      // Update GatewayConnection hash
      await prisma.gatewayConnection.updateMany({
        where: { instanceId: instance.id },
        data: { configHash: desiredHash },
      });

      this.logger.log(`Instance ${instance.id} config applied (hash=${desiredHash.slice(0, 12)})`);

      return { success: true, message: "Config applied via gateway", method: "apply", configHash: desiredHash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Config update failed for ${instance.id}: ${message}`);

      await prisma.botInstance.update({
        where: { id: instance.id },
        data: { lastError: message, errorCount: { increment: 1 } },
      });

      return { success: false, message, method: "apply" };
    }
  }

  // ------------------------------------------------------------------
  // Restart — full restart via deployment target
  // ------------------------------------------------------------------

  async restart(instance: BotInstance): Promise<void> {
    this.logger.log(`Restarting instance ${instance.id}`);

    const target = await this.resolveTarget(instance);
    await target.restart();

    await prisma.botInstance.update({
      where: { id: instance.id },
      data: {
        status: BotStatus.RUNNING,
        restartCount: { increment: 1 },
        lastReconcileAt: new Date(),
      },
    });
  }

  // ------------------------------------------------------------------
  // Hybrid reload — SIGUSR1 for config-only changes
  // ------------------------------------------------------------------

  /**
   * Trigger a lightweight reload on the Moltbot process.
   * The deployment target sends SIGUSR1, which causes the gateway to
   * re-read its config from disk without a full process restart.
   */
  async hybridReload(instance: BotInstance): Promise<void> {
    this.logger.log(`Hybrid-reloading instance ${instance.id}`);

    try {
      // Attempt to restart via deployment target which may issue SIGUSR1
      const target = await this.resolveTarget(instance);
      await target.restart();

      await prisma.botInstance.update({
        where: { id: instance.id },
        data: { lastReconcileAt: new Date() },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Hybrid reload failed for ${instance.id}, falling back to WS apply: ${message}`);
      // Fallback is handled by the reconciler calling update() after this
    }
  }

  // ------------------------------------------------------------------
  // Destroy — teardown via deployment target
  // ------------------------------------------------------------------

  async destroy(instance: BotInstance): Promise<void> {
    this.logger.log(`Destroying instance ${instance.id}`);

    try {
      // Disconnect gateway client first
      this.gatewayManager.removeClient(instance.id);

      // Tear down via deployment target
      const target = await this.resolveTarget(instance);
      await target.destroy();
    } catch (error) {
      this.logger.warn(`Deployment target teardown error for ${instance.id}: ${error}`);
      // Continue to clean up DB even if target teardown fails
    }

    // Clean up DB records
    await prisma.gatewayConnection.deleteMany({
      where: { instanceId: instance.id },
    });
    await prisma.moltbotProfile.deleteMany({
      where: { instanceId: instance.id },
    });
    await prisma.healthSnapshot.deleteMany({
      where: { instanceId: instance.id },
    });

    await prisma.botInstance.update({
      where: { id: instance.id },
      data: {
        status: BotStatus.DELETING,
        health: BotHealth.UNKNOWN,
      },
    });
  }

  // ------------------------------------------------------------------
  // Status — combined infra + gateway status
  // ------------------------------------------------------------------

  async getStatus(instance: BotInstance): Promise<StatusResult> {
    const result: StatusResult = {
      infraState: "unknown",
      gatewayConnected: false,
    };

    // Infrastructure status
    try {
      const target = await this.resolveTarget(instance);
      const targetStatus = await target.getStatus();
      result.infraState = targetStatus.state;
    } catch {
      result.infraState = "error";
    }

    // Gateway WS status
    try {
      const client = await this.getGatewayClient(instance);
      result.gatewayConnected = true;

      const health = await client.health();
      result.gatewayHealth = { ok: health.ok, uptime: health.uptime };

      const status = await client.status();
      result.configHash = status.configHash;
    } catch {
      result.gatewayConnected = false;
    }

    return result;
  }

  // ------------------------------------------------------------------
  // Internal helpers
  // ------------------------------------------------------------------

  /**
   * Resolve the DeploymentTarget implementation for a given BotInstance.
   * Uses the DeploymentTarget DB record if present, otherwise falls back
   * to a `local` target.
   */
  private async resolveTarget(instance: BotInstance): Promise<DeploymentTarget> {
    if (instance.deploymentTargetId) {
      const dbTarget = await prisma.deploymentTarget.findUnique({
        where: { id: instance.deploymentTargetId },
      });

      if (dbTarget) {
        const targetConfig = this.mapDbTargetToConfig(dbTarget);
        return DeploymentTargetFactory.create(targetConfig);
      }
    }

    // Fallback: derive from deploymentType enum
    const typeStr = instance.deploymentType ?? "LOCAL";
    const instanceMeta = instance.metadata as Record<string, unknown> | null;
    const configMap: Record<string, DeploymentTargetConfig> = {
      LOCAL: { type: "local" },
      DOCKER: {
        type: "docker",
        docker: {
          containerName: `moltbot-${instance.name}`,
          configPath: `/var/moltbot/${instance.name}`,
          gatewayPort: instance.gatewayPort ?? 18789,
        },
      },
      KUBERNETES: {
        type: "kubernetes",
        k8s: {
          namespace: "moltbot",
          deploymentName: `moltbot-${instance.name}`,
          gatewayPort: instance.gatewayPort ?? 18789,
        },
      },
      ECS_FARGATE: {
        type: "ecs-fargate",
        ecs: {
          region: (instanceMeta?.awsRegion as string) ?? "us-east-1",
          accessKeyId: (instanceMeta?.awsAccessKeyId as string) ?? "",
          secretAccessKey: (instanceMeta?.awsSecretAccessKey as string) ?? "",
          subnetIds: (instanceMeta?.subnetIds as string[]) ?? [],
          securityGroupId: (instanceMeta?.securityGroupId as string) ?? "",
          clusterName: `moltbot-${instance.name}`,
        },
      },
    };

    const config = configMap[typeStr] ?? { type: "local" as const };
    return DeploymentTargetFactory.create(config);
  }

  /**
   * Map a Prisma DeploymentTarget row to the typed config union that the
   * factory expects.
   */
  private mapDbTargetToConfig(
    dbTarget: { type: string; config: unknown },
  ): DeploymentTargetConfig {
    const cfg = (dbTarget.config ?? {}) as Record<string, unknown>;

    switch (dbTarget.type) {
      case "LOCAL":
        return { type: "local" };
      case "REMOTE_VM":
        return {
          type: "remote-vm",
          ssh: {
            host: (cfg.host as string) ?? "localhost",
            port: (cfg.sshPort as number) ?? 22,
            username: (cfg.username as string) ?? "moltbot",
            privateKey: cfg.privateKeyRef as string | undefined,
          },
        };
      case "DOCKER":
        return {
          type: "docker",
          docker: {
            containerName: (cfg.containerName as string) ?? "moltbot",
            configPath: (cfg.configPath as string) ?? "/var/moltbot",
            gatewayPort: (cfg.gatewayPort as number) ?? 18789,
            networkName: cfg.networkName as string | undefined,
          },
        };
      case "KUBERNETES":
        return {
          type: "kubernetes",
          k8s: {
            namespace: (cfg.namespace as string) ?? "moltbot",
            deploymentName: (cfg.deploymentName as string) ?? "moltbot",
            gatewayPort: (cfg.gatewayPort as number) ?? 18789,
            kubeContext: cfg.kubeContext as string | undefined,
          },
        };
      case "ECS_FARGATE":
        return {
          type: "ecs-fargate",
          ecs: {
            region: (cfg.region as string) ?? "us-east-1",
            accessKeyId: (cfg.accessKeyId as string) ?? "",
            secretAccessKey: (cfg.secretAccessKey as string) ?? "",
            subnetIds: (cfg.subnetIds as string[]) ?? [],
            securityGroupId: (cfg.securityGroupId as string) ?? "",
            clusterName: (cfg.clusterName as string) ?? "moltbot-cluster",
            executionRoleArn: cfg.executionRoleArn as string | undefined,
            taskRoleArn: cfg.taskRoleArn as string | undefined,
            cpu: cfg.cpu as number | undefined,
            memory: cfg.memory as number | undefined,
            image: cfg.image as string | undefined,
            assignPublicIp: cfg.assignPublicIp as boolean | undefined,
          },
        };
      default:
        return { type: "local" };
    }
  }

  /**
   * Build GatewayConnectionOptions from a BotInstance + optional endpoint
   * override, then obtain a connected client from the GatewayManager pool.
   */
  private async getGatewayClient(instance: BotInstance): Promise<GatewayClient> {
    // Look up stored connection info
    const gwConn = await prisma.gatewayConnection.findUnique({
      where: { instanceId: instance.id },
    });

    const host = gwConn?.host ?? "localhost";
    const port = gwConn?.port ?? instance.gatewayPort ?? 18789;
    const token = gwConn?.authToken ?? undefined;

    const options: GatewayConnectionOptions = {
      host,
      port,
      auth: token ? { mode: "token", token } : { mode: "token", token: "molthub" },
    };

    return this.gatewayManager.getClient(instance.id, options);
  }

  private async connectGateway(
    instanceId: string,
    endpoint: GatewayEndpoint,
  ): Promise<GatewayClient> {
    const options: GatewayConnectionOptions = {
      host: endpoint.host,
      port: endpoint.port,
      auth: { mode: "token", token: "molthub" },
    };

    return this.gatewayManager.getClient(instanceId, options);
  }

  private async upsertGatewayConnection(
    instanceId: string,
    endpoint: GatewayEndpoint,
    configHash: string,
  ): Promise<void> {
    await prisma.gatewayConnection.upsert({
      where: { instanceId },
      create: {
        instanceId,
        host: endpoint.host,
        port: endpoint.port,
        status: GatewayConnectionStatus.CONNECTED,
        configHash,
        lastHeartbeat: new Date(),
      },
      update: {
        host: endpoint.host,
        port: endpoint.port,
        status: GatewayConnectionStatus.CONNECTED,
        configHash,
        lastHeartbeat: new Date(),
      },
    });
  }

  private async upsertMoltbotProfile(
    instanceId: string,
    profileName: string,
    basePort: number,
  ): Promise<void> {
    const configPath = `~/.clawdbot/profiles/${profileName}/moltbot.json`;
    const stateDir = `~/.clawdbot/profiles/${profileName}/state/`;
    const workspace = `~/clawd/${profileName}/`;

    await prisma.moltbotProfile.upsert({
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
