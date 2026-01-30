import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { prisma, Prisma, BotStatus, BotHealth, ChannelType, ChannelStatus, DeploymentType } from "@molthub/database";
import { ReconcilerService } from "../reconciler/reconciler.service";
import { ConfigGeneratorService } from "../reconciler/config-generator.service";
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
} from "../templates/builtin-templates";
import { OnboardingPreviewDto, OnboardingDeployDto } from "./onboarding.dto";
import { randomBytes } from "crypto";

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly reconciler: ReconcilerService,
    private readonly configGenerator: ConfigGeneratorService,
  ) {}

  /** Check if any bot instances exist */
  async checkFirstRun(): Promise<{ hasInstances: boolean }> {
    const count = await prisma.botInstance.count();
    return { hasInstances: count > 0 };
  }

  /** List templates for the wizard */
  getTemplates() {
    return BUILTIN_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      category: t.category,
      channels: t.channels,
      requiredInputs: t.requiredInputs.filter(
        (i) => !i.key.includes("gatewayAuth"),
      ), // auto-generate gateway auth
    }));
  }

  /** Preview the generated config without deploying */
  async preview(dto: OnboardingPreviewDto) {
    const template = getBuiltinTemplate(dto.templateId);
    if (!template) {
      throw new BadRequestException(`Template not found: ${dto.templateId}`);
    }

    const config: Record<string, unknown> = { ...template.defaultConfig };

    // Apply channel configs
    if (dto.channels) {
      for (const ch of dto.channels) {
        if (config.channels && typeof config.channels === "object") {
          (config.channels as Record<string, unknown>)[ch.type] = {
            ...(
              (config.channels as Record<string, unknown>)[ch.type] as
                | Record<string, unknown>
                | undefined
            ),
            ...ch.config,
            enabled: true,
          };
        }
      }
    }

    // Apply overrides
    if (dto.configOverrides) {
      Object.assign(config, dto.configOverrides);
    }

    return { config };
  }

  /** Full onboarding deploy flow */
  async deploy(dto: OnboardingDeployDto, userId: string) {
    this.logger.log(`Starting onboarding deploy: ${dto.botName}`);

    // 1. Validate template
    const template = getBuiltinTemplate(dto.templateId);
    if (!template) {
      throw new BadRequestException(`Template not found: ${dto.templateId}`);
    }

    // 2. Get or create workspace
    let workspace = await prisma.workspace.findFirst();
    if (!workspace) {
      workspace = await prisma.workspace.create({
        data: { name: "Default Workspace", slug: "default" },
      });
    }

    // 3. Get or create fleet
    const env = dto.environment || "dev";
    let fleet = await prisma.fleet.findFirst({
      where: { workspaceId: workspace.id },
    });
    if (!fleet) {
      fleet = await prisma.fleet.create({
        data: {
          workspaceId: workspace.id,
          name: "Default Fleet",
          environment: env as "dev" | "staging" | "prod",
          status: "ACTIVE",
        },
      });
    }

    // 4. Generate config from template
    const gatewayAuthToken = randomBytes(32).toString("hex");
    const config: Record<string, unknown> = { ...template.defaultConfig };

    // Set gateway auth token
    if (config.gateway && typeof config.gateway === "object") {
      (config.gateway as Record<string, unknown>).auth = {
        token: gatewayAuthToken,
      };
    }

    // Apply channel configs from wizard
    if (dto.channels) {
      if (!config.channels) config.channels = {};
      for (const ch of dto.channels) {
        (config.channels as Record<string, unknown>)[ch.type] = {
          ...(
            (config.channels as Record<string, unknown>)[ch.type] as
              | Record<string, unknown>
              | undefined
          ),
          ...ch.config,
          enabled: true,
        };
      }
    }

    // Apply overrides
    if (dto.configOverrides) {
      Object.assign(config, dto.configOverrides);
    }

    // 5. Build manifest
    const manifest = {
      apiVersion: "molthub/v2",
      kind: "MoltbotInstance",
      metadata: {
        name: dto.botName,
        workspace: workspace.slug,
        environment: env,
      },
      spec: {
        moltbotConfig: config,
      },
    };

    // 6. Create DeploymentTarget record
    const deploymentType =
      dto.deploymentTarget.type === "ecs-fargate" ? "ECS_FARGATE" : "DOCKER";
    const targetConfig =
      dto.deploymentTarget.type === "ecs-fargate"
        ? {
            region: dto.deploymentTarget.region,
            accessKeyId: dto.deploymentTarget.accessKeyId,
            secretAccessKey: dto.deploymentTarget.secretAccessKey,
            subnetIds: dto.deploymentTarget.subnetIds,
            securityGroupId: dto.deploymentTarget.securityGroupId,
            executionRoleArn: dto.deploymentTarget.executionRoleArn,
            clusterName: `moltbot-${dto.botName}`,
          }
        : {
            containerName:
              dto.deploymentTarget.containerName || `moltbot-${dto.botName}`,
            configPath:
              dto.deploymentTarget.configPath || `/var/moltbot/${dto.botName}`,
            gatewayPort: 18789,
          };

    const deploymentTarget = await prisma.deploymentTarget.create({
      data: {
        name: `${dto.botName}-target`,
        type: deploymentType as DeploymentType,
        config: targetConfig as Prisma.InputJsonValue,
      },
    });

    // 7. Create BotInstance
    const botInstance = await prisma.botInstance.create({
      data: {
        workspaceId: workspace.id,
        fleetId: fleet.id,
        name: dto.botName,
        status: BotStatus.CREATING,
        health: BotHealth.UNKNOWN,
        desiredManifest: manifest as Prisma.InputJsonValue,
        deploymentType: deploymentType as DeploymentType,
        deploymentTargetId: deploymentTarget.id,
        gatewayPort: 18789,
        templateId: dto.templateId,
        tags: {},
        metadata: {
          gatewayAuthToken, // stored encrypted in practice
          ...targetConfig,
        } as Prisma.InputJsonValue,
        createdBy: userId,
      },
    });

    // 8. Create channel records
    if (dto.channels) {
      const channelTypeMap: Record<string, string> = {
        whatsapp: "CUSTOM",
        telegram: "TELEGRAM",
        discord: "DISCORD",
        slack: "SLACK",
        email: "EMAIL",
        webhook: "WEBHOOK",
        sms: "SMS",
      };
      for (const ch of dto.channels) {
        const channelType = channelTypeMap[ch.type.toLowerCase()] || "CUSTOM";
        await prisma.communicationChannel.create({
          data: {
            workspaceId: workspace.id,
            name: `${dto.botName}-${ch.type}`,
            type: channelType as ChannelType,
            config: (ch.config || {}) as Prisma.InputJsonValue,
            status: "PENDING" as ChannelStatus,
            createdBy: userId,
          },
        });
      }
    }

    // 9. Trigger reconciliation (async - don't await)
    this.reconciler.reconcile(botInstance.id).catch((err) => {
      this.logger.error(
        `Reconcile failed for ${botInstance.id}: ${err.message}`,
      );
    });

    return {
      instanceId: botInstance.id,
      fleetId: fleet.id,
      status: "deploying",
    };
  }

  /** Get deployment status */
  async getDeployStatus(instanceId: string) {
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
      include: {
        gatewayConnection: true,
      },
    });

    if (!instance) {
      throw new BadRequestException("Instance not found");
    }

    const steps = [
      {
        name: "Creating infrastructure",
        status:
          instance.status === "CREATING" ? "in_progress" : "completed",
      },
      {
        name: "Installing Moltbot",
        status:
          instance.status === "CREATING"
            ? "pending"
            : instance.status === "RECONCILING"
              ? "in_progress"
              : "completed",
      },
      {
        name: "Applying configuration",
        status:
          ["CREATING", "RECONCILING"].includes(instance.status) &&
          !instance.configHash
            ? "pending"
            : instance.status === "RECONCILING"
              ? "in_progress"
              : instance.configHash
                ? "completed"
                : "pending",
      },
      {
        name: "Starting gateway",
        status: instance.gatewayConnection
          ? "completed"
          : instance.status === "RECONCILING"
            ? "in_progress"
            : "pending",
      },
      {
        name: "Running health check",
        status:
          instance.health === "HEALTHY" || instance.health === "DEGRADED"
            ? "completed"
            : instance.status === "RUNNING"
              ? "in_progress"
              : "pending",
      },
    ];

    return {
      instanceId: instance.id,
      status: instance.status,
      health: instance.health,
      error: instance.lastError,
      steps,
    };
  }
}
