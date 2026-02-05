import * as fs from "fs";
import * as path from "path";
import { Injectable, Inject, Logger } from "@nestjs/common";
import {
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
  PRISMA_CLIENT,
} from "@clawster/database";
import type { PrismaClient } from "@clawster/database";
import { DelegationSkillGeneratorService } from "../bot-teams/delegation-skill-generator.service";
import {
  A2A_API_KEY_SERVICE,
  type IA2aApiKeyService,
} from "./interfaces";

@Injectable()
export class DelegationSkillWriterService {
  private readonly logger = new Logger(DelegationSkillWriterService.name);

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(A2A_API_KEY_SERVICE) private readonly apiKeyService: IA2aApiKeyService,
    private readonly skillGenerator: DelegationSkillGeneratorService,
  ) {}

  /**
   * Write delegation skill files to a bot's config directory.
   * Called during reconcile after provision/update succeeds.
   *
   * @param instanceId - The bot instance ID
   * @param configPath - The host filesystem path where config is stored (e.g., /var/openclaw/bot-name)
   * @param apiUrl - The Clawster API URL (e.g., http://host.docker.internal:4000)
   */
  async writeDelegationSkills(
    instanceId: string,
    configPath: string,
    apiUrl: string,
  ): Promise<{ written: boolean; memberCount: number }> {
    // 1. Query team members for this bot
    const teamMembers = await this.prisma.botTeamMember.findMany({
      where: { ownerBotId: instanceId, enabled: true },
      include: {
        memberBot: { select: { id: true, name: true } },
      },
    });

    const skillDir = path.join(configPath, "skills", "clawster-delegation");

    // 2. If no team members, clean up any existing skill files
    if (teamMembers.length === 0) {
      this.cleanupSkillDir(skillDir);
      return { written: false, memberCount: 0 };
    }

    // 3. Get bot info
    const bot = await this.botInstanceRepo.findById(instanceId);

    if (!bot) {
      this.logger.warn(`Bot ${instanceId} not found — skipping delegation skill write`);
      return { written: false, memberCount: 0 };
    }

    // 4. Auto-generate an A2A API key for delegation
    const apiKey = await this.apiKeyService.ensureDelegationApiKey(instanceId);

    // 5. Generate skill files
    const { skillMd, delegateJs } = this.skillGenerator.generateSkillFiles(
      bot,
      teamMembers.map((tm) => ({
        memberBot: tm.memberBot,
        role: tm.role,
        description: tm.description,
      })),
      apiUrl,
      apiKey,
    );

    // 6. Write to disk
    fs.mkdirSync(skillDir, { recursive: true });
    fs.writeFileSync(path.join(skillDir, "SKILL.md"), skillMd, "utf8");
    fs.writeFileSync(path.join(skillDir, "delegate.js"), delegateJs, "utf8");

    this.logger.log(
      `Wrote delegation skill for "${bot.name}" with ${teamMembers.length} team member(s) to ${skillDir}`,
    );

    return { written: true, memberCount: teamMembers.length };
  }

  private cleanupSkillDir(skillDir: string): void {
    try {
      if (fs.existsSync(skillDir)) {
        fs.rmSync(skillDir, { recursive: true, force: true });
        this.logger.debug(`Cleaned up delegation skill dir: ${skillDir}`);
      }
    } catch (err) {
      this.logger.warn(`Failed to clean up skill dir ${skillDir}: ${err}`);
    }
  }
}
