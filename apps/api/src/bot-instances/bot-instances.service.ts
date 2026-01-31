import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import {
  prisma,
  BotInstance,
  Prisma
} from "@molthub/database";
import { 
  PolicyEngine
} from "@molthub/core";
import { CreateBotInstanceDto, UpdateBotInstanceDto, UpdateAiGatewaySettingsDto, ListBotInstancesQueryDto } from "./bot-instances.dto";
import { BulkActionType, BulkActionResultItem } from "./bot-compare.dto";

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
        overlayIds: JSON.stringify(dto.overlayIds || []),
        status: "CREATING",
        health: "UNKNOWN",
        desiredManifest: JSON.stringify(dto.desiredManifest),
        tags: JSON.stringify(dto.tags || {}),
        metadata: JSON.stringify(dto.metadata || {}),
        createdBy: dto.createdBy || "system",
      },
    });

    return instance;
  }

  async findAll(query: ListBotInstancesQueryDto): Promise<BotInstance[]> {
    const instances = await prisma.botInstance.findMany({
      where: {
        ...(query.workspaceId && { workspaceId: query.workspaceId }),
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
    return instances.map((i) => this.redactSensitiveFields(i));
  }

  async findOne(id: string): Promise<BotInstance & { resolvedConfig?: Record<string, unknown> }> {
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

    return this.redactSensitiveFields(instance);
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
        ...(dto.desiredManifest && { desiredManifest: JSON.stringify(dto.desiredManifest) }),
        ...(dto.tags && { tags: JSON.stringify(dto.tags) }),
        ...(dto.metadata && { metadata: JSON.stringify(dto.metadata) }),
        ...(dto.overlayIds && { overlayIds: JSON.stringify(dto.overlayIds) }),
        ...(dto.profileId !== undefined && { profileId: dto.profileId }),
      },
    });
  }

  async updateStatus(id: string, status: string): Promise<BotInstance> {
    const instance = await this.findOne(id);

    return prisma.botInstance.update({
      where: { id },
      data: {
        status,
        ...(status === "ERROR" && {
          errorCount: { increment: 1 }
        }),
      },
    });
  }

  async updateHealth(id: string, health: string): Promise<BotInstance> {
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
        status: "RECONCILING",
        restartCount: { increment: 1 },
        lastReconcileAt: new Date(),
      },
    });
  }

  async pause(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.botInstance.update({
      where: { id },
      data: { status: "PAUSED" },
    });
  }

  async resume(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.botInstance.update({
      where: { id },
      data: { status: "PENDING" },
    });
  }

  async stop(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.botInstance.update({
      where: { id },
      data: { status: "STOPPED" },
    });
  }

  async remove(id: string): Promise<void> {
    const instance = await this.findOne(id);
    
    await prisma.botInstance.update({
      where: { id },
      data: { status: "DELETING" },
    });
  }

  async compareBots(instanceIds: string[]): Promise<BotInstance[]> {
    const instances = await prisma.botInstance.findMany({
      where: { id: { in: instanceIds } },
      include: {
        fleet: {
          select: {
            id: true,
            name: true,
            environment: true,
          },
        },
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

    if (instances.length !== instanceIds.length) {
      const foundIds = new Set(instances.map((i) => i.id));
      const missingIds = instanceIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Bot instances not found: ${missingIds.join(", ")}`
      );
    }

    // Return in the same order as requested
    const instanceMap = new Map(instances.map((i) => [i.id, i]));
    return instanceIds.map((id) => instanceMap.get(id)!);
  }

  async bulkAction(
    instanceIds: string[],
    action: BulkActionType
  ): Promise<BulkActionResultItem[]> {
    const results: BulkActionResultItem[] = [];

    for (const instanceId of instanceIds) {
      try {
        switch (action) {
          case "restart":
            await this.restart(instanceId);
            break;
          case "pause":
            await this.pause(instanceId);
            break;
          case "stop":
            await this.stop(instanceId);
            break;
          case "start":
            await this.resume(instanceId);
            break;
        }
        results.push({ instanceId, success: true });
      } catch (error) {
        results.push({
          instanceId,
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
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

  async updateAiGatewaySettings(
    id: string,
    dto: UpdateAiGatewaySettingsDto,
  ): Promise<BotInstance> {
    await this.findOne(id);

    // Validate: when enabled, gatewayUrl is required
    if (dto.enabled && !dto.gatewayUrl) {
      throw new BadRequestException(
        "Gateway URL is required when AI Gateway is enabled",
      );
    }

    const updated = await prisma.botInstance.update({
      where: { id },
      data: {
        aiGatewayEnabled: dto.enabled,
        aiGatewayUrl: dto.gatewayUrl ?? null,
        aiGatewayApiKey: dto.gatewayApiKey ?? null,
        aiGatewayProvider: dto.providerName ?? "vercel-ai-gateway",
      },
    });

    return this.redactSensitiveFields(updated);
  }

  private redactSensitiveFields<T extends BotInstance>(instance: T): T {
    return { ...instance, aiGatewayApiKey: null };
  }
}