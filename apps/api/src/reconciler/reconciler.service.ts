import { Injectable, Logger } from "@nestjs/common";
import {
  prisma,
  BotInstance,
  BotStatus,
  BotHealth,
  DeploymentEventType,
} from "@molthub/database";
import {
  validateMoltbotManifest,
} from "@molthub/core";
import type { MoltbotManifest } from "@molthub/core";
import { ConfigGeneratorService } from "./config-generator.service";
import { LifecycleManagerService } from "./lifecycle-manager.service";
import { DriftDetectionService } from "./drift-detection.service";
import { MoltbotSecurityAuditService } from "../security/security-audit.service";
import type { DriftCheckResult } from "./drift-detection.service";

// Re-export for backward compatibility with the controller
export { DriftCheckResult };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReconcileResult {
  success: boolean;
  message: string;
  changes: string[];
  durationMs: number;
}

export interface DoctorResult {
  instanceId: string;
  checks: DoctorCheck[];
  overallStatus: "healthy" | "degraded" | "unhealthy" | "error";
}

export interface DoctorCheck {
  name: string;
  status: "pass" | "warn" | "fail" | "skip";
  message: string;
}

export interface UpdateMoltbotResult {
  success: boolean;
  message: string;
  previousVersion?: string;
  newVersion?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

/**
 * ReconcilerService (v2) — Moltbot-aware lifecycle reconciler.
 *
 * Reconciliation flow:
 *  1. Load BotInstance + desired manifest (v2 MoltbotManifest)
 *  2. Validate manifest against schema
 *  3. Generate moltbot.json config + hash
 *  4. Determine deployment target type
 *  5. **New instance**: provision via DeploymentTarget -> write config -> start gateway
 *  6. **Existing instance**: config.get via Gateway WS -> compare hash -> config.apply if different
 *  7. Health check via Gateway WS `health`
 *  8. Update DB status (BotInstance, GatewayConnection)
 *
 * The legacy ECS reconcile path is preserved as a fallback for instances
 * with `deploymentType === "ECS_FARGATE"`.
 */
@Injectable()
export class ReconcilerService {
  private readonly logger = new Logger(ReconcilerService.name);

  constructor(
    private readonly configGenerator: ConfigGeneratorService,
    private readonly lifecycleManager: LifecycleManagerService,
    private readonly driftDetection: DriftDetectionService,
    private readonly securityAudit: MoltbotSecurityAuditService,
  ) {}

  // ------------------------------------------------------------------
  // Main reconcile entry point
  // ------------------------------------------------------------------

  async reconcile(instanceId: string): Promise<ReconcileResult> {
    const startTime = Date.now();
    const changes: string[] = [];

    try {
      // 1. Load instance
      const instance = await prisma.botInstance.findUnique({
        where: { id: instanceId },
        include: { fleet: true },
      });

      if (!instance) {
        throw new Error(`BotInstance ${instanceId} not found`);
      }

      // Mark as reconciling
      await prisma.botInstance.update({
        where: { id: instanceId },
        data: { status: BotStatus.RECONCILING },
      });

      await this.logEvent(instanceId, DeploymentEventType.RECONCILE_START, "Starting v2 reconciliation");
      changes.push("Reconciliation started");

      // 2. Parse and validate the desired manifest
      const manifest = this.parseManifest(instance);
      changes.push("Manifest validated");

      // 2b. Pre-provisioning security audit
      const auditResult = await this.securityAudit.preProvisioningAudit(manifest);
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

      // 3. Generate config + hash
      const config = this.configGenerator.generateMoltbotConfig(manifest);
      const desiredHash = this.configGenerator.generateConfigHash(config);
      changes.push(`Desired config hash: ${desiredHash.slice(0, 12)}...`);

      // 4. Determine if this is a new or existing instance
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
          throw new Error(`Config update failed: ${updateResult.message}`);
        }

        if (updateResult.method === "none") {
          changes.push("Config already up-to-date");
        } else {
          changes.push(`Config updated via ${updateResult.method} (hash=${updateResult.configHash?.slice(0, 12)}...)`);
        }
      }

      // 6. Health check via Gateway WS
      const status = await this.lifecycleManager.getStatus(
        // Re-fetch instance to get latest state
        (await prisma.botInstance.findUniqueOrThrow({ where: { id: instanceId } })),
      );

