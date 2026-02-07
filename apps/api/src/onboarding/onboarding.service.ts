import { Injectable, Inject, Logger, BadRequestException } from "@nestjs/common";
import {
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
  FLEET_REPOSITORY,
  IFleetRepository,
  WORKSPACE_REPOSITORY,
  IWorkspaceRepository,
  CHANNEL_REPOSITORY,
  IChannelRepository,
  PRISMA_CLIENT,
  PrismaClient,
} from "@clawster/database";
import { ReconcilerService } from "../reconciler/reconciler.service";
import { ConfigGeneratorService } from "../reconciler/config-generator.service";
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
} from "../templates/builtin-templates";
import { OnboardingPreviewDto, OnboardingDeployDto } from "./onboarding.dto";
import { CredentialVaultService } from "../connectors/credential-vault.service";
import { randomBytes } from "crypto";
import * as os from "os";
import * as path from "path";
import {
  DeploymentTargetType,
  applySecurityDefaults,
  getSecuritySummary,
} from "@clawster/cloud-providers";

/** Cloud VM deployment types that use a single container per VM (fixed port 18789). */
const CLOUD_VM_TYPES = new Set(["ecs-ec2", "gce", "azure-vm"]);

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    @Inject(FLEET_REPOSITORY) private readonly fleetRepo: IFleetRepository,
    @Inject(WORKSPACE_REPOSITORY) private readonly workspaceRepo: IWorkspaceRepository,
    @Inject(CHANNEL_REPOSITORY) private readonly channelRepo: IChannelRepository,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly reconciler: ReconcilerService,
    private readonly configGenerator: ConfigGeneratorService,
    private readonly credentialVault: CredentialVaultService,
  ) {}

  /** Check if any bot instances exist */
  async checkFirstRun(): Promise<{ hasInstances: boolean }> {
    const count = await this.botInstanceRepo.count();
    return { hasInstances: count > 0 };
  }

  /** Validate AWS credentials using STS GetCallerIdentity */
  async validateAwsCredentials(params: {
    accessKeyId: string;
    secretAccessKey: string;
    region: string;
  }): Promise<{ valid: boolean; accountId?: string; error?: string }> {
    try {
      const { STSClient, GetCallerIdentityCommand } = await import("@aws-sdk/client-sts");
      const client = new STSClient({
        region: params.region,
        credentials: {
          accessKeyId: params.accessKeyId,
          secretAccessKey: params.secretAccessKey,
        },
      });
      const result = await client.send(new GetCallerIdentityCommand({}));
      return { valid: true, accountId: result.Account };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : "Invalid AWS credentials",
      };
    }
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

    // 1. Resolve template (default to whatsapp-personal if none specified)
    const resolvedTemplateId = dto.templateId || "builtin-whatsapp-personal";
    const template = getBuiltinTemplate(resolvedTemplateId);
    if (!template) {
      throw new BadRequestException(`Template not found: ${resolvedTemplateId}`);
    }

    // 2. Get or create workspace
    let workspace = await this.workspaceRepo.findFirstWorkspace();
    if (!workspace) {
      workspace = await this.workspaceRepo.createWorkspace({
        name: "Default Workspace",
        slug: "default",
      });
    }

    // Resolve saved credentials if provided (provider-agnostic)
    let resolvedCredentials: Record<string, string> = { ...(dto.deploymentTarget.credentials ?? {}) };
    const credentialId = dto.savedCredentialId ?? dto.awsCredentialId;
    if (credentialId) {
      const savedCreds = await this.credentialVault.resolve(credentialId, workspace.id);
      resolvedCredentials = {
        ...resolvedCredentials,
        ...(Object.fromEntries(
          Object.entries(savedCreds).filter(([, v]) => typeof v === "string"),
        ) as Record<string, string>),
      };
      this.logger.debug(`Resolved saved credential ${credentialId} for deploy`);
    }

    // Resolve saved model API key if provided
    if (dto.modelCredentialId) {
      const modelCreds = await this.credentialVault.resolve(dto.modelCredentialId, workspace.id);
      if (!dto.modelConfig) {
        dto.modelConfig = { provider: modelCreds.provider as string, model: "", apiKey: "" } as any;
      }
      dto.modelConfig.apiKey = modelCreds.apiKey as string;
      if (modelCreds.provider) {
        dto.modelConfig.provider = modelCreds.provider as string;
      }
      this.logger.debug(`Resolved saved model credential for deploy`);
    }

    // 2b. Check for duplicate bot name
    const existing = await this.botInstanceRepo.findFirst({
      workspaceId: workspace.id,
      search: dto.botName,
    });
    if (existing && existing.name === dto.botName) {
      const STALE_THRESHOLD_MS = 15 * 60 * 1000;
      const isStaleCreating =
        existing.status === "CREATING" &&
        Date.now() - new Date(existing.updatedAt).getTime() > STALE_THRESHOLD_MS;
      const isFailed = existing.status === "ERROR" || isStaleCreating;

      if (isFailed) {
        this.logger.warn(
          `Cleaning up stale bot "${dto.botName}" (status: ${existing.status}) before re-creation`,
        );
        // Only delete DB records (fast) to free the bot name.
        // Skip infra teardown — the new deploy's install() handles
        // existing stacks (updates, waits for deletion, or force-deletes).
        await this.cleanupFailedDeployment(
          existing.id,
          existing.deploymentTargetId ?? "",
        );
      } else {
        throw new BadRequestException(
          `A bot named "${dto.botName}" already exists in this workspace`,
        );
      }
    }

    // 3. Get or create fleet
    const env = dto.environment || "dev";
    let fleet;
    if (dto.fleetId) {
      fleet = await this.fleetRepo.findById(dto.fleetId);
      if (!fleet) {
        throw new BadRequestException(`Fleet not found: ${dto.fleetId}`);
      }
      if (fleet.workspaceId !== workspace.id) {
        throw new BadRequestException(`Fleet does not belong to this workspace`);
      }
    } else {
      fleet = await this.fleetRepo.findFirst({ workspaceId: workspace.id });
      if (!fleet) {
        fleet = await this.fleetRepo.create({
          workspace: { connect: { id: workspace.id } },
          name: "Default Fleet",
          environment: env as "dev" | "staging" | "prod",
          status: "ACTIVE",
        });
      }
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
        const { enabled: _enabled, ...channelConf } = (ch.config || {}) as Record<string, unknown>;
        (config.channels as Record<string, unknown>)[ch.type] = {
          ...(
            (config.channels as Record<string, unknown>)[ch.type] as
              | Record<string, unknown>
              | undefined
          ),
          ...channelConf,
        };
      }
    }

    // Ensure agents.defaults.workspace is set (required by security policy)
    if (!config.agents) config.agents = {};
    const agents = config.agents as Record<string, unknown>;
    if (!agents.defaults) agents.defaults = {};
    const defaults = agents.defaults as Record<string, unknown>;
    if (!defaults.workspace) {
      defaults.workspace = `~/openclaw/${dto.botName}`;
    }

    // Map string target type to DeploymentTargetType enum
    const targetTypeStr = dto.deploymentTarget?.type || "docker";
    const deploymentTargetTypeMap: Record<string, DeploymentTargetType> = {
      "docker": DeploymentTargetType.DOCKER,
      "local": DeploymentTargetType.LOCAL,
      "ecs-ec2": DeploymentTargetType.ECS_EC2,
      "gce": DeploymentTargetType.GCE,
      "azure-vm": DeploymentTargetType.AZURE_VM,
    };
    const deploymentTargetType = deploymentTargetTypeMap[targetTypeStr] || DeploymentTargetType.DOCKER;

    // Apply security defaults based on deployment target type.
    // This configures: sandbox mode, network isolation, dmPolicy, logging redaction.
    // Cloud VMs (ECS, GCE, Azure): sandbox.mode="all" + docker.network="none" (blocks exfiltration)
    // Local Docker: sandbox.mode="off" (no Docker-in-Docker without Sysbox)
    const securitySummary = getSecuritySummary(deploymentTargetType);
    this.logger.debug(`Applying security defaults for ${targetTypeStr}:\n${securitySummary}`);

    // Apply model config from wizard
    const containerEnv: Record<string, string> = {};
    if (dto.modelConfig) {
      const providerEnvMap: Record<string, string> = {
        anthropic: "ANTHROPIC_API_KEY",
        openai: "OPENAI_API_KEY",
        google: "GEMINI_API_KEY",
        groq: "GROQ_API_KEY",
        openrouter: "OPENROUTER_API_KEY",
      };

      // Set agents.defaults.model.primary
      if (!defaults.model) defaults.model = {};
      const model = defaults.model as Record<string, unknown>;
      // OpenRouter models already include the provider prefix
      model.primary = dto.modelConfig.provider === "openrouter"
        ? `openrouter/${dto.modelConfig.model}`
        : `${dto.modelConfig.provider}/${dto.modelConfig.model}`;

      // Store API key as container env var
      const envVar = providerEnvMap[dto.modelConfig.provider];
      if (envVar) {
        containerEnv[envVar] = dto.modelConfig.apiKey;
      }

      this.logger.log(
        `Model configured: ${model.primary} (env: ${envVar})`,
      );
    }

    // Apply overrides
    if (dto.configOverrides) {
      Object.assign(config, dto.configOverrides);
    }

    // Apply security defaults based on deployment target type
    // This ensures: sandbox mode, network isolation, dmPolicy, logging redaction
    const securedConfig = applySecurityDefaults(config, deploymentTargetType, gatewayAuthToken);

    // 5. Build manifest with security-hardened config
    const manifest = {
      apiVersion: "clawster/v2",
      kind: "OpenClawInstance",
      metadata: {
        name: dto.botName,
        workspace: workspace.slug,
        environment: env,
      },
      spec: {
        openclawConfig: securedConfig,
      },
    };

    // 6. Create DeploymentTarget record
    const defaultTarget = process.env.DEFAULT_DEPLOYMENT_TARGET || "docker";
    const targetType = dto.deploymentTarget?.type || defaultTarget;
    const deploymentTypeMap: Record<string, string> = {
      "ecs-ec2": "ECS_EC2",
      docker: "DOCKER",
      local: "LOCAL",
      gce: "GCE",
      "azure-vm": "AZURE_VM",
    };
    const deploymentType = deploymentTypeMap[targetType] || "DOCKER";

    // Auto-assign gateway port (spaced 20 apart for OpenClaw derived ports)
    const assignedPort = await this.allocateGatewayPort();
    // Cloud VM types use a single container per VM, so always use the default port
    const effectivePort = CLOUD_VM_TYPES.has(targetType) ? 18789 : assignedPort;

    const targetConfig = CLOUD_VM_TYPES.has(targetType)
      ? {
          ...resolvedCredentials,
          tier: dto.deploymentTarget?.tier || "standard",
          gatewayPort: effectivePort,
          ...(targetType === "ecs-ec2" ? { useSharedInfra: true } : {}),
        }
      : {
          containerName: `openclaw-${dto.botName}`,
          imageName: "openclaw:local",
          dockerfilePath: path.join(__dirname, "../../../../../docker/openclaw"),
          configPath: path.join(os.homedir(), `.clawster/gateways/${dto.botName}`),
          gatewayPort: effectivePort,
        };

    const deploymentTarget = await this.prisma.deploymentTarget.create({
      data: {
        name: `${dto.botName}-target`,
        type: deploymentType,
        config: JSON.stringify(targetConfig),
      },
    });

    // 7. Create BotInstance
    const botInstance = await this.botInstanceRepo.create({
      workspace: { connect: { id: workspace.id } },
      fleet: { connect: { id: fleet.id } },
      name: dto.botName,
      status: "CREATING",
      health: "UNKNOWN",
      desiredManifest: JSON.stringify(manifest),
      deploymentType: deploymentType,
      deploymentTarget: { connect: { id: deploymentTarget.id } },
      gatewayPort: effectivePort,
      templateId: resolvedTemplateId,
      tags: JSON.stringify({}),
      metadata: JSON.stringify({
        gatewayAuthToken, // TODO: encrypt sensitive metadata fields
        ...targetConfig,
        ...(Object.keys(containerEnv).length > 0 ? { containerEnv } : {}),
      }),
      createdBy: userId,
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
        const channelName = `${dto.botName}-${ch.type}`;
        await this.channelRepo.upsertChannel(
          workspace.id,
          channelName,
          {
            type: channelType,
            config: JSON.stringify(ch.config || {}),
            status: "PENDING",
            createdBy: userId,
          },
        );
      }
    }

    // 9. Trigger reconciliation (async - don't await so frontend gets instanceId for event subscription)
    this.reconciler.reconcile(botInstance.id).then(async (result) => {
      if (!result.success) {
        this.logger.warn(
          `Reconcile failed for ${botInstance.id}, cleaning up DB records`,
        );
        await this.cleanupFailedDeployment(botInstance.id, deploymentTarget.id);
      }
    }).catch(async (err) => {
      this.logger.error(
        `Reconcile crashed for ${botInstance.id}: ${err.message}`,
      );
      await this.cleanupFailedDeployment(botInstance.id, deploymentTarget.id).catch((cleanupErr) => {
        this.logger.error(`Cleanup also failed for ${botInstance.id}: ${cleanupErr.message}`);
      });
    });

    return {
      instanceId: botInstance.id,
      fleetId: fleet.id,
      status: "deploying",
    };
  }

  /** Get deployment status with staleness detection */
  async getDeployStatus(instanceId: string) {
    const instance = await this.botInstanceRepo.findById(instanceId);

    if (!instance) {
      throw new BadRequestException("Instance not found");
    }

    // Staleness detection: if stuck in CREATING or RECONCILING for >15 minutes
    // (ECS zero-upload deploys need ~3-5 min for CF stack + ~3 min for npm install)
    const STALE_THRESHOLD_MS = 15 * 60 * 1000;
    const updatedAt = new Date(instance.updatedAt).getTime();
    const isStale =
      (instance.status === "CREATING" || instance.status === "RECONCILING") &&
      Date.now() - updatedAt > STALE_THRESHOLD_MS;

    const effectiveStatus = isStale ? "ERROR" : instance.status;
    const effectiveError = isStale
      ? "Deployment timed out. Check API logs."
      : instance.lastError;

    const steps = [
      {
        name: "Creating infrastructure",
        status:
          effectiveStatus === "CREATING" ? "in_progress" : "completed",
      },
      {
        name: "Installing OpenClaw",
        status:
          effectiveStatus === "CREATING"
            ? "pending"
            : effectiveStatus === "RECONCILING"
              ? "in_progress"
              : "completed",
      },
      {
        name: "Applying configuration",
        status:
          ["CREATING", "RECONCILING"].includes(effectiveStatus) &&
          !instance.configHash
            ? "pending"
            : effectiveStatus === "RECONCILING"
              ? "in_progress"
              : instance.configHash
                ? "completed"
                : "pending",
      },
      {
        name: "Starting gateway",
        status: instance.gatewayConnection
          ? "completed"
          : effectiveStatus === "RECONCILING"
            ? "in_progress"
            : "pending",
      },
      {
        name: "Running health check",
        status:
          instance.health === "HEALTHY" || instance.health === "DEGRADED"
            ? "completed"
            : effectiveStatus === "RUNNING"
              ? "in_progress"
              : "pending",
      },
    ];

    return {
      instanceId: instance.id,
      status: effectiveStatus,
      health: instance.health,
      error: effectiveError,
      steps,
    };
  }

  /**
   * Clean up all DB records created during a failed deployment.
   * Deletes: GatewayConnection, OpenClawProfile, HealthSnapshot, BotInstance, DeploymentTarget.
   */
  private async cleanupFailedDeployment(
    instanceId: string,
    deploymentTargetId: string,
  ): Promise<void> {
    this.logger.log(`Cleaning up failed deployment for ${instanceId}`);

    try {
      // Delete related records first (foreign key dependencies)
      await this.botInstanceRepo.deleteRelatedRecords(instanceId);

      // Delete communication channels linked to the bot's workspace
      const instance = await this.botInstanceRepo.findById(instanceId);
      if (instance) {
        await this.channelRepo.deleteChannelsByNamePrefix(
          instance.workspaceId,
          `${instance.name}-`,
        );
      }

      // Delete the bot instance
      await this.botInstanceRepo.delete(instanceId);

      // Delete the deployment target
      await this.prisma.deploymentTarget.delete({ where: { id: deploymentTargetId } });

      this.logger.log(`Cleaned up all DB records for failed deployment ${instanceId}`);
    } catch (err) {
      this.logger.error(
        `Failed to clean up deployment ${instanceId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * Allocate the next available gateway port for a new instance.
   * Ports are spaced 20 apart starting from 18789 (OpenClaw reserves derived ports).
   * Max port is 65500 to stay within the valid TCP range.
   */
  private async allocateGatewayPort(): Promise<number> {
    const BASE_PORT = 18789;
    const PORT_SPACING = 20;
    const MAX_PORT = 65500;

    // Find all instances with gateway ports
    const result = await this.botInstanceRepo.findMany(
      { gatewayPortNotNull: true },
      { page: 1, limit: 10000 },
    );

    const usedPorts = new Set(
      result.data.map((i) => i.gatewayPort).filter((p): p is number => p !== null),
    );

    let port = BASE_PORT;
    while (usedPorts.has(port)) {
      port += PORT_SPACING;
      if (port > MAX_PORT) {
        throw new BadRequestException(
          "No available gateway ports. Delete unused bot instances to free ports.",
        );
      }
    }

    return port;
  }
}
