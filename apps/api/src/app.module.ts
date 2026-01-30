import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { configValidationSchema } from "./config/validation";
import { InstancesModule } from "./instances/instances.module";
import { BotInstancesModule } from "./bot-instances/bot-instances.module";
import { FleetModule } from "./fleets/fleets.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { OverlaysModule } from "./overlays/overlays.module";
import { PolicyPacksModule } from "./policy-packs/policy-packs.module";
import { ConnectorsModule } from "./connectors/connectors.module";
import { ChangeSetsModule } from "./change-sets/change-sets.module";
import { TracesModule } from "./traces/traces.module";
import { ManifestsModule } from "./manifests/manifests.module";
import { TemplatesModule } from "./templates/templates.module";
import { AuditModule } from "./audit/audit.module";
import { ReconcilerModule } from "./reconciler/reconciler.module";
import { MetricsModule } from "./metrics/metrics.module";
import { HealthModule } from "./health/health.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { SkillPacksModule } from "./skill-packs/skill-packs.module";
import { ChannelsModule } from "./channels/channels.module";
import { AuthModule } from "./auth/auth.module";
import { SecurityAuditModule } from "./security/security-audit.module";
import { SecurityModule } from "./security/security.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { JwtAuthGuard } from "./auth/jwt-auth.guard";

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
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 100,
    }]),
    AuthModule,
    HealthModule,
    InstancesModule,
    BotInstancesModule,
    FleetModule,
    ProfilesModule,
    OverlaysModule,
    PolicyPacksModule,
    ConnectorsModule,
    ChangeSetsModule,
    TracesModule,
    ManifestsModule,
    TemplatesModule,
    AuditModule,
    ReconcilerModule,
    MetricsModule,
    DashboardModule,
    SkillPacksModule,
    ChannelsModule,
    SecurityAuditModule,
    SecurityModule,
    OnboardingModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}