import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma, Prisma } from '@molthub/database';
import { CreateSkillPackDto, UpdateSkillPackDto, AttachSkillPackDto, BulkAttachSkillPackDto } from './skill-packs.dto';
import { SkillPackResponse, SkillPackWithBots, BotAttachmentResponse, BulkAttachResult, SyncResult } from './skill-packs.types';
import { SkillVerificationService } from '../security/skill-verification.service';

@Injectable()
export class SkillPacksService {
  private readonly logger = new Logger(SkillPacksService.name);

  constructor(
    private readonly skillVerification: SkillVerificationService,
  ) {}
  async create(workspaceId: string, userId: string, dto: CreateSkillPackDto): Promise<SkillPackResponse> {
    // Check for duplicate name
    const existing = await prisma.skillPack.findFirst({
      where: { workspaceId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`SkillPack '${dto.name}' already exists`);
    }

    const skillPack = await prisma.skillPack.create({
      data: {
        ...dto,
        workspaceId,
        createdBy: userId,
        skills: (dto.skills || []) as Prisma.InputJsonValue,
        mcps: (dto.mcps || []) as Prisma.InputJsonValue,
        envVars: dto.envVars || {},
      },
    });

    // Warn about unverified skills from non-bundled sources
    const skills = (dto.skills || []) as Array<Record<string, unknown>>;
    const unverifiedSkills = skills.filter(
      (s) => s.source && s.source !== "bundled",
    );
    if (unverifiedSkills.length > 0) {
      this.logger.warn(
        `SkillPack '${dto.name}' contains ${unverifiedSkills.length} skill(s) from non-bundled sources that are unverified: ${unverifiedSkills.map((s) => s.name || s.source).join(", ")}`,
      );
    }

    return skillPack as SkillPackResponse;
  }

  async findAll(workspaceId: string): Promise<SkillPackResponse[]> {
    return prisma.skillPack.findMany({
      where: { workspaceId },
      include: {
        _count: {
          select: { botInstances: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    }) as Promise<SkillPackResponse[]>;
  }

  async findOne(workspaceId: string, id: string): Promise<SkillPackWithBots> {
    const skillPack = await prisma.skillPack.findFirst({
      where: { id, workspaceId },
      include: {
        botInstances: {
          include: {
            botInstance: {
              select: {
                id: true,
                name: true,
                status: true,
                health: true,
              },
            },
          },
        },
      },
    });

    if (!skillPack) {
      throw new NotFoundException(`SkillPack ${id} not found`);
    }

    return skillPack as SkillPackWithBots;
  }

  async update(workspaceId: string, id: string, dto: UpdateSkillPackDto): Promise<SkillPackResponse> {
    await this.findOne(workspaceId, id);

    // Check name uniqueness if changing name
    if (dto.name && dto.name !== (await prisma.skillPack.findFirst({ where: { id } }))?.name) {
      const existing = await prisma.skillPack.findFirst({
        where: { workspaceId, name: dto.name },
      });
      if (existing) {
        throw new ConflictException(`SkillPack '${dto.name}' already exists`);
      }
    }

    // Increment version when content changes
    const versionIncrement = dto.skills || dto.mcps || dto.envVars ? 1 : 0;

    const { skills, mcps, envVars, ...restDto } = dto;
    return prisma.skillPack.update({
      where: { id },
      data: {
        ...restDto,
        ...(skills && { skills: skills as Prisma.InputJsonValue }),
        ...(mcps && { mcps: mcps as Prisma.InputJsonValue }),
        ...(envVars && { envVars: envVars as Prisma.InputJsonValue }),
        version: { increment: versionIncrement },
        updatedAt: new Date(),
      },
    }) as Promise<SkillPackResponse>;
  }

  async remove(workspaceId: string, id: string): Promise<SkillPackResponse> {
    await this.findOne(workspaceId, id);

    return prisma.skillPack.delete({
      where: { id },
    }) as Promise<SkillPackResponse>;
  }

  async attachToBot(workspaceId: string, skillPackId: string, dto: AttachSkillPackDto): Promise<BotAttachmentResponse> {
    // Verify skill pack exists
    await this.findOne(workspaceId, skillPackId);

    // Verify bot exists
    const bot = await prisma.botInstance.findFirst({
      where: { id: dto.botInstanceId, workspaceId },
    });

    if (!bot) {
      throw new NotFoundException(`Bot ${dto.botInstanceId} not found`);
    }

    // Check if already attached
    const existing = await prisma.botInstanceSkillPack.findUnique({
      where: {
        botInstanceId_skillPackId: {
          botInstanceId: dto.botInstanceId,
          skillPackId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(`SkillPack already attached to this bot`);
    }

    return prisma.botInstanceSkillPack.create({
      data: {
        botInstanceId: dto.botInstanceId,
        skillPackId,
        envOverrides: dto.envOverrides || {},
      },
    }) as Promise<BotAttachmentResponse>;
  }

  async bulkAttach(workspaceId: string, skillPackId: string, dto: BulkAttachSkillPackDto): Promise<BulkAttachResult> {
    // Verify skill pack exists
    await this.findOne(workspaceId, skillPackId);

    const results: BulkAttachResult = {
      successful: [],
      failed: [],
    };

    for (const botInstanceId of dto.botInstanceIds) {
      try {
        // Verify bot exists
        const bot = await prisma.botInstance.findFirst({
          where: { id: botInstanceId, workspaceId },
        });

        if (!bot) {
          results.failed.push({ botId: botInstanceId, error: 'Bot not found' });
          continue;
        }

        // Check if already attached
        const existing = await prisma.botInstanceSkillPack.findUnique({
          where: {
            botInstanceId_skillPackId: {
              botInstanceId,
              skillPackId,
            },
          },
        });

        if (existing) {
          results.failed.push({ botId: botInstanceId, error: 'Already attached' });
          continue;
        }

        await prisma.botInstanceSkillPack.create({
          data: {
            botInstanceId,
            skillPackId,
            envOverrides: dto.envOverrides || {},
          },
        });

        results.successful.push(botInstanceId);
      } catch (error) {
        results.failed.push({ botId: botInstanceId, error: (error as Error).message });
      }
    }

    return results;
  }

  async detachFromBot(workspaceId: string, skillPackId: string, botInstanceId: string): Promise<BotAttachmentResponse> {
    // Verify skill pack exists
    await this.findOne(workspaceId, skillPackId);

    const attachment = await prisma.botInstanceSkillPack.findUnique({
      where: {
        botInstanceId_skillPackId: {
          botInstanceId,
          skillPackId,
        },
      },
    });

    if (!attachment) {
      throw new NotFoundException(`SkillPack not attached to this bot`);
    }

    return prisma.botInstanceSkillPack.delete({
      where: { id: attachment.id },
    }) as Promise<BotAttachmentResponse>;
  }

  async getBotsWithPack(workspaceId: string, skillPackId: string): Promise<Array<{ id: string; name: string; status: string; health: string; envOverrides: Record<string, string>; attachedAt: Date }>> {
    await this.findOne(workspaceId, skillPackId);

    const attachments = await prisma.botInstanceSkillPack.findMany({
      where: { skillPackId },
      include: {
        botInstance: {
          select: {
            id: true,
            name: true,
            status: true,
            health: true,
          },
        },
      },
    });

    return attachments.map(a => ({
      ...a.botInstance,
      envOverrides: a.envOverrides as Record<string, string>,
      attachedAt: a.attachedAt,
    }));
  }

  async syncPackToBots(workspaceId: string, skillPackId: string): Promise<SyncResult> {
    const skillPack = await this.findOne(workspaceId, skillPackId);

    // Get all bots using this pack
    const bots = await this.getBotsWithPack(workspaceId, skillPackId);

    // Trigger sync for each bot (this would typically trigger a redeploy or config update)
    const results: SyncResult = {
      synced: bots.length,
      bots: bots.map(b => b.id),
      packVersion: skillPack.version,
    };

    return results;
  }
}
