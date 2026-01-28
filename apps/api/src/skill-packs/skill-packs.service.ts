import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { prisma } from '@molthub/database';
import { CreateSkillPackDto, UpdateSkillPackDto, AttachSkillPackDto, BulkAttachSkillPackDto } from './skill-packs.dto';

@Injectable()
export class SkillPacksService {
  async create(workspaceId: string, userId: string, dto: CreateSkillPackDto) {
    // Check for duplicate name
    const existing = await prisma.skillPack.findFirst({
      where: { workspaceId, name: dto.name },
    });

    if (existing) {
      throw new ConflictException(`SkillPack '${dto.name}' already exists`);
    }

    return prisma.skillPack.create({
      data: {
        ...dto,
        workspaceId,
        createdBy: userId,
        skills: dto.skills || [],
        mcps: dto.mcps || [],
        envVars: dto.envVars || {},
      },
    });
  }

  async findAll(workspaceId: string) {
    return prisma.skillPack.findMany({
      where: { workspaceId },
      include: {
        _count: {
          select: { botInstances: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(workspaceId: string, id: string) {
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

    return skillPack;
  }

  async update(workspaceId: string, id: string, dto: UpdateSkillPackDto) {
    const skillPack = await this.findOne(workspaceId, id);

    // Check name uniqueness if changing name
    if (dto.name && dto.name !== skillPack.name) {
      const existing = await prisma.skillPack.findFirst({
        where: { workspaceId, name: dto.name },
      });
      if (existing) {
        throw new ConflictException(`SkillPack '${dto.name}' already exists`);
      }
    }

    // Increment version when content changes
    const versionIncrement = dto.skills || dto.mcps || dto.envVars ? 1 : 0;

    return prisma.skillPack.update({
      where: { id },
      data: {
        ...dto,
        version: { increment: versionIncrement },
        updatedAt: new Date(),
      },
    });
  }

  async remove(workspaceId: string, id: string) {
    await this.findOne(workspaceId, id);

    return prisma.skillPack.delete({
      where: { id },
    });
  }

  async attachToBot(workspaceId: string, skillPackId: string, dto: AttachSkillPackDto) {
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
    });
  }

  async bulkAttach(workspaceId: string, skillPackId: string, dto: BulkAttachSkillPackDto) {
    // Verify skill pack exists
    await this.findOne(workspaceId, skillPackId);

    const results = {
      successful: [] as string[],
      failed: [] as { botId: string; error: string }[],
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

  async detachFromBot(workspaceId: string, skillPackId: string, botInstanceId: string) {
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
    });
  }

  async getBotsWithPack(workspaceId: string, skillPackId: string) {
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
            fleetId: true,
          },
        },
      },
    });

    return attachments.map(a => ({
      ...a.botInstance,
      envOverrides: a.envOverrides,
      attachedAt: a.attachedAt,
    }));
  }

  async syncPackToBots(workspaceId: string, skillPackId: string) {
    const skillPack = await this.findOne(workspaceId, skillPackId);

    // Get all bots using this pack
    const bots = await this.getBotsWithPack(workspaceId, skillPackId);

    // Trigger sync for each bot (this would typically trigger a redeploy or config update)
    const results = {
      synced: bots.length,
      bots: bots.map(b => b.id),
      packVersion: skillPack.version,
    };

    return results;
  }
}