      if (status.gatewayConnected && status.gatewayHealth?.ok) {
        changes.push("Health check passed");
      } else if (status.gatewayConnected && !status.gatewayHealth?.ok) {
        changes.push("Health check: gateway connected but unhealthy");
      } else {
        changes.push("Health check: gateway unreachable");
      }

      // 7. Final DB update
      const finalHealth = status.gatewayHealth?.ok ? BotHealth.HEALTHY
        : status.gatewayConnected ? BotHealth.DEGRADED
        : BotHealth.UNKNOWN;

      await prisma.botInstance.update({
        where: { id: instanceId },
        data: {
          status: BotStatus.RUNNING,
          health: finalHealth,
          configHash: desiredHash,
          lastReconcileAt: new Date(),
          lastHealthCheckAt: new Date(),
          lastError: null,
        },
      });

      const durationMs = Date.now() - startTime;

      await this.logEvent(
        instanceId,
        DeploymentEventType.RECONCILE_SUCCESS,
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

      await prisma.botInstance.update({
        where: { id: instanceId },
        data: {
          status: BotStatus.ERROR,
          lastError: message,
          errorCount: { increment: 1 },
          lastReconcileAt: new Date(),
        },
      });

      await this.logEvent(instanceId, DeploymentEventType.RECONCILE_ERROR, message);

      return {
        success: false,
        message: `Reconciliation failed: ${message}`,
        changes,
        durationMs,
      };
    }
  }

  // ------------------------------------------------------------------
  // Doctor — diagnostics for a single instance
  // ------------------------------------------------------------------

