import { Injectable, Inject, Logger, NotFoundException, BadRequestException, HttpException, HttpStatus } from "@nestjs/common";
import {
  BotInstance,
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
  FLEET_REPOSITORY,
  IFleetRepository,
} from "@clawster/database";
import {
  PolicyEngine
} from "@clawster/core";
import {
  GatewayClient,
} from "@clawster/gateway-client";
import type { GatewayConnectionOptions } from "@clawster/gateway-client";
import {
  AdapterRegistry,
  DeploymentTargetType,
} from "@clawster/cloud-providers";
import {
  CreateBotInstanceDto,
  UpdateBotInstanceDto,
  UpdateAiGatewaySettingsDto,
  ListBotInstancesQueryDto,
  UpdateBotResourcesDto,
  BotResourcesResponseDto,
  ResourceTier,
} from "./bot-instances.dto";
import { BulkActionType, BulkActionResultItem } from "./bot-compare.dto";
import { ReconcilerService } from "../reconciler/reconciler.service";

@Injectable()
export class BotInstancesService {
  private readonly logger = new Logger(BotInstancesService.name);
  private readonly policyEngine = new PolicyEngine();

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(FLEET_REPOSITORY) private readonly fleetRepo: IFleetRepository,
    private readonly reconciler: ReconcilerService,
  ) {}

  async create(dto: CreateBotInstanceDto): Promise<BotInstance> {
    // Check for duplicate name in workspace
    const existing = await this.botInstanceRepo.findFirst({
      workspaceId: dto.workspaceId,
      search: dto.name,
    });

    // Check exact name match (findFirst uses contains for search)
    if (existing && existing.name === dto.name) {
      throw new BadRequestException(`Bot instance with name '${dto.name}' already exists`);
    }

    // Verify fleet exists
    const fleet = await this.fleetRepo.findById(dto.fleetId);

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
    const instance = await this.botInstanceRepo.create({
      workspace: { connect: { id: dto.workspaceId } },
      fleet: { connect: { id: dto.fleetId } },
      ...(dto.deploymentTargetId && {
        deploymentTarget: { connect: { id: dto.deploymentTargetId } },
      }),
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
    });

    return instance;
  }

  async findAll(query: ListBotInstancesQueryDto): Promise<BotInstance[]> {
    const instances = await this.botInstanceRepo.findManyWithRelations({
      workspaceId: query.workspaceId,
      fleetId: query.fleetId,
      status: query.status,
      health: query.health,
      templateId: query.templateId,
    });
    return instances.map((i) => this.redactSensitiveFields(i as BotInstance));
  }

  async findOne(id: string): Promise<BotInstance & { resolvedConfig?: Record<string, unknown> }> {
    const instance = await this.botInstanceRepo.findOneWithRelations(id);

    if (!instance) {
      throw new NotFoundException(`Bot instance ${id} not found`);
    }

    return this.redactSensitiveFields(instance as BotInstance);
  }

  async update(id: string, dto: UpdateBotInstanceDto): Promise<BotInstance> {
    await this.findOne(id);

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

    return this.botInstanceRepo.update(id, {
      ...(dto.name && { name: dto.name }),
      ...(dto.fleetId && { fleet: { connect: { id: dto.fleetId } } }),
      ...(dto.desiredManifest && { desiredManifest: JSON.stringify(dto.desiredManifest) }),
      ...(dto.tags && { tags: JSON.stringify(dto.tags) }),
      ...(dto.metadata && { metadata: JSON.stringify(dto.metadata) }),
      ...(dto.overlayIds && { overlayIds: JSON.stringify(dto.overlayIds) }),
      ...(dto.profileId !== undefined && { profileId: dto.profileId }),
    });
  }

  async updateStatus(id: string, status: string): Promise<BotInstance> {
    await this.findOne(id);

    return this.botInstanceRepo.updateStatus(id, status);
  }

  async updateHealth(id: string, health: string): Promise<BotInstance> {
    await this.findOne(id);

    return this.botInstanceRepo.updateHealth(id, health, new Date());
  }

  async restart(id: string): Promise<void> {
    await this.findOne(id);

    await this.botInstanceRepo.update(id, {
      status: "RECONCILING",
      runningSince: null,
      restartCount: { increment: 1 },
      lastReconcileAt: new Date(),
    });
  }

  async pause(id: string): Promise<void> {
    await this.findOne(id);

    await this.botInstanceRepo.update(id, { status: "PAUSED", runningSince: null });
  }

  async resume(id: string): Promise<void> {
    await this.findOne(id);

    await this.botInstanceRepo.update(id, { status: "PENDING", runningSince: null });

    // Trigger reconciliation to actually start the instance
    this.reconciler.reconcile(id).catch(() => {
      // Logged by reconciler — don't block the response
    });
  }

  async stop(id: string): Promise<void> {
    await this.findOne(id);
    await this.reconciler.stop(id);
  }

  async remove(id: string): Promise<void> {
    // Verify the instance exists
    await this.findOne(id);

    // Destroy infrastructure and delete from DB
    await this.reconciler.delete(id);
  }

  async compareBots(instanceIds: string[]): Promise<BotInstance[]> {
    const instances = await this.botInstanceRepo.findByIds(instanceIds);

    if (instances.length !== instanceIds.length) {
      const foundIds = new Set(instances.map((i) => i.id));
      const missingIds = instanceIds.filter((id) => !foundIds.has(id));
      throw new NotFoundException(
        `Bot instances not found: ${missingIds.join(", ")}`
      );
    }

    // Return in the same order as requested
    const instanceMap = new Map(instances.map((i) => [i.id, i]));
    return instanceIds.map((id) => instanceMap.get(id) as BotInstance);
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

  async reconcileInstance(id: string): Promise<Record<string, unknown>> {
    await this.findOne(id);
    const result = await this.reconciler.reconcile(id);
    return result as unknown as Record<string, unknown>;
  }

  async runDoctor(id: string): Promise<Record<string, unknown>> {
    await this.findOne(id);
    const result = await this.reconciler.doctor(id);
    return result as unknown as Record<string, unknown>;
  }

  async getDashboardData(workspaceId: string) {
    const [
      totalInstances,
      statusCounts,
      healthCounts,
      recentInstancesResult,
      fleetDistribution,
    ] = await Promise.all([
      this.botInstanceRepo.count({ workspaceId }),

      this.botInstanceRepo.groupByStatus({ workspaceId }),

      this.botInstanceRepo.groupByHealth({ workspaceId }),

      this.botInstanceRepo.findManyWithRelations({ workspaceId }),

      this.botInstanceRepo.groupByFleet({ workspaceId }),
    ]);

    // Take only the 10 most recent instances
    const recentInstances = recentInstancesResult.slice(0, 10).map((i) => ({
      id: i.id,
      name: i.name,
      status: i.status,
      health: i.health,
      fleet: i.fleet ? { name: i.fleet.name, environment: i.fleet.environment } : null,
      updatedAt: i.updatedAt,
    }));

    return {
      summary: {
        totalInstances,
        statusBreakdown: statusCounts.reduce((acc, curr) => {
          acc[curr.status] = curr._count;
          return acc;
        }, {} as Record<string, number>),
        healthBreakdown: healthCounts.reduce((acc, curr) => {
          acc[curr.health] = curr._count;
          return acc;
        }, {} as Record<string, number>),
      },
      recentInstances,
      fleetDistribution: fleetDistribution.map(fd => ({
        fleetId: fd.fleetId,
        count: fd._count,
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

    const updated = await this.botInstanceRepo.update(id, {
      aiGatewayEnabled: dto.enabled,
      aiGatewayUrl: dto.gatewayUrl ?? null,
      aiGatewayApiKey: dto.gatewayApiKey ?? null,
      aiGatewayProvider: dto.providerName ?? "vercel-ai-gateway",
    });

    return this.redactSensitiveFields(updated);
  }

  async chat(
    instanceId: string,
    message: string,
    sessionId?: string,
  ): Promise<{ response: string | undefined; sessionId: string; status: string }> {
    // 1. Verify instance exists
    const instance = await this.botInstanceRepo.findById(instanceId);

    if (!instance) {
      throw new NotFoundException(`Bot instance ${instanceId} not found`);
    }

    // 2. Look up GatewayConnection from DB to get host/port/auth
    const gwConn = await this.botInstanceRepo.getGatewayConnection(instanceId);

    if (!gwConn) {
      throw new HttpException(
        `No gateway connection found for instance ${instanceId}. The instance may not be running.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const resolvedSessionId = sessionId || crypto.randomUUID();

    // 3. Create a temporary GatewayClient, connect, call agent(), disconnect
    const options: GatewayConnectionOptions = {
      host: gwConn.host,
      port: gwConn.port,
      auth: gwConn.authToken
        ? { mode: "token", token: gwConn.authToken }
        : { mode: "token", token: "clawster" },
      reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 0, maxDelayMs: 0 },
    };

    this.logger.debug(`Chat connecting to gateway at ${gwConn.host}:${gwConn.port}`);
    const client = new GatewayClient(options);

    try {
      await client.connect();
      this.logger.debug(`Chat connected to gateway for ${instanceId}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        `Failed to connect to gateway for instance ${instanceId}: ${msg}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    try {
      const result = await client.agent({
        message,
        idempotencyKey: `chat-${instanceId}-${Date.now()}`,
        sessionId: resolvedSessionId,
      });

      this.logger.debug(`Chat result for ${instanceId}: status=${result.completion.status}, error=${result.completion.error ?? 'none'}`);

      return {
        response: result.completion.output,
        sessionId: resolvedSessionId,
        status: result.completion.status,
        ...(result.completion.error ? { error: result.completion.error } : {}),
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("timed out")) {
        throw new HttpException(
          `Agent request timed out for instance ${instanceId}`,
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      throw new HttpException(
        `Agent request failed for instance ${instanceId}: ${msg}`,
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      await client.disconnect().catch(() => {
        // Swallow disconnect errors — best-effort cleanup
      });
    }
  }

  async patchConfig(
    instanceId: string,
    patch: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    // 1. Verify instance exists
    const instance = await this.botInstanceRepo.findById(instanceId);

    if (!instance) {
      throw new NotFoundException(`Bot instance ${instanceId} not found`);
    }

    // 2. Look up GatewayConnection from DB to get host/port/auth
    const gwConn = await this.botInstanceRepo.getGatewayConnection(instanceId);

    if (!gwConn) {
      throw new HttpException(
        `No gateway connection found for instance ${instanceId}. The instance may not be running.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    // 3. Create a temporary GatewayClient, connect, do the operation, disconnect
    const options: GatewayConnectionOptions = {
      host: gwConn.host,
      port: gwConn.port,
      auth: gwConn.authToken
        ? { mode: "token", token: gwConn.authToken }
        : { mode: "token", token: "clawster" },
      reconnect: { enabled: false, maxAttempts: 0, baseDelayMs: 0, maxDelayMs: 0 },
    };

    const client = new GatewayClient(options);

    try {
      await client.connect();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new HttpException(
        `Failed to connect to gateway for instance ${instanceId}: ${msg}`,
        HttpStatus.BAD_GATEWAY,
      );
    }

    try {
      // Get current config and hash for optimistic concurrency
      const { hash } = await client.configGet();

      // Apply the partial update
      const result = await client.configPatch({ patch, baseHash: hash });

      if (!result.success) {
        throw new BadRequestException({
          message: "Config patch failed due to validation errors",
          validationErrors: result.validationErrors ?? [],
        });
      }

      return { success: true, message: "Config applied successfully" };
    } catch (error) {
      // Re-throw NestJS exceptions as-is
      if (error instanceof HttpException) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("timed out")) {
        throw new HttpException(
          `Config patch request timed out for instance ${instanceId}`,
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      throw new HttpException(
        `Config patch failed for instance ${instanceId}: ${msg}`,
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      await client.disconnect().catch(() => {
        // Swallow disconnect errors — best-effort cleanup
      });
    }
  }

  private redactSensitiveFields<T extends BotInstance>(instance: T): T {
    return { ...instance, aiGatewayApiKey: null };
  }

  /**
   * Get current resource allocation for a bot instance.
   */
  async getResources(instanceId: string): Promise<BotResourcesResponseDto> {
    const instance = await this.botInstanceRepo.findOneWithRelations(instanceId);

    if (!instance) {
      throw new NotFoundException(`Bot instance ${instanceId} not found`);
    }

    const deploymentType = instance.deploymentTarget?.type ?? "docker";

    // Parse metadata to get stored resource info
    const metadata = JSON.parse(instance.metadata || "{}") as Record<string, unknown>;

    // Default values based on deployment type
    const defaultSpec = this.getDefaultResourceSpec(deploymentType);

    return {
      tier: (metadata.resourceTier as ResourceTier) ?? "standard",
      cpu: (metadata.cpu as number) ?? defaultSpec.cpu,
      memory: (metadata.memory as number) ?? defaultSpec.memory,
      dataDiskSizeGb: metadata.dataDiskSizeGb as number | undefined,
      deploymentType,
    };
  }

  /**
   * Update resource allocation for a bot instance.
   * Routes the update through the reconciler to the appropriate deployment target.
   */
  async updateResources(
    instanceId: string,
    dto: UpdateBotResourcesDto
  ): Promise<{ success: boolean; message: string; requiresRestart?: boolean }> {
    const instance = await this.botInstanceRepo.findOneWithRelations(instanceId);

    if (!instance) {
      throw new NotFoundException(`Bot instance ${instanceId} not found`);
    }

    const deploymentType = instance.deploymentTarget?.type ?? "docker";

    // Validate that the deployment type supports resource updates
    const supportedTypes = ["ecs-ec2", "gce", "azure-vm"];
    if (!supportedTypes.includes(deploymentType)) {
      throw new BadRequestException(
        `Resource updates are not supported for deployment type "${deploymentType}". ` +
        `Supported types: ${supportedTypes.join(", ")}`
      );
    }

    // Convert tier to resource spec
    const spec = this.tierToResourceSpec(dto, deploymentType);

    // Route through reconciler to update resources
    const result = await this.reconciler.updateResources(instanceId, spec);

    if (result.success) {
      // Persist the new resource config to metadata
      const metadata = JSON.parse(instance.metadata || "{}") as Record<string, unknown>;
      await this.botInstanceRepo.update(instanceId, {
        metadata: JSON.stringify({
          ...metadata,
          resourceTier: dto.tier,
          cpu: spec.cpu,
          memory: spec.memory,
          dataDiskSizeGb: spec.dataDiskSizeGb,
        }),
      });
    }

    return {
      success: result.success,
      message: result.message,
      requiresRestart: result.requiresRestart,
    };
  }

  /**
   * Convert a resource tier + custom values to a ResourceSpec.
   * Uses the adapter registry for tier specs.
   */
  private tierToResourceSpec(
    dto: UpdateBotResourcesDto,
    deploymentType: string
  ): { cpu: number; memory: number; dataDiskSizeGb?: number } {
    // If custom tier, use the provided values
    if (dto.tier === "custom") {
      if (!dto.cpu || !dto.memory) {
        throw new BadRequestException(
          "Custom tier requires both cpu and memory values"
        );
      }
      return {
        cpu: dto.cpu,
        memory: dto.memory,
        dataDiskSizeGb: dto.dataDiskSizeGb,
      };
    }

    // Get tier spec from the adapter registry
    const typeEnum = this.stringToDeploymentTargetType(deploymentType);
    if (!typeEnum) {
      throw new BadRequestException(
        `Unknown deployment type "${deploymentType}"`
      );
    }

    const registry = AdapterRegistry.getInstance();
    const tierSpec = registry.getTierSpec(typeEnum, dto.tier);
    if (!tierSpec) {
      throw new BadRequestException(
        `Tier "${dto.tier}" not found for deployment type "${deploymentType}". ` +
        `Ensure the adapter is registered with tier specifications.`
      );
    }

    return {
      cpu: tierSpec.cpu,
      memory: tierSpec.memory,
      dataDiskSizeGb: dto.dataDiskSizeGb ?? tierSpec.dataDiskSizeGb,
    };
  }

  /**
   * Convert string deployment type to DeploymentTargetType enum.
   */
  private stringToDeploymentTargetType(type: string): DeploymentTargetType | undefined {
    const typeMap: Record<string, DeploymentTargetType> = {
      local: DeploymentTargetType.LOCAL,
      docker: DeploymentTargetType.DOCKER,
      "ecs-ec2": DeploymentTargetType.ECS_EC2,
      gce: DeploymentTargetType.GCE,
      "azure-vm": DeploymentTargetType.AZURE_VM,
    };
    return typeMap[type];
  }

  /**
   * Get default resource spec for a deployment type.
   * Uses the adapter registry for "standard" tier.
   */
  private getDefaultResourceSpec(deploymentType: string): { cpu: number; memory: number } {
    // Get "standard" tier from the adapter registry
    const typeEnum = this.stringToDeploymentTargetType(deploymentType);
    if (typeEnum) {
      const registry = AdapterRegistry.getInstance();
      const tierSpec = registry.getTierSpec(typeEnum, "standard");
      if (tierSpec) {
        return { cpu: tierSpec.cpu, memory: tierSpec.memory };
      }
    }

    // Default for deployment types without tier specs (e.g., local, docker)
    return { cpu: 1024, memory: 2048 };
  }
}