import { Injectable, Inject, Logger } from "@nestjs/common";
import {
  BotInstance,
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
  PRISMA_CLIENT,
} from "@clawster/database";
import type { PrismaClient } from "@clawster/database";
import type { OpenClawManifest } from "@clawster/core";
import { ConfigGeneratorService } from "./config-generator.service";
import { LifecycleManagerService } from "./lifecycle-manager.service";
import { DriftDetectionService } from "./drift-detection.service";
import { DelegationSkillWriterService } from "./delegation-skill-writer.service";
import { OpenClawSecurityAuditService } from "../security/security-audit.service";
import { ManifestParserService, DoctorService, EventLoggerService } from "./services";
import { PreprocessorChainService } from "./preprocessors";
import type { DoctorResult } from "./services";
import type { DriftCheckResult } from "./drift-detection.service";

// Re-export for backward compatibility with the controller
export { DriftCheckResult };

// Re-export DoctorResult from the new service
export type { DoctorResult, DoctorCheck } from "./services";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconcileResult {
  success: boolean;
  message: string;
  changes: string[];
  durationMs: number;
}

export interface UpdateOpenClawResult {
  success: boolean;
  message: string;
  previousVersion?: string;
  newVersion?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * ReconcilerService (v2) — OpenClaw-aware lifecycle reconciler.
 *
 * Reconciliation flow:
 *  1. Load BotInstance + desired manifest (v2 OpenClawManifest)
 *  2. Validate manifest against schema
 *  3. Generate openclaw.json config + hash
 *  4. Determine deployment target type
 *  5. **New instance**: provision via DeploymentTarget -> write config -> start gateway
 *  6. **Existing instance**: config.get via Gateway WS -> compare hash -> config.apply if different
 *  7. Health check via Gateway WS `health`
 *  8. Update DB status (BotInstance, GatewayConnection)
 *
 * The legacy ECS reconcile path is preserved as a fallback for instances
 * with `deploymentType === "ECS_EC2"`.
 */
@Injectable()
export class ReconcilerService {
  private readonly logger = new Logger(ReconcilerService.name);

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly configGenerator: ConfigGeneratorService,
    private readonly lifecycleManager: LifecycleManagerService,
    private readonly driftDetection: DriftDetectionService,
    private readonly securityAudit: OpenClawSecurityAuditService,
    private readonly delegationSkillWriter: DelegationSkillWriterService,
    private readonly manifestParser: ManifestParserService,
    private readonly doctorService: DoctorService,
    private readonly eventLogger: EventLoggerService,
    private readonly preprocessorChain: PreprocessorChainService,
  ) {}

  // ------------------------------------------------------------------
  // Main reconcile entry point
  // ------------------------------------------------------------------

