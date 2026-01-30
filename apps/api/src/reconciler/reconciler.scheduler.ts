import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { prisma, BotStatus } from "@molthub/database";
import { DriftDetectionService } from "./drift-detection.service";
import { ReconcilerService } from "./reconciler.service";

@Injectable()
export class ReconcilerScheduler {
  private readonly logger = new Logger(ReconcilerScheduler.name);

  constructor(
    private readonly driftDetection: DriftDetectionService,
    private readonly reconciler: ReconcilerService,
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
   * Detects BotInstances stuck in CREATING or RECONCILING for > 10 minutes.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async healthCheckStuckInstances(): Promise<void> {
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    try {
      const stuckInstances = await prisma.botInstance.findMany({
        where: {
          status: { in: [BotStatus.CREATING, BotStatus.RECONCILING] },
          updatedAt: { lt: tenMinutesAgo },
        },
      });

      for (const instance of stuckInstances) {
        this.logger.warn(
          `Instance ${instance.id} (${instance.name}) stuck in ${instance.status} for > 10 minutes`,
        );

        await prisma.botInstance.update({
          where: { id: instance.id },
          data: {
            status: BotStatus.ERROR,
            lastError: `Instance stuck in ${instance.status} state for too long`,
            errorCount: { increment: 1 },
          },
        });
      }
    } catch (error) {
      this.logger.error(`Stuck instance check failed: ${error}`);
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
      const runningInstances = await prisma.botInstance.findMany({
        where: {
          status: { in: [BotStatus.RUNNING, BotStatus.DEGRADED] },
        },
        select: {
          id: true,
          name: true,
          createdAt: true,
          lastReconcileAt: true,
        },
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
