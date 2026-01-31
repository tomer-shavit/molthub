import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@molthub/database";
import { AgentEvolutionService } from "./agent-evolution.service";

@Injectable()
export class AgentEvolutionScheduler {
  private readonly logger = new Logger(AgentEvolutionScheduler.name);

  constructor(private readonly evolutionService: AgentEvolutionService) {}

  /**
   * Sync live state for all connected, running bots every 2 minutes.
   */
  @Cron("0 */2 * * * *")
  async syncAllInstances() {
    const instances = await prisma.botInstance.findMany({
      where: {
        status: { in: ["RUNNING", "DEGRADED"] },
        gatewayConnection: {
          status: "CONNECTED",
        },
      },
      select: { id: true, name: true },
    });

    if (instances.length === 0) return;

    this.logger.debug(`Syncing evolution state for ${instances.length} instances`);

    for (const instance of instances) {
      try {
        // Skip if a recent snapshot exists (< 90 seconds old)
        const recent = await prisma.agentStateSnapshot.findFirst({
          where: {
            instanceId: instance.id,
            capturedAt: { gt: new Date(Date.now() - 90_000) },
          },
        });

        if (recent) {
          this.logger.debug(`Skipping ${instance.name}: recent snapshot exists`);
          continue;
        }

        await this.evolutionService.captureState(instance.id);
      } catch (err) {
        this.logger.error(`Failed to sync evolution for ${instance.name} (${instance.id}): ${err}`);
      }
    }
  }

  /**
   * Prune old snapshots hourly.
   */
  @Cron("0 0 * * * *")
  async pruneSnapshots() {
    try {
      const pruned = await this.evolutionService.cleanupOldSnapshots(7);
      if (pruned > 0) {
        this.logger.log(`Pruned ${pruned} old evolution snapshots`);
      }
    } catch (err) {
      this.logger.error(`Failed to prune snapshots: ${err}`);
    }
  }
}
