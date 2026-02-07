import * as fs from "fs";
import * as path from "path";
import { Injectable, Logger } from "@nestjs/common";
import { A2aApiKeyService } from "../a2a/a2a-api-key.service";
import { VaultSkillGeneratorService } from "./vault-skill-generator.service";

const VAULT_API_KEY_LABEL = "clawster-vault-auto";

/**
 * VaultSkillWriterService — writes vault skill files to a bot's config directory.
 *
 * Single Responsibility: Generate API key, generate skill content, write to disk.
 *
 * Pattern from DelegationSkillWriterService but always writes (unconditional).
 */
@Injectable()
export class VaultSkillWriterService {
  private readonly logger = new Logger(VaultSkillWriterService.name);

  constructor(
    private readonly apiKeyService: A2aApiKeyService,
    private readonly skillGenerator: VaultSkillGeneratorService,
  ) {}

  /**
   * Write vault skill files to a bot's config directory.
   * Called during reconcile for EVERY bot instance.
   *
   * @param instanceId - The bot instance ID
   * @param configPath - The host filesystem path (e.g., /var/openclaw/bot-name)
   * @param apiUrl - The Clawster API URL (e.g., http://host.docker.internal:4000)
   */
  async writeVaultSkills(
    instanceId: string,
    configPath: string,
    apiUrl: string,
  ): Promise<{ written: boolean }> {
    // 1. Generate a vault-specific API key (revokes any previous vault keys)
    const { key: apiKey } = await this.apiKeyService.generate(instanceId, VAULT_API_KEY_LABEL);

    // 2. Generate skill file content
    const { skillMd, vaultJs } = this.skillGenerator.generateSkillFiles(
      instanceId,
      apiUrl,
      apiKey,
    );

    // 3. Write to disk
    const skillDir = path.join(configPath, "skills", "clawster-vault");
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd, { encoding: "utf8", mode: 0o644 });
    fs.writeFileSync(path.join(skillDir, "vault.js"), vaultJs, { encoding: "utf8", mode: 0o600 });

    this.logger.log(`Wrote vault skill for instance ${instanceId} to ${skillDir}`);

    return { written: true };
  }
}
