import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { 
  prisma, 
  BotInstance, 
  BotStatus, 
  BotHealth,
  Prisma 
} from "@molthub/database";
import { 
  PolicyEngine
} from "@molthub/core";
import { CreateBotInstanceDto, UpdateBotInstanceDto, ListBotInstancesQueryDto } from "./bot-instances.dto";

@Injectable()
export class BotInstancesService {
  private readonly policyEngine = new PolicyEngine();

  async create(dto: CreateBotInstanceDto): Promise<BotInstance> {
    // Check for duplicate name in workspace
    const existing = await prisma.botInstance.findFirst({
      where: { 
        workspaceId: dto.workspaceId,
        name: dto.name 
      },
    });

    if (existing) {
      throw new BadRequestException(`Bot instance with name '${dto.name}' already exists`);
    }

    // Verify fleet exists
    const fleet = await prisma.fleet.findUnique({
      where: { id: dto.fleetId },
    });

    if (!fleet) {
      throw new NotFoundException(`Fleet ${dto.fleetId} not found`);
    }

    // Validate manifest
    const manifestValidation = this.policyEngine.validate(dto.desiredManifest);
    if (!manifestValidation.valid) {
      const errors = manifestValidation.violations
        .filter(v => v.severity === "ERROR")
        .map(v => v.message)
        .join(", ");
      throw new BadRequestException(`Manifest validation failed: ${errors}`);
    }

    // Create instance record
    const instance = await prisma.botInstance.create({
      data: {
        workspaceId: dto.workspaceId,
        fleetId: dto.fleetId,
        name: dto.name,
        templateId: dto.templateId,
        profileId: dto.profileId,
        overlayIds: dto.overlayIds || [],
        status: BotStatus.CREATING,
        health: BotHealth.UNKNOWN,
        desiredManifest: dto.desiredManifest as any,
        tags: dto.tags || {},
        metadata: dto.metadata || {},
        createdBy: dto.createdBy || "system",
      },
    });

    return instance;
  }

  async findAll(query: ListBotInstancesQueryDto): Promise<BotInstance[]> {
    return prisma.botInstance.findMany({
      where: {
        workspaceId: query.workspaceId,
        ...(query.fleetId && { fleetId: query.fleetId }),
        ...(query.status && { status: query.status }),
        ...(query.health && { health: query.health }),
        ...(query.templateId && { templateId: query.templateId }),
      },
      include: {
        fleet: {
          select: {
            id: true,
            name: true,
            environment: true,
          },
        },
        _count: {
          select: { connectorBindings: true }
        }
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string): Promise<BotInstance & { resolvedConfig?: any }> {
    const instance = await prisma.botInstance.findUnique({
      where: { id },
      include: {
        fleet: true,
        connectorBindings: {
          include: {
            connector: {
              select: {
                id: true,
                name: true,
                type: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (!instance) {
      throw new NotFoundException(`Bot instance ${id} not found`);
    }

    return instance;
  }

  async update(id: string, dto: UpdateBotInstanceDto): Promise<BotInstance> {
    const instance = await this.findOne(id);

    // If updating manifest, validate it
    if (dto.desiredManifest) {
      const validation = this.policyEngine.validate(dto.desiredManifest);
      if (!validation.valid) {
        const errors = validation.violations
          .filter(v => v.severity === "ERROR")
          .map(v => v.message)
          .join(", ");
        throw new BadRequestException(`Manifest validation failed: ${errors}`);
      }
    }

    return prisma.botInstance.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.fleetId && { fleetId: dto.fleetId }),
        ...(dto.desiredManifest && { desiredManifest: dto.desiredManifest as any }),
        ...(dto.tags && { tags: dto.tags }),
        ...(dto.metadata && { metadata: dto.metadata }),
        ...(dto.overlayIds && { overlayIds: dto.overlayIds }),
        ...(dto.profileId !== undefined && { profileId: dto.profileId }),
      },
    });
  }

  async updateStatus(id: string, status: BotStatus): Promise<BotInstance> {
    const instance = await this.findOne(id);

    return prisma.botInstance.update({
      where: { id },
      data: { 
        status,
        ...(status === BotStatus.ERROR && {
          errorCount: { increment: 1 }
        }),
      },
    });
  }

  async updateHealth(id: string, health: BotHealth): Promise<BotInstance> {
    const instance = await this.findOne(id);

    return prisma.botInstance.update({
      where: { id },
      data: { 
        health,
        lastHealthCheckAt: new Date(),
      },
    });
  }

  async restart(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.botInstance.update({
      where: { id },
      data: { 
        status: BotStatus.RECONCILING,
        restartCount: { increment: 1 },
        lastReconcileAt: new Date(),
      },
    });
  }

  async pause(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.botInstance.update({
      where: { id },
      data: { status: BotStatus.PAUSED },
    });
  }

  async resume(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.botInstance.update({
      where: { id },
      data: { status: BotStatus.PENDING },
    });
  }

  async stop(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.botInstance.update({
      where: { id },
      data: { status: BotStatus.STOPPED },
    });
  }

  async remove(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.botInstance.update({
      where: { id },
      data: { status: BotStatus.DELETING },
    });
  }

  async getDashboardData(workspaceId: string) {
    const [
      totalInstances,
      statusCounts,
      healthCounts,
      recentInstances,
      fleetDistribution,
    ] = await Promise.all([
      prisma.botInstance.count({ where: { workspaceId } }),
      
      prisma.botInstance.groupBy({
        by: ['status'],
        where: { workspaceId },
        _count: { status: true },
      }),
      
      prisma.botInstance.groupBy({
        by: ['health'],
        where: { workspaceId },
        _count: { health: true },
      }),
      
      prisma.botInstance.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: 10,
        select: {
          id: true,
          name: true,
          status: true,
          health: true,
          fleet: { select: { name: true, environment: true } },
          updatedAt: true,
        },
      }),
      
      prisma.botInstance.groupBy({
        by: ['fleetId'],
        where: { workspaceId },
        _count: { fleetId: true },
      }),
    ]);

    return {
      summary: {
        totalInstances,
        statusBreakdown: statusCounts.reduce((acc, curr) => {
          acc[curr.status] = curr._count.status;
          return acc;
        }, {} as Record<string, number>),
        healthBreakdown: healthCounts.reduce((acc, curr) => {
          acc[curr.health] = curr._count.health;
          return acc;
        }, {} as Record<string, number>),
      },
      recentInstances,
      fleetDistribution: fleetDistribution.map(fd => ({
        fleetId: fd.fleetId,
        count: fd._count.fleetId,
      })),
    };
  }
}