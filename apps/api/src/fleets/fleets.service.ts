import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma, Fleet, BotInstance } from "@clawster/database";
import { CreateFleetDto, UpdateFleetDto, ListFleetsQueryDto } from "./fleets.dto";

@Injectable()
export class FleetService {
  async create(dto: CreateFleetDto): Promise<Fleet> {
    // Check for duplicate name in workspace
    const existing = await prisma.fleet.findFirst({
      where: { 
        workspaceId: dto.workspaceId,
        name: dto.name 
      },
    });

    if (existing) {
      throw new BadRequestException(`Fleet with name '${dto.name}' already exists in workspace`);
    }

    // Create fleet record
    const fleet = await prisma.fleet.create({
      data: {
        workspaceId: dto.workspaceId,
        name: dto.name,
        environment: dto.environment,
        description: dto.description,
        status: "ACTIVE",
        tags: JSON.stringify(dto.tags || {}),
        privateSubnetIds: JSON.stringify(dto.privateSubnetIds || []),
        enforcedPolicyPackIds: JSON.stringify(dto.enforcedPolicyPackIds || []),
      },
    });

    return fleet;
  }

  async findAll(query: ListFleetsQueryDto): Promise<Fleet[]> {
    return prisma.fleet.findMany({
      where: {
        workspaceId: query.workspaceId,
        ...(query.environment && { environment: query.environment }),
        ...(query.status && { status: query.status }),
      },
      include: {
        _count: {
          select: { instances: true }
        }
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string): Promise<Fleet & { instances: Pick<BotInstance, 'id' | 'name' | 'status' | 'health' | 'createdAt'>[] }> {
    const fleet = await prisma.fleet.findUnique({
      where: { id },
      include: {
        instances: {
          select: {
            id: true,
            name: true,
            status: true,
            health: true,
            createdAt: true,
          },
          orderBy: { createdAt: "desc" },
        },
        profiles: true,
      },
    });

    if (!fleet) {
      throw new NotFoundException(`Fleet ${id} not found`);
    }

    return fleet;
  }

  async update(id: string, dto: UpdateFleetDto): Promise<Fleet> {
    const fleet = await this.findOne(id);

    return prisma.fleet.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.tags && { tags: JSON.stringify(dto.tags) }),
        ...(dto.defaultProfileId !== undefined && { defaultProfileId: dto.defaultProfileId }),
        ...(dto.enforcedPolicyPackIds && { enforcedPolicyPackIds: JSON.stringify(dto.enforcedPolicyPackIds) }),
      },
    });
  }

  async updateStatus(id: string, status: string): Promise<Fleet> {
    const fleet = await this.findOne(id);

    // Validate status transitions
    if (fleet.status === "DRAINING" && status !== "ACTIVE") {
      throw new BadRequestException("Cannot transition from DRAINING to any status except ACTIVE");
    }

    return prisma.fleet.update({
      where: { id },
      data: { status },
    });
  }

  async getHealth(id: string): Promise<{
    fleetId: string;
    totalInstances: number;
    healthyCount: number;
    degradedCount: number;
    unhealthyCount: number;
    unknownCount: number;
    status: string;
  }> {
    const fleet = await this.findOne(id);
    
    const instances = await prisma.botInstance.findMany({
      where: { fleetId: id },
      select: { health: true },
    });

    const healthCounts = instances.reduce((acc, instance) => {
      acc[instance.health] = (acc[instance.health] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      fleetId: id,
      totalInstances: instances.length,
      healthyCount: healthCounts["HEALTHY"] || 0,
      degradedCount: healthCounts["DEGRADED"] || 0,
      unhealthyCount: healthCounts["UNHEALTHY"] || 0,
      unknownCount: healthCounts["UNKNOWN"] || 0,
      status: fleet.status,
    };
  }

  async remove(id: string): Promise<void> {
    const fleet = await this.findOne(id);

    // Check if fleet has instances
    const instanceCount = await prisma.botInstance.count({
      where: { fleetId: id },
    });

    if (instanceCount > 0) {
      throw new BadRequestException(
        `Cannot delete fleet with ${instanceCount} instances. Move or delete instances first.`
      );
    }

    await prisma.fleet.delete({ where: { id } });
  }
}