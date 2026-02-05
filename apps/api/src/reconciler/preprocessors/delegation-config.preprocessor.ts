import { Injectable, Inject, Logger } from "@nestjs/common";
import { PRISMA_CLIENT } from "@clawster/database";
import type { PrismaClient } from "@clawster/database";
import type { OpenClawManifest } from "@clawster/core";
import type {
  IManifestPreprocessor,
  PreprocessorContext,
  PreprocessorResult,
} from "../interfaces";

/**
 * DelegationConfigPreprocessor — injects delegation-related config
 * into manifests for bots that have team members.
 *
 * Single Responsibility: Add tool permissions and skill paths for delegation.
 *
 * When a bot has team members (delegation targets), this preprocessor:
 * 1. Adds `group:runtime` to tools.allow/alsoAllow for exec permissions
 * 2. Adds the delegation skill directory to skills.load.extraDirs
 */
@Injectable()
export class DelegationConfigPreprocessor implements IManifestPreprocessor {
  readonly name = "delegation-config";
  readonly priority = 50; // Run early to ensure delegation is set up

  private readonly logger = new Logger(DelegationConfigPreprocessor.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  async process(
    manifest: OpenClawManifest,
    context: PreprocessorContext,
  ): Promise<PreprocessorResult> {
    const { instance } = context;

    // Check for team members
    const teamMembers = await this.prisma.botTeamMember.findMany({
      where: { ownerBotId: instance.id, enabled: true },
    });

    if (teamMembers.length === 0) {
      return { modified: false };
    }

    this.injectDelegationConfig(manifest);

    this.logger.debug(
      `Injected delegation config for ${instance.id} (${teamMembers.length} team members)`,
    );

    return {
      modified: true,
      description: `Delegation config injected (${teamMembers.length} team members)`,
    };
  }

  /**
   * Inject delegation-related config into the manifest so the generated
   * OpenClaw config includes tools.alsoAllow for exec and skills.load.extraDirs
   * pointing to the delegation skill directory.
   */
  private injectDelegationConfig(manifest: OpenClawManifest): void {
    const cfg = manifest.spec.openclawConfig as Record<string, unknown>;

    // Add group:runtime so the bot can exec the delegation script.
    // OpenClaw does NOT allow both tools.allow and tools.alsoAllow at the same
    // time. If the user already has tools.allow, merge into it. Otherwise use
    // tools.alsoAllow (additive on top of the profile).
    const tools = (cfg.tools ?? {}) as Record<string, unknown>;
    const existingAllow = (tools.allow ?? []) as string[];
    if (existingAllow.length > 0) {
      // Merge into existing allow list
      if (!existingAllow.includes("group:runtime")) {
        tools.allow = [...existingAllow, "group:runtime"];
      }
    } else {
      // Use alsoAllow (additive) — doesn't replace the profile's base allowlist
      const existingAlsoAllow = (tools.alsoAllow ?? []) as string[];
      if (!existingAlsoAllow.includes("group:runtime")) {
        tools.alsoAllow = [...existingAlsoAllow, "group:runtime"];
      }
    }
    cfg.tools = tools;

    // Add skills.load.extraDirs so OpenClaw discovers the delegation skill
    const skills = (cfg.skills ?? {}) as Record<string, unknown>;
    const load = (skills.load ?? {}) as Record<string, unknown>;
    const extraDirs = (load.extraDirs ?? []) as string[];
    const delegationSkillPath = "/home/node/.openclaw/skills";
    if (!extraDirs.includes(delegationSkillPath)) {
      load.extraDirs = [...extraDirs, delegationSkillPath];
    }
    skills.load = load;
    cfg.skills = skills;
  }
}
