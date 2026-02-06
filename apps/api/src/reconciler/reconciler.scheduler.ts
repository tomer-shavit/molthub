import { Injectable, Inject, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import {
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
} from "@clawster/database";
import { DriftDetectionService } from "./drift-detection.service";
import { ReconcilerService } from "./reconciler.service";
import { LifecycleManagerService } from "./lifecycle-manager.service";

@Injectable()
export class ReconcilerScheduler {
  private readonly logger = new Logger(ReconcilerScheduler.name);

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    private readonly driftDetection: DriftDetectionService,
    private readonly reconciler: ReconcilerService,
    private readonly lifecycleManager: LifecycleManagerService,
  ) {}

  /**
   * Check for drift every 5 minutes across all running/degraded BotInstances.
   * Uses the v2 Gateway WS drift detection instead of ECS task counts.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkDrift(): Promise<void> {
    this.logger.debug("Running scheduled drift check (v2)");

    try {
      const results = await this.driftDetection.checkAllInstances();

      const driftCount = results.filter((r) => r.result.hasDrift).length;

      if (driftCount > 0) {
        this.logger.warn(`Drift detected in ${driftCount}/${results.length} instances`);

        // Auto-reconcile if AUTO_RECONCILE_ON_DRIFT is enabled
        if (process.env.AUTO_RECONCILE_ON_DRIFT === "true") {
          for (const result of results) {
            if (result.result.hasDrift) {
              this.logger.log(`Auto-reconciling instance ${result.instanceId}`);
              try {
                await this.reconciler.reconcile(result.instanceId);
              } catch (err) {
                this.logger.error(`Auto-reconcile failed for ${result.instanceId}: ${err}`);
              }
            }
          }
        }
      } else {
        this.logger.debug(`No drift detected across ${results.length} instances`);
      }
    } catch (error) {
      this.logger.error(`Drift check failed: ${error}`);
    }
  }

  /**
   * Health check for stuck instances every minute.
   * Detects BotInstances stuck in CREATING or RECONCILING for > 15 minutes.
   * (First ECS EC2 deploy with shared infra creation can take 10+ minutes.)
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async healthCheckStuckInstances(): Promise<void> {
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    try {
      const { data: stuckInstances } = await this.botInstanceRepo.findMany({
        status: ["CREATING", "RECONCILING"],
      });

      // Filter for instances older than 15 minutes
      const stuckOldInstances = stuckInstances.filter(
        (instance) => instance.updatedAt < fifteenMinutesAgo
      );

      for (const instance of stuckOldInstances) {
        this.logger.warn(
          `Instance ${instance.id} (${instance.name}) stuck in ${instance.status} for > 15 minutes`,
        );

        await this.botInstanceRepo.update(instance.id, {
          status: "ERROR",
          runningSince: null,
          lastError: `Instance stuck in ${instance.status} state for too long`,
          errorCount: { increment: 1 },
        });
      }
    } catch (error) {
      this.logger.error(`Stuck instance check failed: ${error}`);
    }
  }

  /**
   * Pick up PENDING instances every 30 seconds.
   * Instances in PENDING state should be reconciled to start them.
   * This is a safety net — normally resume() triggers reconciliation
   * immediately, but if that fire-and-forget call fails, this catches it.
   */
  @Cron("*/30 * * * * *")
  async reconcilePendingInstances(): Promise<void> {
    try {
      const { data: pendingInstances } = await this.botInstanceRepo.findMany({
        status: "PENDING",
      });

      for (const instance of pendingInstances) {
        this.logger.log(
          `Picking up PENDING instance ${instance.id} (${instance.name}) for reconciliation`,
        );
        try {
          await this.reconciler.reconcile(instance.id);
        } catch (err) {
          this.logger.error(
            `Failed to reconcile PENDING instance ${instance.id}: ${err}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Pending instance check failed: ${error}`);
    }
  }

  /**
   * Detect orphaned "RUNNING" instances whose containers no longer exist.
   * Safety net that catches anything the health poller missed.
   * Runs every 5 minutes, only checks instances with 10+ consecutive errors.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkOrphanedRunningInstances(): Promise<void> {
    try {
      const { data: runningInstances } = await this.botInstanceRepo.findMany({
        status: "RUNNING",
      });

      // Filter for instances with 10+ consecutive errors
      const orphanCandidates = runningInstances.filter(
        (instance) => instance.errorCount >= 10
      );

      if (orphanCandidates.length === 0) return;

      this.logger.debug(
        `Checking ${orphanCandidates.length} potentially orphaned RUNNING instances`,
      );

      for (const instance of orphanCandidates) {
        try {
          const status = await this.lifecycleManager.getStatus(instance);

          if (status.infraState === "not-installed") {
            this.logger.warn(
              `Instance ${instance.id} (${instance.name}) container not found — marking as STOPPED`,
            );
            await this.botInstanceRepo.update(instance.id, {
              status: "STOPPED",
              runningSince: null,
              lastError: "Container no longer running",
            });
          } else if (status.infraState === "error") {
            this.logger.warn(
              `Instance ${instance.id} (${instance.name}) container in error state — marking as ERROR`,
            );
            await this.botInstanceRepo.update(instance.id, {
              status: "ERROR",
              runningSince: null,
              lastError: "Container in error state",
            });
          }
        } catch (err) {
          this.logger.error(
            `Failed to check orphaned instance ${instance.id}: ${err}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(`Orphaned instance check failed: ${error}`);
    }
  }

  /**
   * Check for stale secrets daily.
   * Logs warnings for any channel tokens or gateway auth secrets that
   * haven't been rotated within the configured maximum age.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async checkTokenRotation(): Promise<void> {
    this.logger.debug("Running daily token rotation check");

    try {
      const MAX_TOKEN_AGE_DAYS = 90;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - MAX_TOKEN_AGE_DAYS);

      // Find all running instances and check their secret age
      const { data: runningInstances } = await this.botInstanceRepo.findMany({
        status: ["RUNNING", "DEGRADED"],
      });

      let staleCount = 0;

      for (const instance of runningInstances) {
        // Use lastReconcileAt as a proxy for "last time secrets were refreshed"
        // If the instance hasn't been reconciled since the cutoff, flag it
        const lastRefresh = instance.lastReconcileAt ?? instance.createdAt;
        if (lastRefresh < cutoffDate) {
          staleCount++;
          this.logger.warn(
            `Instance ${instance.id} (${instance.name}) has not been reconciled in ${MAX_TOKEN_AGE_DAYS}+ days — consider rotating secrets`,
          );
        }
      }

      if (staleCount > 0) {
        this.logger.warn(`${staleCount}/${runningInstances.length} instances may need token rotation`);
      } else {
        this.logger.debug(`All ${runningInstances.length} running instances are within token rotation window`);
      }
    } catch (error) {
      this.logger.error(`Token rotation check failed: ${error}`);
    }
  }
}