  async doctor(instanceId: string): Promise<DoctorResult> {
    const checks: DoctorCheck[] = [];

    // Check 1: Instance exists
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
      include: { gatewayConnection: true },
    });

    if (!instance) {
      return {
        instanceId,
        checks: [{ name: "instance_exists", status: "fail", message: "Instance not found" }],
        overallStatus: "error",
      };
    }
    checks.push({ name: "instance_exists", status: "pass", message: "Instance found in DB" });

    // Check 2: Manifest valid
    try {
      this.parseManifest(instance);
      checks.push({ name: "manifest_valid", status: "pass", message: "Manifest is a valid v2 MoltbotManifest" });
    } catch (err) {
      checks.push({
        name: "manifest_valid",
        status: "fail",
        message: `Invalid manifest: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Check 3: Gateway connection record
    if (instance.gatewayConnection) {
      checks.push({
        name: "gateway_record",
        status: "pass",
        message: `Gateway record: ${instance.gatewayConnection.host}:${instance.gatewayConnection.port} (${instance.gatewayConnection.status})`,
      });
    } else {
      checks.push({
        name: "gateway_record",
        status: "warn",
        message: "No GatewayConnection record in DB",
      });
    }

    // Check 4: Gateway reachable + healthy
    try {
      const status = await this.lifecycleManager.getStatus(instance);

      if (status.gatewayConnected) {
        checks.push({ name: "gateway_reachable", status: "pass", message: "Gateway WS connection succeeded" });
      } else {
        checks.push({ name: "gateway_reachable", status: "fail", message: "Cannot connect to gateway" });
      }

      if (status.gatewayHealth?.ok) {
        checks.push({ name: "gateway_healthy", status: "pass", message: `Gateway healthy (uptime: ${status.gatewayHealth.uptime}s)` });
      } else if (status.gatewayConnected) {
        checks.push({ name: "gateway_healthy", status: "warn", message: "Gateway connected but reports unhealthy" });
      } else {
        checks.push({ name: "gateway_healthy", status: "skip", message: "Skipped (gateway unreachable)" });
      }

      // Check 5: Config hash
      if (status.configHash && instance.configHash) {
        if (status.configHash === instance.configHash) {
          checks.push({ name: "config_sync", status: "pass", message: "Config hash matches" });
        } else {
          checks.push({
            name: "config_sync",
            status: "warn",
            message: `Config hash mismatch: DB=${instance.configHash?.slice(0, 12)} remote=${status.configHash?.slice(0, 12)}`,
          });
        }
      } else {
        checks.push({ name: "config_sync", status: "skip", message: "No config hash to compare" });
      }

      // Check 6: Infra state
      checks.push({
        name: "infra_state",
        status: status.infraState === "running" ? "pass" : "warn",
        message: `Infrastructure state: ${status.infraState}`,
      });
    } catch (err) {
      checks.push({
        name: "gateway_reachable",
        status: "fail",
        message: `Gateway check error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }

    // Determine overall status
    const hasFail = checks.some((c) => c.status === "fail");
    const hasWarn = checks.some((c) => c.status === "warn");
    const overallStatus = hasFail ? "unhealthy" : hasWarn ? "degraded" : "healthy";

    return { instanceId, checks, overallStatus };
  }

  // ------------------------------------------------------------------
  // Update Moltbot version
  // ------------------------------------------------------------------

  async updateMoltbotVersion(instanceId: string, newVersion: string): Promise<UpdateMoltbotResult> {
    try {
      const instance = await prisma.botInstance.findUniqueOrThrow({
        where: { id: instanceId },
      });

      const previousVersion = instance.moltbotVersion ?? undefined;

      // Update version in DB
      await prisma.botInstance.update({
        where: { id: instanceId },
        data: { moltbotVersion: newVersion },
      });

      // Full restart is required for version change — re-provision
      const manifest = this.parseManifest(instance);
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
    const instance = await prisma.botInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });

    const manifest = this.parseManifest(instance);
    return this.driftDetection.checkDrift(instance, manifest);
  }

  // ------------------------------------------------------------------
  // Stop / Delete — delegated to lifecycle manager
  // ------------------------------------------------------------------

  async stop(instanceId: string): Promise<void> {
    const instance = await prisma.botInstance.findUniqueOrThrow({
      where: { id: instanceId },
    });

    // Stop via lifecycle manager if it's a moltbot-native instance
    if (instance.deploymentType && instance.deploymentType !== "ECS_FARGATE") {
      await this.lifecycleManager.destroy(instance);
    }

    await prisma.botInstance.update({
      where: { id: instanceId },
      data: { status: BotStatus.STOPPED },
    });
  }

  async delete(instanceId: string): Promise<void> {
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) return;

    await this.lifecycleManager.destroy(instance);

    await prisma.botInstance.delete({
      where: { id: instanceId },
    });
  }

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  /**
   * Parse and validate the desiredManifest JSON field into a typed
   * MoltbotManifest.  Falls back to wrapping legacy manifests in a v2 envelope.
   */
  private parseManifest(instance: BotInstance): MoltbotManifest {
    const raw = instance.desiredManifest;

    if (!raw || typeof raw !== "object") {
      throw new Error(`Instance ${instance.id} has no desired manifest`);
    }

    const obj = raw as Record<string, unknown>;

    // If it's already a v2 manifest, validate directly
    if (obj.apiVersion === "molthub/v2") {
      return validateMoltbotManifest(obj);
    }

    // Legacy format: wrap in v2 envelope
    // Assume the raw manifest IS the moltbotConfig section
    const wrapped = {
      apiVersion: "molthub/v2" as const,
      kind: "MoltbotInstance" as const,
      metadata: {
        name: instance.name.toLowerCase().replace(/[^a-z0-9-]/g, "-"),
        workspace: instance.workspaceId,
        environment: "dev" as const,
        labels: {},
        deploymentTarget: "local" as const,
      },
      spec: {
        moltbotConfig: obj,
      },
    };

    return validateMoltbotManifest(wrapped);
  }

  /**
   * Determine if an instance needs full provisioning vs config-only update.
   * An instance is "new" if it has never been successfully reconciled or
   * has no gateway connection.
   */
  private isNewInstance(instance: BotInstance): boolean {
    return (
      instance.status === BotStatus.CREATING ||
      instance.status === BotStatus.PENDING ||
      (!instance.lastReconcileAt && !instance.configHash)
    );
  }

  private async logEvent(
    instanceId: string,
    eventType: DeploymentEventType,
    message: string,
  ): Promise<void> {
    try {
      // Attempt to log to the legacy DeploymentEvent table for backward compat.
      // This requires a matching Instance record. If none exists (pure v2
      // BotInstance), we silently skip.
      const legacyInstance = await prisma.instance.findFirst({
        where: { name: instanceId },
      });

      if (legacyInstance) {
        await prisma.deploymentEvent.create({
          data: {
            instanceId: legacyInstance.id,
            eventType,
            message,
          },
        });
      }
    } catch {
      // Non-critical — log and continue
      this.logger.debug(`Could not write deployment event for ${instanceId}: ${eventType}`);
    }
  }
}
