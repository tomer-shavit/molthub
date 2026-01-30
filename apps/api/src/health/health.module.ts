import { Module, forwardRef } from "@nestjs/common";
import { HealthService } from "./health.service";
import { HealthController } from "./health.controller";
import { MoltbotHealthService } from "./moltbot-health.service";
import { HealthAggregatorService } from "./health-aggregator.service";
import { DiagnosticsService } from "./diagnostics.service";
import { AlertingService } from "./alerting.service";
import { LogStreamingGateway } from "./log-streaming.gateway";
import { AlertsModule } from "../alerts/alerts.module";

@Module({
  imports: [forwardRef(() => AlertsModule)],
  controllers: [HealthController],
  providers: [
    HealthService,
    MoltbotHealthService,
    HealthAggregatorService,
    DiagnosticsService,
    AlertingService,
    LogStreamingGateway,
  ],
  exports: [
    HealthService,
    MoltbotHealthService,
    HealthAggregatorService,
    DiagnosticsService,
    AlertingService,
  ],
})
export class HealthModule {}
