import { Module, forwardRef } from "@nestjs/common";
import { AlertsController } from "./alerts.controller";
import { AlertsService } from "./alerts.service";
import { RemediationService } from "./remediation.service";
import { ReconcilerModule } from "../reconciler/reconciler.module";
import { HealthModule } from "../health/health.module";

@Module({
  imports: [
    ReconcilerModule,
    forwardRef(() => HealthModule),
  ],
  controllers: [AlertsController],
  providers: [AlertsService, RemediationService],
  exports: [AlertsService, RemediationService],
})
export class AlertsModule {}
