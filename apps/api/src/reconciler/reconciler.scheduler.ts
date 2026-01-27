import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
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
   * Check for drift every 5 minutes
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async checkDrift(): Promise<void> {
    this.logger.debug("Running scheduled drift check");
    
    try {
      const results = await this.driftDetection.checkAllInstances();
      
      const driftCount = results.filter(r => r.result.hasDrift).length;
      
      if (driftCount > 0) {
        this.logger.warn(`Drift detected in ${driftCount} instances`);
        
        // Auto-reconcile if AUTO_RECONCILE_ON_DRIFT is enabled
        if (process.env.AUTO_RECONCILE_ON_DRIFT === "true") {
          for (const result of results) {
            if (result.result.hasDrift) {
              this.logger.log(`Auto-reconciling instance ${result.instanceId}`);
              await this.reconciler.reconcile(result.instanceId);
            }
          }
        }
      } else {
        this.logger.debug("No drift detected");
      }
    } catch (error) {
      this.logger.error(`Drift check failed: ${error}`);
    }
  }

  /**
   * Health check for stuck instances every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async healthCheckStuckInstances(): Promise<void> {
    // Find instances stuck in CREATING for > 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const { prisma } = await import("@molthub/database");
    
    const stuckInstances = await prisma.instance.findMany({
      where: {
        status: "CREATING",
        lastReconcileAt: {
          lt: tenMinutesAgo,
        },
      },
    });

    for (const instance of stuckInstances) {
      this.logger.warn(`Instance ${instance.id} stuck in CREATING for > 10 minutes`);
      
      await prisma.instance.update({
        where: { id: instance.id },
        data: {
          status: "ERROR",
          lastError: "Instance stuck in CREATING state for too long",
        },
      });
    }
  }
}