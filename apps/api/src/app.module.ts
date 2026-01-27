import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { configValidationSchema } from "./config/validation";
import { InstancesModule } from "./instances/instances.module";
import { BotInstancesModule } from "./bot-instances/bot-instances.module";
import { FleetModule } from "./fleets/fleets.module";
import { ManifestsModule } from "./manifests/manifests.module";
import { TemplatesModule } from "./templates/templates.module";
import { AuditModule } from "./audit/audit.module";
import { ReconcilerModule } from "./reconciler/reconciler.module";
import { MetricsModule } from "./metrics/metrics.module";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validationSchema: configValidationSchema,
      validationOptions: {
        allowUnknown: true,
        abortEarly: false,
      },
    }),
    ScheduleModule.forRoot(),
    HealthModule,
    InstancesModule,
    BotInstancesModule,
    FleetModule,
    ManifestsModule,
    TemplatesModule,
    AuditModule,
    ReconcilerModule,
    MetricsModule,
  ],
})
export class AppModule {}