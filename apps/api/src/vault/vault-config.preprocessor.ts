import { Injectable, Logger } from "@nestjs/common";
import type { OpenClawManifest } from "@clawster/core";
import type {
  IManifestPreprocessor,
  PreprocessorContext,
  PreprocessorResult,
} from "../reconciler/interfaces";

/**
 * VaultConfigPreprocessor — injects vault-related config into every bot's manifest.
 *
 * Single Responsibility: Ensure every bot has tool permissions and skill paths
 * for the vault skill. Runs unconditionally (unlike delegation which is conditional).
 *
 * Priority 40 — runs before delegation (50) so skill paths are set up first.
 */
@Injectable()
export class VaultConfigPreprocessor implements IManifestPreprocessor {
  readonly name = "vault-config";
  readonly priority = 40;

  private readonly logger = new Logger(VaultConfigPreprocessor.name);

  async process(
    manifest: OpenClawManifest,
    context: PreprocessorContext,
  ): Promise<PreprocessorResult> {
    this.injectVaultConfig(manifest);

    this.logger.debug(`Injected vault config for ${context.instance.id}`);

    return {
      modified: true,
      description: "Vault config injected (skill path + runtime tools)",
    };
  }

  private injectVaultConfig(manifest: OpenClawManifest): void {
    const cfg = manifest.spec.openclawConfig as Record<string, unknown>;

    // Add group:runtime so the bot can exec vault.js
    const tools = (cfg.tools ?? {}) as Record<string, unknown>;
    const existingAllow = (tools.allow ?? []) as string[];
    if (existingAllow.length > 0) {
      if (!existingAllow.includes("group:runtime")) {
        tools.allow = [...existingAllow, "group:runtime"];
      }
    } else {
      const existingAlsoAllow = (tools.alsoAllow ?? []) as string[];
      if (!existingAlsoAllow.includes("group:runtime")) {
        tools.alsoAllow = [...existingAlsoAllow, "group:runtime"];
      }
    }
    cfg.tools = tools;

    // Add skills.load.extraDirs so OpenClaw discovers the vault skill
    const skills = (cfg.skills ?? {}) as Record<string, unknown>;
    const load = (skills.load ?? {}) as Record<string, unknown>;
    const extraDirs = (load.extraDirs ?? []) as string[];
    const vaultSkillPath = "/home/node/.openclaw/skills";
    if (!extraDirs.includes(vaultSkillPath)) {
      load.extraDirs = [...extraDirs, vaultSkillPath];
    }
    skills.load = load;
    cfg.skills = skills;
  }
}
