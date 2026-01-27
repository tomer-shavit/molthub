import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { InstancesModule } from "./instances/instances.module";
import { ManifestsModule } from "./manifests/manifests.module";
import { TemplatesModule } from "./templates/templates.module";
import { AuditModule } from "./audit/audit.module";
import { ReconcilerModule } from "./reconciler/reconciler.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    InstancesModule,
    ManifestsModule,
    TemplatesModule,
    AuditModule,
    ReconcilerModule,
  ],
})
export class AppModule {}