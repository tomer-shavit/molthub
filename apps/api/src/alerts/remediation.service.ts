import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { prisma } from "@clawster/database";
import { ReconcilerService } from "../reconciler/reconciler.service";
import { OpenClawHealthService } from "../health/openclaw-health.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RemediationResult {
  success: boolean;
  action: string;
  message: string;
  detail?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class RemediationService {
  private readonly logger = new Logger(RemediationService.name);

  constructor(
    private readonly reconciler: ReconcilerService,
    private readonly openclawHealth: OpenClawHealthService,
  ) {}

  /**
   * Execute the remediation action associated with an alert.
   * Reads the alert's `remediationAction` field and dispatches accordingly.
   */
  async executeRemediation(alertId: string): Promise<RemediationResult> {
    const alert = await prisma.healthAlert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException(`Alert ${alertId} not found`);
    }

    if (!alert.remediationAction) {
      return {
        success: false,
        action: "none",
        message: "No remediation action defined for this alert",
      };
    }

    const action = alert.remediationAction;
    const instanceId = alert.instanceId;

    if (!instanceId) {
      return {
        success: false,
        action,
        message: "Cannot execute remediation: alert is not associated with a specific instance",
      };
    }

    this.logger.log(
      `Executing remediation "${action}" for alert ${alertId} (instance ${instanceId})`,
    );

    let result: RemediationResult;

    switch (action) {
      case "restart":
        result = await this.executeRestart(instanceId);
        break;
      case "reconcile":
        result = await this.executeReconcile(instanceId);
        break;
      case "re-pair-channel":
        result = await this.executeRePairChannel(instanceId);
        break;
      case "run-doctor":
        result = await this.executeRunDoctor(instanceId);
        break;
      default:
        result = {
          success: false,
          action,
          message: `Unknown remediation action: ${action}`,
        };
    }

    // Update the alert with remediation results
    await prisma.healthAlert.update({
      where: { id: alertId },
      data: {
        remediationNote: `${result.success ? "Success" : "Failed"}: ${result.message}`,
        // If remediation succeeded, resolve the alert
        ...(result.success
          ? { status: "RESOLVED", resolvedAt: new Date() }
          : {}),
      },
    });

    return result;
  }

  // ---- Individual remediation actions --------------------------------------

  private async executeRestart(instanceId: string): Promise<RemediationResult> {
    try {
      // Use the reconciler to do a full reconcile which includes restart logic
      const reconcileResult = await this.reconciler.reconcile(instanceId);

      return {
        success: reconcileResult.success,
        action: "restart",
        message: reconcileResult.message,
        detail: reconcileResult.changes.join("; "),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Restart remediation failed for ${instanceId}: ${message}`);
      return {
        success: false,
        action: "restart",
        message: `Restart failed: ${message}`,
      };
    }
  }

  private async executeReconcile(instanceId: string): Promise<RemediationResult> {
    try {
      const reconcileResult = await this.reconciler.reconcile(instanceId);

      return {
        success: reconcileResult.success,
        action: "reconcile",
        message: reconcileResult.message,
        detail: reconcileResult.changes.join("; "),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Reconcile remediation failed for ${instanceId}: ${message}`);
      return {
        success: false,
        action: "reconcile",
        message: `Reconcile failed: ${message}`,
      };
    }
  }

  private async executeRePairChannel(instanceId: string): Promise<RemediationResult> {
    try {
      // Reset all expired/error channel auth sessions to PENDING
      const result = await prisma.channelAuthSession.updateMany({
        where: {
          instanceId,
          state: { in: ["EXPIRED", "ERROR"] },
        },
        data: {
          state: "PENDING",
          lastError: null,
          attemptCount: 0,
        },
      });

      return {
        success: true,
        action: "re-pair-channel",
        message: `Reset ${result.count} channel auth session(s) to PENDING`,
        detail: `Instance ${instanceId}: ${result.count} sessions reset`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Re-pair channel remediation failed for ${instanceId}: ${message}`);
      return {
        success: false,
        action: "re-pair-channel",
        message: `Re-pair failed: ${message}`,
      };
    }
  }

  private async executeRunDoctor(instanceId: string): Promise<RemediationResult> {
    try {
      // Trigger a deep health check via OpenClawHealthService
      const deepHealth = await this.openclawHealth.getDeepHealth(instanceId);

      return {
        success: deepHealth.reachable,
        action: "run-doctor",
        message: deepHealth.reachable
          ? `Deep health check completed. Gateway healthy: ${deepHealth.snapshot.ok}`
          : "Deep health check failed: gateway unreachable",
        detail: JSON.stringify({
          reachable: deepHealth.reachable,
          healthy: deepHealth.snapshot.ok,
          latencyMs: deepHealth.latencyMs,
          channels: deepHealth.snapshot.channels.length,
        }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Run-doctor remediation failed for ${instanceId}: ${message}`);
      return {
        success: false,
        action: "run-doctor",
        message: `Doctor check failed: ${message}`,
      };
    }
  }
}
