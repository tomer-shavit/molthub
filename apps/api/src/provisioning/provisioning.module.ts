import { Module, OnModuleInit } from "@nestjs/common";
import { ProvisioningEventsService } from "./provisioning-events.service";
import { ProvisioningEventsGateway } from "./provisioning-events.gateway";
import { ProvisioningController } from "./provisioning.controller";

@Module({
  controllers: [ProvisioningController],
  providers: [ProvisioningEventsService, ProvisioningEventsGateway],
  exports: [ProvisioningEventsService, ProvisioningEventsGateway],
})
export class ProvisioningModule implements OnModuleInit {
  constructor(
    private readonly eventsService: ProvisioningEventsService,
    private readonly eventsGateway: ProvisioningEventsGateway,
  ) {}

  onModuleInit(): void {
    this.eventsService.setGateway(this.eventsGateway);
    this.eventsGateway.setRecentLogsProvider((instanceId) =>
      this.eventsService.getRecentLogs(instanceId),
    );
  }
}
