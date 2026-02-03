import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule, ThrottlerGuard } from "@nestjs/throttler";
import { ScheduleModule } from "@nestjs/schedule";
import { configValidationSchema } from "./config/validation";
import { BotInstancesModule } from "./bot-instances/bot-instances.module";
import { FleetModule } from "./fleets/fleets.module";
import { ProfilesModule } from "./profiles/profiles.module";
import { OverlaysModule } from "./overlays/overlays.module";
import { PolicyPacksModule } from "./policy-packs/policy-packs.module";
import { ConnectorsModule } from "./connectors/connectors.module";
import { ChangeSetsModule } from "./change-sets/change-sets.module";
import { TracesModule } from "./traces/traces.module";
import { TemplatesModule } from "./templates/templates.module";
import { AuditModule } from "./audit/audit.module";
import { ReconcilerModule } from "./reconciler/reconciler.module";
import { MetricsModule } from "./metrics/metrics.module";
import { HealthModule } from "./health/health.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { SkillPacksModule } from "./skill-packs/skill-packs.module";
import { ChannelsModule } from "./channels/channels.module";
import { SecurityAuditModule } from "./security/security-audit.module";
import { SecurityModule } from "./security/security.module";
import { OnboardingModule } from "./onboarding/onboarding.module";
import { SlosModule } from "./slos/slos.module";
import { CostsModule } from "./costs/costs.module";
import { AlertsModule } from "./alerts/alerts.module";
import { ProvisioningModule } from "./provisioning/provisioning.module";
import { DebugModule } from "./debug/debug.module";
import { UserContextModule } from "./user-context/user-context.module";
import { AgentEvolutionModule } from "./agent-evolution/agent-evolution.module";
import { PairingModule } from "./pairing/pairing.module";
import { NotificationChannelsModule } from "./notification-channels/notification-channels.module";
import { BotRoutingModule } from "./bot-routing/bot-routing.module";
import { BotTeamsModule } from "./bot-teams/bot-teams.module";
import { A2aModule } from "./a2a/a2a.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
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
    HealthModule,
    BotInstancesModule,
    FleetModule,
    ProfilesModule,
    OverlaysModule,
    PolicyPacksModule,
    ConnectorsModule,
    ChangeSetsModule,
    TracesModule,
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
    SlosModule,
    CostsModule,
    AlertsModule,
    ProvisioningModule,
    DebugModule,
    UserContextModule,
    AgentEvolutionModule,
    PairingModule,
    NotificationChannelsModule,
    BotRoutingModule,
    BotTeamsModule,
    A2aModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}