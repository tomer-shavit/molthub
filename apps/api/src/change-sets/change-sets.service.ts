import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma, ChangeSet, BotInstance } from "@clawster/database";
import { CreateChangeSetDto, RollbackChangeSetDto, ListChangeSetsQueryDto } from "./change-sets.dto";

@Injectable()
export class ChangeSetsService {
  async create(dto: CreateChangeSetDto): Promise<ChangeSet> {
    // Verify bot instance exists
    const bot = await prisma.botInstance.findUnique({
      where: { id: dto.botInstanceId },
    });

    if (!bot) {
      throw new NotFoundException(`Bot instance ${dto.botInstanceId} not found`);
    }

    const changeSet = await prisma.changeSet.create({
      data: {
        botInstanceId: dto.botInstanceId,
        changeType: dto.changeType,
        description: dto.description,
        fromManifest: JSON.stringify(dto.fromManifest),
        toManifest: JSON.stringify(dto.toManifest),
        rolloutStrategy: dto.rolloutStrategy || "ALL",
        rolloutPercentage: dto.rolloutPercentage,
        canaryInstances: dto.canaryInstances ? JSON.stringify(dto.canaryInstances) : null,
        status: "PENDING",
        totalInstances: dto.totalInstances || 1,
        createdBy: dto.createdBy || "system",
      },
    });

    return changeSet;
  }

  async findAll(query: ListChangeSetsQueryDto): Promise<ChangeSet[]> {
    return prisma.changeSet.findMany({
      where: {
        ...(query.botInstanceId && { botInstanceId: query.botInstanceId }),
        ...(query.status && { status: query.status }),
        ...(query.changeType && { changeType: query.changeType }),
      },
      orderBy: { createdAt: "desc" },
      include: {
        auditEvents: {
          orderBy: { timestamp: "desc" },
          take: 10,
        },
      },
    });
  }

  async findOne(id: string): Promise<ChangeSet> {
    const changeSet = await prisma.changeSet.findUnique({
      where: { id },
      include: {
        botInstance: {
          select: {
            id: true,
            name: true,
            status: true,
            fleetId: true,
          },
        },
        auditEvents: {
          orderBy: { timestamp: "desc" },
        },
      },
    });

    if (!changeSet) {
      throw new NotFoundException(`Change set ${id} not found`);
    }

    return changeSet;
  }

  async startRollout(id: string): Promise<ChangeSet> {
    const changeSet = await this.findOne(id);

    if (changeSet.status !== "PENDING") {
      throw new BadRequestException(`Cannot start rollout from status ${changeSet.status}`);
    }

    return prisma.changeSet.update({
      where: { id },
      data: {
        status: "IN_PROGRESS",
        startedAt: new Date(),
      },
    });
  }

  async updateProgress(id: string, updated: number, failed: number): Promise<ChangeSet> {
    const changeSet = await this.findOne(id);

    if (changeSet.status !== "IN_PROGRESS") {
      throw new BadRequestException(`Cannot update progress for status ${changeSet.status}`);
    }

    const newUpdated = changeSet.updatedInstances + updated;
    const newFailed = changeSet.failedInstances + failed;
    const total = changeSet.totalInstances;

    let newStatus = changeSet.status;
    if (newUpdated + newFailed >= total) {
      newStatus = newFailed > 0 ? "FAILED" : "COMPLETED";
    }

    return prisma.changeSet.update({
      where: { id },
      data: {
        updatedInstances: newUpdated,
        failedInstances: newFailed,
        status: newStatus,
        ...(newStatus === "COMPLETED" || newStatus === "FAILED" ? {
          completedAt: new Date(),
          canRollback: newStatus === "COMPLETED",
        } : {}),
      },
    });
  }

  async complete(id: string): Promise<ChangeSet> {
    const changeSet = await this.findOne(id);

    return prisma.changeSet.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        canRollback: true,
      },
    });
  }

  async fail(id: string, error: string): Promise<ChangeSet> {
    const changeSet = await this.findOne(id);

    return prisma.changeSet.update({
      where: { id },
      data: {
        status: "FAILED",
        completedAt: new Date(),
      },
    });
  }

  async rollback(id: string, dto: RollbackChangeSetDto): Promise<ChangeSet> {
    const changeSet = await this.findOne(id);

    if (!changeSet.canRollback) {
      throw new BadRequestException("This change set cannot be rolled back");
    }

    if (changeSet.rolledBackAt) {
      throw new BadRequestException("Change set has already been rolled back");
    }

    // Create a new change set for the rollback
    const rollbackChangeSet = await prisma.changeSet.create({
      data: {
        botInstanceId: changeSet.botInstanceId,
        changeType: "ROLLBACK",
        description: `Rollback of ${changeSet.id}: ${dto.reason}`,
        fromManifest: changeSet.toManifest,
        toManifest: changeSet.fromManifest,
        rolloutStrategy: "ALL",
        status: "PENDING",
        totalInstances: changeSet.totalInstances,
        createdBy: dto.rolledBackBy || "system",
      },
    });

    // Mark original as rolled back
    await prisma.changeSet.update({
      where: { id },
      data: {
        rolledBackAt: new Date(),
        rolledBackBy: dto.rolledBackBy || "system",
      },
    });

    return rollbackChangeSet;
  }

  async getRolloutStatus(id: string): Promise<{
    changeSetId: string;
    status: string;
    progress: {
      total: number;
      updated: number;
      failed: number;
      remaining: number;
      percentage: number;
    };
    canRollback: boolean;
  }> {
    const changeSet = await this.findOne(id);

    return {
      changeSetId: id,
      status: changeSet.status,
      progress: {
        total: changeSet.totalInstances,
        updated: changeSet.updatedInstances,
        failed: changeSet.failedInstances,
        remaining: changeSet.totalInstances - changeSet.updatedInstances - changeSet.failedInstances,
        percentage: Math.round(
          ((changeSet.updatedInstances + changeSet.failedInstances) / changeSet.totalInstances) * 100
        ),
      },
      canRollback: changeSet.canRollback && !changeSet.rolledBackAt,
    };
  }
}