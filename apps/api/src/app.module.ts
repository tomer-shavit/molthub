import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ScheduleModule } from "@nestjs/schedule";
import { InstancesModule } from "./instances/instances.module";
import { ManifestsModule } from "./manifests/manifests.module";
import { TemplatesModule } from "./templates/templates.module";
import { AuditModule } from "./audit/audit.module";
import { ReconcilerModule } from "./reconciler/reconciler.module";
import { MetricsModule } from "./metrics/metrics.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
    InstancesModule,
    ManifestsModule,
    TemplatesModule,
    AuditModule,
    ReconcilerModule,
    MetricsModule,
  ],
})
export class AppModule {}