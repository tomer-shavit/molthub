import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { prisma } from "@clawster/database";
import { OpenClawHealthService } from "../health/openclaw-health.service";
import { CostsService } from "./costs.service";
import { CreateCostEventDto } from "./costs.dto";

@Injectable()
export class CostCollectionService {
  private readonly logger = new Logger(CostCollectionService.name);
  private running = false;

  constructor(
    private readonly openClawHealthService: OpenClawHealthService,
    private readonly costsService: CostsService,
  ) {}

  @Cron("0 */1 * * *")
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
    const instances = await prisma.botInstance.findMany({
      where: {
        status: "RUNNING",
        gatewayConnection: { isNot: null },
      },
      select: {
        id: true,
        name: true,
        desiredManifest: true,
        lastCostSyncDate: true,
      },
    });

    if (instances.length === 0) {
      this.logger.debug("No running instances with gateway connections");
      return;
    }

    this.logger.log(`Syncing costs for ${instances.length} instance(s)`);
    let totalEvents = 0;

    for (const instance of instances) {
      try {
        const count = await this.syncInstance(instance);
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
        `Cost collection complete: ${totalEvents} event(s) recorded`,
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

    const newEntries = usage.daily.filter((entry) => {
      if (entry.date === todayStr) return false;
      if (lastSyncDate && entry.date <= lastSyncDate) return false;
      if (entry.totalCost === 0 && entry.totalTokens === 0) return false;
      return true;
    });

    const entriesToProcess = newEntries.slice(-30);

    if (entriesToProcess.length === 0) {
      return 0;
    }

    let latestDate = lastSyncDate;
    let eventsCreated = 0;

    for (const entry of entriesToProcess) {
      const costCents = Math.round(entry.totalCost * 100);

      const dto = new CreateCostEventDto();
      dto.instanceId = instance.id;
      dto.provider = provider;
      dto.model = model;
      dto.inputTokens = entry.input;
      dto.outputTokens = entry.output;
      dto.costCents = costCents;

      await this.costsService.recordCostEvent(dto);
      eventsCreated++;

      if (!latestDate || entry.date > latestDate) {
        latestDate = entry.date;
      }
    }

    if (latestDate && latestDate !== lastSyncDate) {
      await prisma.botInstance.update({
        where: { id: instance.id },
        data: { lastCostSyncDate: latestDate },
      });
    }

    this.logger.debug(
      `Synced ${eventsCreated} cost event(s) for ${instance.name}`,
    );
    return eventsCreated;
  }

  private extractProviderModel(desiredManifest: string): {
    provider: string;
    model: string;
  } {
    try {
      const manifest = JSON.parse(desiredManifest);
      const primary =
        manifest?.spec?.openclawConfig?.agents?.defaults?.model?.primary;
      if (typeof primary === "string" && primary.includes("/")) {
        const slashIdx = primary.indexOf("/");
        return {
          provider: primary.substring(0, slashIdx),
          model: primary.substring(slashIdx + 1),
        };
      }
    } catch {
      // ignore parse errors
    }
    return { provider: "unknown", model: "unknown" };
  }
}