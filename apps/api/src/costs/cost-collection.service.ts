import { Injectable, Logger, Inject } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
  COST_REPOSITORY,
  ICostRepository,
} from "@clawster/database";
import { OpenClawHealthService } from "../health/openclaw-health.service";

@Injectable()
export class CostCollectionService {
  private readonly logger = new Logger(CostCollectionService.name);
  private running = false;

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY)
    private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(COST_REPOSITORY)
    private readonly costRepo: ICostRepository,
    private readonly openClawHealthService: OpenClawHealthService,
  ) {}

  /**
   * Scheduled cost collection every 15 minutes.
   * Syncs token usage from Gateway to CostEvent records.
   */
  @Cron("0 */15 * * * *")
  async scheduledCostCollection(): Promise<void> {
    this.logger.debug("Running scheduled cost collection");
    await this.collectCosts();
  }

  /**
   * Collect costs from all running instances.
   * Called automatically every 15 minutes via scheduledCostCollection()
   * or on-demand via POST /costs/refresh endpoint.
   */
  async collectCosts(): Promise<void> {
    if (this.running) {
      this.logger.debug("Cost collection already in progress, skipping");
      return;
    }

    this.running = true;
    try {
      await this.syncAllInstances();
    } finally {
      this.running = false;
    }
  }

  private async syncAllInstances(): Promise<void> {
    const result = await this.botInstanceRepo.findMany({
      status: "RUNNING",
      hasGatewayConnection: true,
    });

    const instances = result.data;

    if (instances.length === 0) {
      this.logger.debug("No running instances with gateway connections");
      return;
    }

    this.logger.log(`Syncing costs for ${instances.length} instance(s)`);
    let totalEvents = 0;

    for (const instance of instances) {
      try {
        const count = await this.syncInstance({
          id: instance.id,
          name: instance.name,
          desiredManifest: instance.desiredManifest,
          lastCostSyncDate: instance.lastCostSyncDate,
        });
        totalEvents += count;
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : "Unknown error";
        this.logger.warn(
          `Cost sync failed for ${instance.name} (${instance.id}): ${message}`,
        );
      }
    }

    if (totalEvents > 0) {
      this.logger.log(
        `Cost collection complete: ${totalEvents} event(s) synced`,
      );
    }
  }

  private async syncInstance(instance: {
    id: string;
    name: string;
    desiredManifest: string;
    lastCostSyncDate: string | null;
  }): Promise<number> {
    const usage = await this.openClawHealthService.getUsage(instance.id);
    if (!usage || !usage.daily || usage.daily.length === 0) {
      return 0;
    }

    const { provider, model } = this.extractProviderModel(
      instance.desiredManifest,
    );

    const todayStr = new Date().toISOString().split("T")[0];
    const lastSyncDate = instance.lastCostSyncDate;

    // Filter entries to process:
    // - Include today (will be upserted with delta calculation)
    // - Include any day after lastSyncDate (for completed days)
    // - Skip entries with zero cost and tokens
    const entriesToProcess = usage.daily.filter((entry) => {
      // Skip empty entries
      if (entry.totalCost === 0 && entry.totalTokens === 0) return false;

      // Always include today (upsert handles delta)
      if (entry.date === todayStr) return true;

      // For past days, only include if after lastSyncDate
      if (lastSyncDate && entry.date <= lastSyncDate) return false;

      return true;
    }).slice(-30); // Limit to last 30 days

    if (entriesToProcess.length === 0) {
      return 0;
    }

    let latestCompletedDate = lastSyncDate;
    let eventsProcessed = 0;

    for (const entry of entriesToProcess) {
      const costCents = Math.round(entry.totalCost * 100);

      // Use upsert to handle both new entries and updates to today's entry
      const result = await this.costRepo.upsertDailyCostEvent({
        instanceId: instance.id,
        date: entry.date,
        provider,
        model,
        inputTokens: entry.input,
        outputTokens: entry.output,
        costCents,
      });

      eventsProcessed++;

      // Only track completed days (not today) for lastCostSyncDate
      // This ensures we don't skip re-syncing completed days
      if (entry.date !== todayStr) {
        if (!latestCompletedDate || entry.date > latestCompletedDate) {
          latestCompletedDate = entry.date;
        }
      }

      // Log if there was a significant delta for today
      if (entry.date === todayStr && !result.isNew && result.deltaCostCents > 0) {
        this.logger.debug(
          `Updated today's costs for ${instance.name}: +$${(result.deltaCostCents / 100).toFixed(4)}`,
        );
      }
    }

    // Update lastCostSyncDate only for completed days
    if (latestCompletedDate && latestCompletedDate !== lastSyncDate) {
      await this.botInstanceRepo.update(instance.id, {
        lastCostSyncDate: latestCompletedDate,
      });
    }

    this.logger.debug(
      `Synced ${eventsProcessed} cost event(s) for ${instance.name}`,
    );
    return eventsProcessed;
  }

  private extractProviderModel(desiredManifest: string): {
    provider: string;
    model: string;
  } {
    if (!desiredManifest || desiredManifest.trim() === "") {
      this.logger.warn("Empty desiredManifest provided");
      return { provider: "unknown", model: "unknown" };
    }

    try {
      const manifest = JSON.parse(desiredManifest);
      const primary =
        manifest?.spec?.openclawConfig?.agents?.defaults?.model?.primary;
      if (typeof primary === "string" && primary.includes("/")) {
        const slashIdx = primary.indexOf("/");
        const provider = primary.substring(0, slashIdx).trim();
        const model = primary.substring(slashIdx + 1).trim();

        if (!provider || !model) {
          this.logger.warn(`Invalid provider/model format: ${primary}`);
          return { provider: "unknown", model: "unknown" };
        }

        return { provider, model };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.warn(`Failed to parse manifest for provider/model: ${message}`);
    }
    return { provider: "unknown", model: "unknown" };
  }
}
