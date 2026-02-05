import { Injectable, Inject, Logger } from "@nestjs/common";
import {
  BotInstance,
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
  PRISMA_CLIENT,
} from "@clawster/database";
import type { PrismaClient } from "@clawster/database";
import type { OpenClawManifest } from "@clawster/core";
import type { IGatewayManager } from "@clawster/gateway-client";
import { ConfigGeneratorService } from "./config-generator.service";
import { ProvisioningEventsService } from "../provisioning/provisioning-events.service";
import {
  GATEWAY_MANAGER,
  DEPLOYMENT_TARGET_RESOLVER,
  GATEWAY_CONNECTION_SERVICE,
  type IDeploymentTargetResolver,
  type IGatewayConnectionService,
} from "./interfaces";

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
 * OpenClaw Gateway WebSocket protocol.
 */
@Injectable()
export class LifecycleManagerService {
  private readonly logger = new Logger(LifecycleManagerService.name);

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(GATEWAY_MANAGER) private readonly gatewayManager: IGatewayManager,
    @Inject(DEPLOYMENT_TARGET_RESOLVER) private readonly deploymentTargetResolver: IDeploymentTargetResolver,
    @Inject(GATEWAY_CONNECTION_SERVICE) private readonly gatewayConnection: IGatewayConnectionService,
    private readonly configGenerator: ConfigGeneratorService,
    private readonly provisioningEvents: ProvisioningEventsService,
  ) {}

  // ------------------------------------------------------------------
  // Provision — full new instance setup
  // ------------------------------------------------------------------

  /**
   * Provision a brand-new OpenClaw instance:
   *  1. Resolve deployment target from DB or manifest
   *  2. Install OpenClaw via the deployment target
   *  3. Write configuration
   *  4. Start the service
   *  5. Establish gateway WS connection
   *  6. Update DB records (BotInstance, GatewayConnection, OpenClawProfile)
   */
  async provision(
    instance: BotInstance,
    manifest: OpenClawManifest,
  ): Promise<ProvisionResult> {
    this.logger.log(`Provisioning instance ${instance.id} (${instance.name})`);

    const deploymentType = this.deploymentTargetResolver.resolveDeploymentType(instance);
    this.provisioningEvents.startProvisioning(instance.id, deploymentType);

    // Track the current step for log attribution
    let currentStepId = "validate_config";

    try {
      this.provisioningEvents.updateStep(instance.id, "validate_config", "in_progress");
      const target = await this.deploymentTargetResolver.resolveTarget(instance);

      // Wire streaming log callback if the target supports it
      if (target.setLogCallback) {
        target.setLogCallback((line, stream) => {
          this.provisioningEvents.emitLog(instance.id, currentStepId, stream, line);
        });
      }

      // 2. Generate config
      const config = this.configGenerator.generateOpenClawConfig(manifest);
      const configHash = this.configGenerator.generateConfigHash(config);
      const profileName = instance.profileName ?? manifest.metadata.name;
      const gatewayPort = instance.gatewayPort ?? config.gateway?.port ?? 18789;
      this.provisioningEvents.updateStep(instance.id, "validate_config", "completed");
      currentStepId = "security_audit";
      this.provisioningEvents.updateStep(instance.id, "security_audit", "in_progress");
      this.provisioningEvents.updateStep(instance.id, "security_audit", "completed");
      // Extract container environment variables and auth token from instance metadata
      const instanceMeta = (typeof instance.metadata === "string" ? JSON.parse(instance.metadata) : instance.metadata) as Record<string, unknown> | null;
      const containerEnv = (instanceMeta?.containerEnv as Record<string, string>) || undefined;
      const gatewayAuthToken = (instanceMeta?.gatewayAuthToken as string) ?? undefined;

      const installStepId = this.deploymentTargetResolver.getInstallStepId(deploymentType);
      currentStepId = installStepId;
      this.provisioningEvents.updateStep(instance.id, installStepId, "in_progress");
      const installResult = await target.install({
        profileName,
        openclawVersion: instance.openclawVersion ?? undefined,
        port: gatewayPort,
        gatewayAuthToken,
        containerEnv,
      });

      if (!installResult.success) {
        this.provisioningEvents.updateStep(instance.id, installStepId, "error", installResult.message);
        throw new Error(`Install failed: ${installResult.message}`);
      }
      this.provisioningEvents.updateStep(instance.id, installStepId, "completed");
      currentStepId = "create_container";
      this.provisioningEvents.updateStep(instance.id, "create_container", "in_progress");
      this.provisioningEvents.updateStep(instance.id, "create_container", "completed");
      currentStepId = "write_config";
      this.provisioningEvents.updateStep(instance.id, "write_config", "in_progress");

      const configureResult = await target.configure({
        profileName,
        gatewayPort,
        config: config as unknown as Record<string, unknown>,
        environment: containerEnv,
      });

      if (!configureResult.success) {
        this.provisioningEvents.updateStep(instance.id, "write_config", "error", configureResult.message);
        throw new Error(`Configure failed: ${configureResult.message}`);
      }
      this.provisioningEvents.updateStep(instance.id, "write_config", "completed");
      const startStepId = this.deploymentTargetResolver.getStartStepId(deploymentType);
      currentStepId = startStepId;
      this.provisioningEvents.updateStep(instance.id, startStepId, "in_progress");
      await target.start();
      this.provisioningEvents.updateStep(instance.id, startStepId, "completed");

      // 6.
      currentStepId = "wait_for_gateway";
      this.provisioningEvents.updateStep(instance.id, "wait_for_gateway", "in_progress");
      const endpoint = await target.getEndpoint();
      const authToken = config.gateway?.auth?.token;
      const client = await this.gatewayConnection.connectGateway(instance.id, endpoint, authToken);
      this.provisioningEvents.updateStep(instance.id, "wait_for_gateway", "completed");

      currentStepId = "health_check";
      this.provisioningEvents.updateStep(instance.id, "health_check", "in_progress");
      const health = await client.health();
      this.provisioningEvents.updateStep(instance.id, "health_check", "completed");

      // 8. Update DB
      await this.botInstanceRepo.update(instance.id, {
        status: "RUNNING",
        runningSince: new Date(),
        health: health.ok ? "HEALTHY" : "DEGRADED",
        gatewayPort,
        profileName,
        configHash,
        lastReconcileAt: new Date(),
        lastHealthCheckAt: new Date(),
        lastError: null,
        errorCount: 0,
      });

      // Upsert GatewayConnection record (persist auth token for health poller)
      await this.gatewayConnection.upsertGatewayConnection(instance.id, endpoint, configHash, authToken);

      // Upsert OpenClawProfile record
      await this.gatewayConnection.upsertOpenClawProfile(instance.id, profileName, gatewayPort);
      this.provisioningEvents.completeProvisioning(instance.id);

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
      this.provisioningEvents.failProvisioning(instance.id, message);

      await this.botInstanceRepo.update(instance.id, {
        status: "ERROR",
        runningSince: null,
        health: "UNKNOWN",
        lastError: message,
        errorCount: { increment: 1 },
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
    manifest: OpenClawManifest,
  ): Promise<UpdateResult> {
    this.logger.log(`Updating config for instance ${instance.id}`);

    try {
      const config = this.configGenerator.generateOpenClawConfig(manifest);
      const desiredHash = this.configGenerator.generateConfigHash(config);

      // Fast-path: nothing to do if hashes match
      if (instance.configHash === desiredHash) {
        this.logger.debug(`Instance ${instance.id} config already up-to-date`);
        return { success: true, message: "Config already up-to-date", method: "none", configHash: desiredHash };
      }

      // Connect (or reuse) to gateway
      const client = await this.gatewayConnection.getGatewayClient(instance);

      // Get current remote config + hash
      const remote = await client.configGet();

      if (remote.hash === desiredHash) {
        // DB was stale — update local record and return
        await this.botInstanceRepo.update(instance.id, {
          configHash: desiredHash,
        });
        return { success: true, message: "Remote config already matches", method: "none", configHash: desiredHash };
      }

      // Full apply with the new config
      const raw = JSON.stringify(config);
      this.logger.debug(`config.apply sending ${raw.length} bytes (baseHash=${remote.hash?.slice(0, 12)})`);
      const applyResult = await client.configApply({
        raw,
        baseHash: remote.hash,
      });
      this.logger.debug(`config.apply response: ${JSON.stringify(applyResult)}`);

      // The gateway returns { ok: true } on success, not { success: true }
      const applied = applyResult.ok ?? applyResult.success;
      if (!applied) {
        const errors = applyResult.validationErrors?.join("; ") ?? "Unknown validation error";
        throw new Error(`config.apply rejected: ${errors}`);
      }

      // Persist config to the deployment target's backing store (e.g., Secrets
      // Manager for ECS, disk for Docker) so config survives restarts.
      try {
        const target = await this.deploymentTargetResolver.resolveTarget(instance);
        const profileName = instance.profileName ?? manifest.metadata.name;
        const gatewayPort = instance.gatewayPort ?? (config as Record<string, unknown> & { gateway?: { port?: number } }).gateway?.port ?? 18789;
        await target.configure({
          profileName,
          gatewayPort,
          config: config as unknown as Record<string, unknown>,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Failed to persist config to deployment target for ${instance.id}: ${msg}`);
        // Non-fatal: the gateway already has the new config in memory
      }

      // Persist new hash
      await this.botInstanceRepo.update(instance.id, {
        configHash: desiredHash,
        lastReconcileAt: new Date(),
        lastError: null,
      });

      // Update GatewayConnection hash
      await this.botInstanceRepo.upsertGatewayConnection(instance.id, {
        configHash: desiredHash,
      });

      this.logger.log(`Instance ${instance.id} config applied (hash=${desiredHash.slice(0, 12)})`);

      return { success: true, message: "Config applied via gateway", method: "apply", configHash: desiredHash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Config update failed for ${instance.id}: ${message}`);

      await this.botInstanceRepo.update(instance.id, {
        lastError: message,
        errorCount: { increment: 1 },
      });

      return { success: false, message, method: "apply" };
    }
  }

  // ------------------------------------------------------------------
  // Restart — full restart via deployment target
  // ------------------------------------------------------------------

  async restart(instance: BotInstance): Promise<void> {
    this.logger.log(`Restarting instance ${instance.id}`);

    const target = await this.deploymentTargetResolver.resolveTarget(instance);
    await target.restart();

    await this.botInstanceRepo.update(instance.id, {
      status: "RUNNING",
      runningSince: new Date(),
      restartCount: { increment: 1 },
      lastReconcileAt: new Date(),
    });
  }

  // ------------------------------------------------------------------
  // Hybrid reload — SIGUSR1 for config-only changes
  // ------------------------------------------------------------------

  /**
   * Trigger a lightweight reload on the OpenClaw process.
   * The deployment target sends SIGUSR1, which causes the gateway to
   * re-read its config from disk without a full process restart.
   */
  async hybridReload(instance: BotInstance): Promise<void> {
    this.logger.log(`Hybrid-reloading instance ${instance.id}`);

    try {
      // Attempt to restart via deployment target which may issue SIGUSR1
      const target = await this.deploymentTargetResolver.resolveTarget(instance);
      await target.restart();

      await this.botInstanceRepo.update(instance.id, {
        lastReconcileAt: new Date(),
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
      const target = await this.deploymentTargetResolver.resolveTarget(instance);

      // Wire streaming log callback if the target supports it
      if (target.setLogCallback) {
        target.setLogCallback((line, stream) => {
          // Use a generic "destroy" step for log attribution
          this.provisioningEvents.emitLog(instance.id, "destroy", stream, line);
        });
      }

      await target.destroy();
    } catch (error) {
      this.logger.warn(`Deployment target teardown error for ${instance.id}: ${error}`);
      // Continue to clean up DB even if target teardown fails
    }

    // Clean up DB records
    await this.botInstanceRepo.deleteGatewayConnection(instance.id);
    await this.prisma.openClawProfile.deleteMany({
      where: { instanceId: instance.id },
    });
    await this.prisma.healthSnapshot.deleteMany({
      where: { instanceId: instance.id },
    });

    await this.botInstanceRepo.update(instance.id, {
      status: "DELETING",
      runningSince: null,
      health: "UNKNOWN",
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
      const target = await this.deploymentTargetResolver.resolveTarget(instance);
      const targetStatus = await target.getStatus();
      result.infraState = targetStatus.state;
    } catch {
      result.infraState = "error";
    }

    // Gateway WS status
    try {
      const client = await this.gatewayConnection.getGatewayClient(instance);
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
  // Resource updates — CPU, memory, disk size changes
  // ------------------------------------------------------------------

  /**
   * Update resource allocation for a running instance.
   * Delegates to the deployment target's updateResources() method.
   */
  async updateResources(
    instance: BotInstance,
    spec: { cpu: number; memory: number; dataDiskSizeGb?: number },
  ): Promise<{ success: boolean; message: string; requiresRestart: boolean }> {
    this.logger.log(`Updating resources for instance ${instance.id}: cpu=${spec.cpu}, memory=${spec.memory}, disk=${spec.dataDiskSizeGb ?? "unchanged"}`);

    const deploymentType = this.deploymentTargetResolver.resolveDeploymentType(instance);

    // Start resource update tracking with step progress
    this.provisioningEvents.startResourceUpdate(instance.id, deploymentType);

    // Track current step for log attribution
    let currentStepId = "validate_resources";

    try {
      this.provisioningEvents.updateStep(instance.id, "validate_resources", "in_progress");
      const target = await this.deploymentTargetResolver.resolveTarget(instance);

      // Check if the target supports resource updates
      if (!target.updateResources) {
        this.provisioningEvents.updateStep(instance.id, "validate_resources", "error", `Deployment type "${instance.deploymentType}" does not support resource updates`);
        this.provisioningEvents.failProvisioning(instance.id, `Deployment target type "${instance.deploymentType}" does not support resource updates`);
        return {
          success: false,
          message: `Deployment target type "${instance.deploymentType}" does not support resource updates`,
          requiresRestart: false,
        };
      }

      // Wire streaming log callback if the target supports it
      if (target.setLogCallback) {
        target.setLogCallback((line, stream) => {
          this.provisioningEvents.emitLog(instance.id, currentStepId, stream, line);
        });
      }

      this.provisioningEvents.updateStep(instance.id, "validate_resources", "completed");

      // Step 2: Apply resource changes (universal step - logs show detailed provider progress)
      currentStepId = "apply_changes";
      this.provisioningEvents.updateStep(instance.id, "apply_changes", "in_progress");

      const result = await target.updateResources(spec);

      if (result.success) {
        this.provisioningEvents.updateStep(instance.id, "apply_changes", "completed");

        // Step 3: Verify completion
        currentStepId = "verify_completion";
        this.provisioningEvents.updateStep(instance.id, "verify_completion", "in_progress");
        this.provisioningEvents.updateStep(instance.id, "verify_completion", "completed");

        // Mark provisioning complete
        this.provisioningEvents.completeProvisioning(instance.id);
        this.logger.log(
          `Resource update completed for ${instance.id}: ${result.message}` +
            (result.requiresRestart ? ` (restart required, ~${result.estimatedDowntime}s downtime)` : "")
        );
      } else {
        this.provisioningEvents.updateStep(instance.id, "apply_changes", "error", result.message);
        this.provisioningEvents.failProvisioning(instance.id, result.message);
        this.logger.error(`Resource update failed for ${instance.id}: ${result.message}`);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.provisioningEvents.failProvisioning(instance.id, message);
      this.logger.error(`Resource update failed for ${instance.id}: ${message}`);
      return {
        success: false,
        message,
        requiresRestart: false,
      };
    }
  }
}