  async reconcile(instanceId: string): Promise<ReconcileResult> {
    const startTime = Date.now();
    const changes: string[] = [];

    try {
      // 1. Load instance
      const instance = await this.botInstanceRepo.findOneWithRelations(instanceId);

      if (!instance) {
        throw new Error(`BotInstance ${instanceId} not found`);
      }

      // Mark as reconciling
      await this.botInstanceRepo.update(instanceId, {
        status: "RECONCILING",
        runningSince: null,
      });

      await this.eventLogger.logEvent(instanceId, "RECONCILE_START", "Starting v2 reconciliation");
      changes.push("Reconciliation started");

      // 2. Parse and validate the desired manifest
      const manifest = this.manifestParser.parse(instance);
      changes.push("Manifest validated");

      // 2b. Run preprocessor chain (e.g., delegation config injection)
      const preprocessResult = await this.preprocessorChain.process(manifest, { instance });
      if (preprocessResult.modificationCount > 0) {
        changes.push(...preprocessResult.changes);
      }

      // 3. Generate config + hash (BEFORE security audit so enforceSecureDefaults
      //    applies environment-aware fixes like sandbox enforcement for prod/staging)
      const config = this.configGenerator.generateOpenClawConfig(manifest);
      const desiredHash = this.configGenerator.generateConfigHash(config);
      changes.push(`Desired config hash: ${desiredHash.slice(0, 12)}...`);

      // 4. Pre-provisioning security audit on the FINAL config (not the raw manifest).
      //    This ensures the audit sees what will actually be deployed, including
      //    enforced defaults (sandbox mode, auth tokens, etc.).
      const auditManifest = {
        ...manifest,
        spec: {
          ...manifest.spec,
          openclawConfig: config as unknown as typeof manifest.spec.openclawConfig,
        },
      };
      const auditResult = await this.securityAudit.preProvisioningAudit(auditManifest);
      if (!auditResult.allowed) {
        const blockerMessages = auditResult.blockers.map(b => b.message).join("; ");
        throw new Error(`Security audit blocked provisioning: ${blockerMessages}`);
      }
      if (auditResult.warnings.length > 0) {
        this.logger.warn(
          `Security audit warnings for ${instanceId}: ${auditResult.warnings.map(w => w.message).join("; ")}`,
        );
      }
      changes.push(`Security audit: ${auditResult.blockers.length} blockers, ${auditResult.warnings.length} warnings`);

      // 5. Determine if this is a new or existing instance
      const isNew = this.isNewInstance(instance);

      if (isNew) {
        // 5a. New instance: full provision
        this.logger.log(`Instance ${instanceId} is new — provisioning`);
        const provisionResult = await this.lifecycleManager.provision(instance, manifest);

        if (!provisionResult.success) {
          throw new Error(`Provisioning failed: ${provisionResult.message}`);
        }

        changes.push(`Provisioned on ${provisionResult.gatewayHost}:${provisionResult.gatewayPort}`);
      } else {
        // 5b. Existing instance: config update via Gateway WS
        this.logger.log(`Instance ${instanceId} exists — checking for config drift`);

        const updateResult = await this.lifecycleManager.update(instance, manifest);

        if (!updateResult.success) {
          // Gateway unreachable or config.apply failed — fall back to full provision.
          // This handles: resume from stopped, crashed containers, ECS tasks recycled.
          this.logger.warn(
            `Config update failed for ${instanceId}, falling back to provision: ${updateResult.message}`,
          );

          const provisionResult = await this.lifecycleManager.provision(instance, manifest);
          if (!provisionResult.success) {
            throw new Error(`Re-provision failed (update also failed: ${updateResult.message}): ${provisionResult.message}`);
          }

          changes.push(`Re-provisioned (gateway unreachable for config update: ${updateResult.message})`);
        } else if (updateResult.method === "none") {
          changes.push("Config already up-to-date");
        } else {
          changes.push(`Config updated via ${updateResult.method} (hash=${updateResult.configHash?.slice(0, 12)}...)`);
        }
      }

      // 5c. Write delegation skill files to bot workspace
      try {
        const instanceMeta = (typeof instance.metadata === "string"
          ? JSON.parse(instance.metadata)
          : instance.metadata) as Record<string, unknown> | null;
        const configPath = (instanceMeta?.configPath as string) ?? `/var/openclaw/${instance.name}`;
        const apiUrl = process.env.CLAWSTER_API_URL || "http://172.17.0.1:4000";
        const skillResult = await this.delegationSkillWriter.writeDelegationSkills(
          instanceId,
          configPath,
          apiUrl,
        );
        if (skillResult.written) {
          changes.push(`Delegation skills written (${skillResult.memberCount} members)`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Delegation skill write failed for ${instanceId}: ${msg}`);
        changes.push(`Delegation skill write failed: ${msg}`);
      }

      // 6. Health check via Gateway WS
      const refetchedInstance = await this.botInstanceRepo.findById(instanceId);
      if (!refetchedInstance) {
        throw new Error(`BotInstance ${instanceId} not found during health check`);
      }
      const status = await this.lifecycleManager.getStatus(refetchedInstance);

      if (status.gatewayConnected && status.gatewayHealth?.ok) {
        changes.push("Health check passed");
      } else if (status.gatewayConnected && !status.gatewayHealth?.ok) {
        changes.push("Health check: gateway connected but unhealthy");
      } else {
        changes.push("Health check: gateway unreachable");
      }

      // 7. Final DB update
      const finalHealth = status.gatewayHealth?.ok ? "HEALTHY"
        : status.gatewayConnected ? "DEGRADED"
        : "UNKNOWN";

      await this.botInstanceRepo.update(instanceId, {
        status: "RUNNING",
        runningSince: new Date(),
        health: finalHealth,
        configHash: desiredHash,
        lastReconcileAt: new Date(),
        lastHealthCheckAt: new Date(),
        lastError: null,
        errorCount: 0,
      });

      const durationMs = Date.now() - startTime;

      await this.eventLogger.logEvent(
        instanceId,
        "RECONCILE_SUCCESS",
        `Reconciliation completed in ${durationMs}ms`,
      );

      return {
        success: true,
        message: `Reconciliation completed in ${durationMs}ms`,
        changes,
        durationMs,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const durationMs = Date.now() - startTime;

      this.logger.error(`Reconciliation failed for ${instanceId}: ${message}`);

      await this.botInstanceRepo.update(instanceId, {
        status: "ERROR",
        runningSince: null,
        lastError: message,
        errorCount: { increment: 1 },
        lastReconcileAt: new Date(),
      });

      await this.eventLogger.logEvent(instanceId, "RECONCILE_ERROR", message);

      return {
        success: false,
        message: `Reconciliation failed: ${message}`,
        changes,
        durationMs,
      };
    }
  }

  // ------------------------------------------------------------------
  // Doctor — diagnostics for a single instance (delegated)
  // ------------------------------------------------------------------

  async doctor(instanceId: string): Promise<DoctorResult> {
    return this.doctorService.diagnose(instanceId);
  }

  // ------------------------------------------------------------------
  // Update OpenClaw version
  // ------------------------------------------------------------------

  async updateOpenClawVersion(instanceId: string, newVersion: string): Promise<UpdateOpenClawResult> {
    try {
      const instance = await this.botInstanceRepo.findById(instanceId);
      if (!instance) {
        throw new Error(`BotInstance ${instanceId} not found`);
      }

      const previousVersion = instance.openclawVersion ?? undefined;

      // Update version in DB
      await this.botInstanceRepo.update(instanceId, {
        openclawVersion: newVersion,
      });

      // Full restart is required for version change — re-provision
      this.manifestParser.parse(instance); // Validate manifest before restart
      await this.lifecycleManager.restart(instance);

      this.logger.log(`Instance ${instanceId} updated from ${previousVersion ?? "unknown"} to ${newVersion}`);

      return {
        success: true,
        message: `Updated to ${newVersion} and restarted`,
        previousVersion,
        newVersion,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, message };
    }
  }

  // ------------------------------------------------------------------
  // Drift check (delegated)
  // ------------------------------------------------------------------

  async checkDrift(instanceId: string): Promise<DriftCheckResult> {
    const instance = await this.botInstanceRepo.findById(instanceId);
    if (!instance) {
      throw new Error(`BotInstance ${instanceId} not found`);
    }

    const manifest = this.manifestParser.parse(instance);
    return this.driftDetection.checkDrift(instance, manifest);
  }

  // ------------------------------------------------------------------
  // Stop / Delete — delegated to lifecycle manager
  // ------------------------------------------------------------------

  async stop(instanceId: string): Promise<void> {
    const instance = await this.botInstanceRepo.findById(instanceId);
    if (!instance) {
      throw new Error(`BotInstance ${instanceId} not found`);
    }

    // Stop via lifecycle manager if it's an openclaw-native instance
    if (instance.deploymentType && instance.deploymentType !== "ECS_EC2") {
      await this.lifecycleManager.destroy(instance);
    }

    await this.botInstanceRepo.update(instanceId, {
      status: "STOPPED",
      runningSince: null,
    });
  }

  async delete(instanceId: string): Promise<void> {
    const instance = await this.botInstanceRepo.findById(instanceId);

    if (!instance) return;

    await this.lifecycleManager.destroy(instance);

    await this.botInstanceRepo.delete(instanceId);
  }

  // ------------------------------------------------------------------
  // Resource updates — delegated to lifecycle manager
  // ------------------------------------------------------------------

  async updateResources(
    instanceId: string,
    spec: { cpu: number; memory: number; dataDiskSizeGb?: number }
  ): Promise<{ success: boolean; message: string; requiresRestart: boolean }> {
    const instance = await this.botInstanceRepo.findById(instanceId);
    if (!instance) {
      throw new Error(`BotInstance ${instanceId} not found`);
    }

    return this.lifecycleManager.updateResources(instance, spec);
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /**
   * Determine if an instance needs full provisioning vs config-only update.
   * An instance is "new" only if it has NEVER been successfully reconciled.
   * PENDING instances that were previously reconciled (e.g., after fleet
   * promotion or resume) use the update path, not full reprovisioning.
   */
  private isNewInstance(instance: BotInstance): boolean {
    if (instance.status === "CREATING") return true;
    if (instance.lastReconcileAt || instance.configHash) return false;
    return true;
  }
}
