import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma, Fleet, BotInstance } from "@clawster/database";
import { CreateFleetDto, UpdateFleetDto, ListFleetsQueryDto } from "./fleets.dto";

@Injectable()
export class FleetService {
  async create(dto: CreateFleetDto): Promise<Fleet> {
    // Resolve workspaceId — default to first workspace if not provided
    let workspaceId = dto.workspaceId;
    if (!workspaceId) {
      const workspace = await prisma.workspace.findFirst();
      if (!workspace) {
        throw new BadRequestException("No workspace found. Deploy a bot first to create a default workspace.");
      }
      workspaceId = workspace.id;
    }

    // Check for duplicate name in workspace
    const existing = await prisma.fleet.findFirst({
      where: {
        workspaceId,
        name: dto.name
      },
    });

    if (existing) {
      throw new BadRequestException(`Fleet with name '${dto.name}' already exists in workspace`);
    }

    // Create fleet record
    const fleet = await prisma.fleet.create({
      data: {
        workspaceId,
        name: dto.name,
        environment: dto.environment,
        description: dto.description,
        status: "ACTIVE",
        tags: JSON.stringify(dto.tags || {}),
        enforcedPolicyPackIds: JSON.stringify(dto.enforcedPolicyPackIds || []),
      },
    });

    return fleet;
  }

  async findAll(query: ListFleetsQueryDto): Promise<Fleet[]> {
    return prisma.fleet.findMany({
      where: {
        ...(query.workspaceId && { workspaceId: query.workspaceId }),
        ...(query.environment && { environment: query.environment }),
        ...(query.status && { status: query.status }),
      },
      include: {
        instances: {
          select: { id: true, status: true, deploymentType: true },
        },
        _count: {
          select: { instances: true },
        },
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
            deploymentType: true,
            gatewayPort: true,
            runningSince: true,
            lastHealthCheckAt: true,
            createdAt: true,
            gatewayConnection: {
              select: {
                host: true,
                port: true,
                status: true,
              },
            },
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

  async promote(id: string, targetEnvironment: string): Promise<{ fleet: Fleet; botsReconciling: number }> {
    const fleet = await this.findOne(id);

    // Validate environment transition
    const validTransitions: Record<string, string> = {
      dev: "staging",
      staging: "prod",
    };

    const expectedTarget = validTransitions[fleet.environment];
    if (!expectedTarget) {
      throw new BadRequestException(
        `Fleet is already in '${fleet.environment}' environment and cannot be promoted further`
      );
    }

    if (targetEnvironment !== expectedTarget) {
      throw new BadRequestException(
        `Fleet in '${fleet.environment}' can only be promoted to '${expectedTarget}', not '${targetEnvironment}'`
      );
    }

    // Update fleet environment
    const updatedFleet = await prisma.fleet.update({
      where: { id },
      data: { environment: targetEnvironment },
    });

    // Update all bot instances' manifests and trigger reconciliation
    const instances = await prisma.botInstance.findMany({
      where: { fleetId: id },
    });

    let botsReconciling = 0;

    for (const instance of instances) {
      try {
        const manifest = typeof instance.desiredManifest === "string"
          ? JSON.parse(instance.desiredManifest)
          : instance.desiredManifest;

        // Update environment in manifest metadata
        if (manifest?.metadata) {
          manifest.metadata.environment = targetEnvironment;
        }

        await prisma.botInstance.update({
          where: { id: instance.id },
          data: {
            desiredManifest: JSON.stringify(manifest),
            status: instance.status === "RUNNING" || instance.status === "DEGRADED"
              ? "PENDING"
              : instance.status,
          },
        });

        if (instance.status === "RUNNING" || instance.status === "DEGRADED") {
          botsReconciling++;
        }
      } catch {
        // Skip instances with invalid manifests
      }
    }

    return { fleet: updatedFleet, botsReconciling };
  }

  async reconcileAll(id: string): Promise<{ queued: number; skipped: number }> {
    const fleet = await this.findOne(id);

    const instances = await prisma.botInstance.findMany({
      where: { fleetId: id },
      select: { id: true, name: true, status: true },
    });

    let queued = 0;
    let skipped = 0;

    for (const instance of instances) {
      // Skip instances already being reconciled or in CREATING state
      if (instance.status === "RECONCILING" || instance.status === "CREATING") {
        skipped++;
        continue;
      }

      await prisma.botInstance.update({
        where: { id: instance.id },
        data: { status: "PENDING" },
      });
      queued++;
    }

    return { queued, skipped };
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

    if (fleet.environment === "prod") {
      throw new BadRequestException(
        "Cannot delete a production fleet. Demote or move instances first."
      );
    }

    await prisma.fleet.delete({ where: { id } });
  }
}