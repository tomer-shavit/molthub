import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, SloDefinition } from "@molthub/database";
import { CreateSloDto, UpdateSloDto, SloQueryDto } from "./slos.dto";

@Injectable()
export class SlosService {
  async create(dto: CreateSloDto): Promise<SloDefinition> {
    // Verify the bot instance exists
    const instance = await prisma.botInstance.findUnique({
      where: { id: dto.instanceId },
    });

    if (!instance) {
      throw new NotFoundException(`Bot instance ${dto.instanceId} not found`);
    }

    return prisma.sloDefinition.create({
      data: {
        instanceId: dto.instanceId,
        name: dto.name,
        description: dto.description,
        metric: dto.metric,
        targetValue: dto.targetValue,
        window: dto.window,
        createdBy: dto.createdBy || "system",
      },
    });
  }

  async findAll(query: SloQueryDto): Promise<SloDefinition[]> {
    return prisma.sloDefinition.findMany({
      where: {
        ...(query.instanceId && { instanceId: query.instanceId }),
        ...(query.isBreached !== undefined && { isBreached: query.isBreached }),
        ...(query.isActive !== undefined && { isActive: query.isActive }),
      },
      include: {
        instance: {
          select: {
            id: true,
            name: true,
            status: true,
            health: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string): Promise<SloDefinition> {
    const slo = await prisma.sloDefinition.findUnique({
      where: { id },
      include: {
        instance: {
          select: {
            id: true,
            name: true,
            status: true,
            health: true,
          },
        },
      },
    });

    if (!slo) {
      throw new NotFoundException(`SLO definition ${id} not found`);
    }

    return slo;
  }

  async findByInstance(instanceId: string): Promise<SloDefinition[]> {
    return prisma.sloDefinition.findMany({
      where: { instanceId },
      include: {
        instance: {
          select: {
            id: true,
            name: true,
            status: true,
            health: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async update(id: string, dto: UpdateSloDto): Promise<SloDefinition> {
    await this.findOne(id);

    return prisma.sloDefinition.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.instanceId !== undefined && { instanceId: dto.instanceId }),
        ...(dto.metric !== undefined && { metric: dto.metric }),
        ...(dto.targetValue !== undefined && { targetValue: dto.targetValue }),
        ...(dto.window !== undefined && { window: dto.window }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await prisma.sloDefinition.delete({ where: { id } });
  }

  async getSummary(): Promise<{
    total: number;
    breached: number;
    healthy: number;
    compliancePercent: number;
  }> {
    const [total, breached] = await Promise.all([
      prisma.sloDefinition.count({ where: { isActive: true } }),
      prisma.sloDefinition.count({ where: { isActive: true, isBreached: true } }),
    ]);

    const healthy = total - breached;
    const compliancePercent = total > 0 ? (healthy / total) * 100 : 100;

    return {
      total,
      breached,
      healthy,
      compliancePercent: Math.round(compliancePercent * 100) / 100,
    };
  }
}
