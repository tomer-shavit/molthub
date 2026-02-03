import { Controller, Get, Param } from "@nestjs/common";
import { prisma } from "@clawster/database";
import { ProvisioningEventsService } from "./provisioning-events.service";

@Controller("instances")
export class ProvisioningController {
  constructor(
    private readonly provisioningEvents: ProvisioningEventsService,
  ) {}

  @Get(":id/provisioning/status")
  async getProvisioningStatus(@Param("id") instanceId: string) {
    const progress = this.provisioningEvents.getProgress(instanceId);
    if (progress) {
      return progress;
    }

    // No in-memory progress — check the DB for instance status.
    // This handles cases where the reconciler fails before provisioning events start.
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
      select: { status: true, lastError: true },
    });

    if (instance?.status === "ERROR") {
      return {
        instanceId,
        status: "error",
        currentStep: "",
        steps: [],
        startedAt: new Date().toISOString(),
        error: instance.lastError || "Deployment failed before provisioning started",
      };
    }

    return { instanceId, status: "unknown", steps: [] };
  }
}
