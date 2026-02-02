import * as fs from "fs";
import * as path from "path";
import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@clawster/database";
import * as crypto from "crypto";
import { DelegationSkillGeneratorService } from "../bot-teams/delegation-skill-generator.service";

@Injectable()
export class DelegationSkillWriterService {
  private readonly logger = new Logger(DelegationSkillWriterService.name);

  constructor(
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
    const teamMembers = await prisma.botTeamMember.findMany({
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
    const bot = await prisma.botInstance.findUnique({
      where: { id: instanceId },
      select: { id: true, name: true },
    });

    if (!bot) {
      this.logger.warn(`Bot ${instanceId} not found — skipping delegation skill write`);
      return { written: false, memberCount: 0 };
    }

    // 4. Auto-generate an A2A API key for delegation
    const apiKey = await this.ensureDelegationApiKey(instanceId);

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

  /**
   * Ensure a delegation API key exists for the bot.
   * Revokes any previous delegation keys and generates a fresh one.
   * Returns the plaintext key.
   */
  private async ensureDelegationApiKey(botInstanceId: string): Promise<string> {
    const DELEGATION_LABEL = "clawster-delegation-auto";

    // Revoke any previous delegation keys
    await prisma.a2aApiKey.updateMany({
      where: {
        botInstanceId,
        label: DELEGATION_LABEL,
        isActive: true,
      },
      data: { isActive: false },
    });

    // Generate new key
    const randomBytes = crypto.randomBytes(32);
    const encoded = randomBytes.toString("base64url").replace(/[=]/g, "");
    const key = `mh_a2a_${encoded}`;
    const keyHash = crypto.createHash("sha256").update(key).digest("hex");
    const keyPrefix = key.slice(0, 12) + "...";

    await prisma.a2aApiKey.create({
      data: {
        keyHash,
        keyPrefix,
        label: DELEGATION_LABEL,
        botInstanceId,
      },
    });

    this.logger.debug(`Generated delegation API key ${keyPrefix} for bot ${botInstanceId}`);

    return key;
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
