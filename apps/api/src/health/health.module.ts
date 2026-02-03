import { Module, forwardRef } from "@nestjs/common";
import { HealthService } from "./health.service";
import { HealthController } from "./health.controller";
import { OpenClawHealthService } from "./openclaw-health.service";
import { HealthAggregatorService } from "./health-aggregator.service";
import { DiagnosticsService } from "./diagnostics.service";
import { AlertingService } from "./alerting.service";
import { LogStreamingGateway } from "./log-streaming.gateway";
import { AlertsModule } from "../alerts/alerts.module";
import { NotificationChannelsModule } from "../notification-channels/notification-channels.module";

@Module({
  imports: [
    forwardRef(() => AlertsModule),
    NotificationChannelsModule,
  ],
  controllers: [HealthController],
  providers: [
    HealthService,
    OpenClawHealthService,
    HealthAggregatorService,
    DiagnosticsService,
    AlertingService,
    LogStreamingGateway,
  ],
  exports: [
    HealthService,
    OpenClawHealthService,
    HealthAggregatorService,
    DiagnosticsService,
    AlertingService,
  ],
})
export class HealthModule {}
