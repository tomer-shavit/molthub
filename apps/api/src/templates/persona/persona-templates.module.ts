import { Module } from "@nestjs/common";
import { DatabaseModule } from "@clawster/database";
import { PersonaTemplatesController } from "./persona-templates.controller";
import { TemplateOrchestratorService } from "./template-orchestrator.service";
import { ConfigInjectorService } from "./config-injector.service";
import { CronInjectorService } from "./cron-injector.service";
import { SecretResolverService } from "./secret-resolver.service";
import {
  CONFIG_INJECTOR,
  CRON_INJECTOR,
  SECRET_RESOLVER,
} from "./interfaces";
import { ReconcilerModule } from "../../reconciler/reconciler.module";
import { VaultModule } from "../../vault/vault.module";

@Module({
  imports: [
    DatabaseModule,
    ReconcilerModule, // For GATEWAY_CONNECTION_SERVICE
    VaultModule, // For VaultService injection into SecretResolverService
  ],
  controllers: [PersonaTemplatesController],
  providers: [
    TemplateOrchestratorService,
    {
      provide: CONFIG_INJECTOR,
      useClass: ConfigInjectorService,
    },
    {
      provide: CRON_INJECTOR,
      useClass: CronInjectorService,
    },
    {
      provide: SECRET_RESOLVER,
      useClass: SecretResolverService,
    },
  ],
  exports: [
    TemplateOrchestratorService,
    CONFIG_INJECTOR,
    CRON_INJECTOR,
    SECRET_RESOLVER,
  ],
})
export class PersonaTemplatesModule {}
