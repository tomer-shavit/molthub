import { Module } from "@nestjs/common";
import { DatabaseModule } from "@clawster/database";
import { GatewayManager } from "@clawster/gateway-client";
import { ReconcilerService } from "./reconciler.service";
import { ReconcilerController } from "./reconciler.controller";
import { ConfigGeneratorService } from "./config-generator.service";
import { LifecycleManagerService } from "./lifecycle-manager.service";
import { DriftDetectionService } from "./drift-detection.service";
import { DelegationSkillWriterService } from "./delegation-skill-writer.service";
import { DelegationSkillGeneratorService } from "../bot-teams/delegation-skill-generator.service";
import { ReconcilerScheduler } from "./reconciler.scheduler";
import { SecurityAuditModule } from "../security/security-audit.module";
import { ProvisioningModule } from "../provisioning/provisioning.module";
import {
  GATEWAY_MANAGER,
  DEPLOYMENT_TARGET_RESOLVER,
  GATEWAY_CONNECTION_SERVICE,
  A2A_API_KEY_SERVICE,
} from "./interfaces";
import {
  ManifestParserService,
  DoctorService,
  EventLoggerService,
  DeploymentTargetResolverService,
  GatewayConnectionService,
  A2aApiKeyService,
} from "./services";
import {
  PreprocessorChainService,
  DelegationConfigPreprocessor,
} from "./preprocessors";

@Module({
  imports: [DatabaseModule, SecurityAuditModule, ProvisioningModule],
  controllers: [ReconcilerController],
  providers: [
    // DIP: Inject GatewayManager via factory provider
    {
      provide: GATEWAY_MANAGER,
      useFactory: () => new GatewayManager(),
    },
    // Extracted single-responsibility services (Phase 1)
    ManifestParserService,
    DoctorService,
    EventLoggerService,
    // Manifest preprocessors
    DelegationConfigPreprocessor,
    PreprocessorChainService,
    // DIP: Extracted services injected via interface tokens (Phase 2)
    {
      provide: DEPLOYMENT_TARGET_RESOLVER,
      useClass: DeploymentTargetResolverService,
    },
    {
      provide: GATEWAY_CONNECTION_SERVICE,
      useClass: GatewayConnectionService,
    },
    {
      provide: A2A_API_KEY_SERVICE,
      useClass: A2aApiKeyService,
    },
    // Core services
    ConfigGeneratorService,
    LifecycleManagerService,
    DriftDetectionService,
    DelegationSkillWriterService,
    DelegationSkillGeneratorService,
    ReconcilerService,
    ReconcilerScheduler,
  ],
  exports: [
    ReconcilerService,
    ConfigGeneratorService,
    LifecycleManagerService,
    DriftDetectionService,
    ManifestParserService,
    DoctorService,
    DEPLOYMENT_TARGET_RESOLVER,
    GATEWAY_CONNECTION_SERVICE,
    A2A_API_KEY_SERVICE,
    GATEWAY_MANAGER,
  ],
})
export class ReconcilerModule {}
