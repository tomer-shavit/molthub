import { Module } from "@nestjs/common";
import { DatabaseModule } from "@clawster/database";
import { VaultService } from "./vault.service";
import { VaultController } from "./vault.controller";
import { VaultSkillGeneratorService } from "./vault-skill-generator.service";
import { VaultSkillWriterService } from "./vault-skill-writer.service";
import { VaultConfigPreprocessor } from "./vault-config.preprocessor";
import { VaultApiKeyGuard } from "./vault-api-key.guard";
import { A2aModule } from "../a2a/a2a.module";
import { CredentialEncryptionService } from "../connectors/credential-encryption.service";

@Module({
  imports: [DatabaseModule, A2aModule],
  controllers: [VaultController],
  providers: [
    CredentialEncryptionService,
    VaultService,
    VaultSkillGeneratorService,
    VaultSkillWriterService,
    VaultConfigPreprocessor,
    VaultApiKeyGuard,
  ],
  exports: [
    VaultService,
    VaultSkillWriterService,
    VaultConfigPreprocessor,
  ],
})
export class VaultModule {}
