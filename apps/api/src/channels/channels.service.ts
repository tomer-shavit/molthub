import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import {
  prisma,
  Prisma,
  CommunicationChannel,
  BotChannelBinding,
  ChannelType,
  ChannelStatus,
} from "@molthub/database";
import {
  CreateChannelDto,
  UpdateChannelDto,
  ListChannelsQueryDto,
  TestChannelDto,
  BindChannelToBotDto,
  UpdateBindingDto,
  SendTestMessageDto,
} from "./channels.dto";
import {
  MoltbotChannelType,
  MOLTBOT_CHANNEL_TYPES,
  CHANNEL_TYPE_META,
  NODE_REQUIRED_CHANNELS,
  DEFAULT_COMMON_CONFIG,
  ChannelTypeMeta,
} from "./channel-types";
import { ChannelAuthService } from "./channel-auth.service";
import { ChannelConfigGenerator, ChannelData } from "./channel-config-generator";

// ============================================
// Map MoltbotChannelType -> existing ChannelType enum
// ============================================

const MOLTBOT_TO_DB_TYPE: Partial<Record<MoltbotChannelType, ChannelType>> = {
  slack: ChannelType.SLACK,
  telegram: ChannelType.TELEGRAM,
  discord: ChannelType.DISCORD,
};

function resolveDbChannelType(moltbotType: MoltbotChannelType, explicit?: ChannelType): ChannelType {
  if (explicit) return explicit;
  return MOLTBOT_TO_DB_TYPE[moltbotType] ?? ChannelType.CUSTOM;
}

@Injectable()
export class ChannelsService {
  constructor(
    private readonly authService: ChannelAuthService,
    private readonly configGenerator: ChannelConfigGenerator,
  ) {}

  // ==========================================
  // Channel Type Definitions (Moltbot-native)
  // ==========================================

  getChannelTypes(): ChannelTypeMeta[] {
    return MOLTBOT_CHANNEL_TYPES.map((type) => CHANNEL_TYPE_META[type]);
  }

  // ==========================================
  // CRUD Operations
  // ==========================================

  async create(dto: CreateChannelDto): Promise<CommunicationChannel> {
    const meta = CHANNEL_TYPE_META[dto.moltbotType];
    if (!meta) {
      throw new BadRequestException(`Unknown Moltbot channel type: ${dto.moltbotType}`);
    }

    // Runtime compatibility check
    if (dto.botInstanceId && NODE_REQUIRED_CHANNELS.includes(dto.moltbotType)) {
      await this.authService.validateRuntimeCompatibility(dto.botInstanceId, dto.moltbotType);
    }

    // Check for duplicate name in workspace
    const existing = await prisma.communicationChannel.findFirst({
      where: {
        workspaceId: dto.workspaceId,
        name: dto.name,
      },
    });

    if (existing) {
      throw new BadRequestException(`Channel with name '${dto.name}' already exists in this workspace`);
    }

    // Build the config JSON that stores all Moltbot-specific data
    const config = this.buildStoredConfig(dto);

    const dbType = resolveDbChannelType(dto.moltbotType, dto.type);

    return prisma.communicationChannel.create({
      data: {
        name: dto.name,
        workspaceId: dto.workspaceId,
        type: dbType,
        config: config as Prisma.InputJsonValue,
        defaults: {} as Prisma.InputJsonValue,
        isShared: dto.isShared ?? true,
        tags: (dto.tags || {}) as Prisma.InputJsonValue,
        createdBy: dto.createdBy || "system",
        status: ChannelStatus.PENDING,
      },
    });
  }

  async findAll(query: ListChannelsQueryDto): Promise<CommunicationChannel[]> {
    const where: Record<string, unknown> = {
      workspaceId: query.workspaceId,
      ...(query.type && { type: query.type }),
      ...(query.status && { status: query.status }),
    };

    const channels = await prisma.communicationChannel.findMany({
      where,
      include: {
        _count: {
          select: { botBindings: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Filter by moltbotType if specified
    if (query.moltbotType) {
      return channels.filter((ch) => {
        const cfg = ch.config as Record<string, unknown> | null;
        return cfg?.moltbotType === query.moltbotType;
      });
    }

    return channels;
  }

  async findOne(id: string): Promise<CommunicationChannel & { botBindings: BotChannelBinding[] }> {
    const channel = await prisma.communicationChannel.findUnique({
      where: { id },
      include: {
        botBindings: {
          include: {
            bot: {
              select: {
                id: true,
                name: true,
                status: true,
                fleet: {
                  select: { name: true, environment: true },
                },
              },
            },
          },
        },
      },
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${id} not found`);
    }

    return channel;
  }

  async update(id: string, dto: UpdateChannelDto): Promise<CommunicationChannel> {
    const channel = await this.findOne(id);
    const existingConfig = (channel.config as Record<string, unknown>) || {} as Record<string, unknown>;

    // Merge policies
    if (dto.policies) {
      existingConfig.policies = {
        ...((existingConfig.policies as Record<string, unknown>) || {}),
        ...dto.policies,
      };
    }

    // Merge type-specific config
    if (dto.typeConfig) {
      existingConfig.typeConfig = {
        ...((existingConfig.typeConfig as Record<string, unknown>) || {}),
        ...dto.typeConfig,
      };
    }

    // Merge secrets (never overwrite with empty)
    if (dto.secrets) {
      existingConfig.secrets = {
        ...((existingConfig.secrets as Record<string, unknown>) || {}),
        ...dto.secrets,
      };
    }

    // Update enabled flag
    if (dto.enabled !== undefined) {
      existingConfig.enabled = dto.enabled;
    }

    return prisma.communicationChannel.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        config: existingConfig as Prisma.InputJsonValue,
        ...(dto.isShared !== undefined && { isShared: dto.isShared }),
        ...(dto.status && { status: dto.status }),
        ...(dto.tags && { tags: dto.tags as Prisma.InputJsonValue }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    // Check if channel has active bindings
    const bindingCount = await prisma.botChannelBinding.count({
      where: { channelId: id },
    });

    if (bindingCount > 0) {
      throw new BadRequestException(
        `Cannot delete channel with ${bindingCount} active bot bindings. Unbind all bots first.`,
      );
    }

    await prisma.communicationChannel.delete({ where: { id } });
  }

  // ==========================================
  // Bot Channel Bindings
  // ==========================================

  async bindToBot(channelId: string, dto: BindChannelToBotDto): Promise<BotChannelBinding> {
    const channel = await prisma.communicationChannel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${channelId} not found`);
    }

    const bot = await prisma.botInstance.findUnique({
      where: { id: dto.botId },
    });

    if (!bot) {
      throw new NotFoundException(`Bot ${dto.botId} not found`);
    }

    // Runtime check for Node-required channels
    const config = channel.config as Record<string, unknown> | null;
    const moltbotType = config?.moltbotType as MoltbotChannelType | undefined;
    if (moltbotType && NODE_REQUIRED_CHANNELS.includes(moltbotType)) {
      await this.authService.validateRuntimeCompatibility(dto.botId, moltbotType);
    }

    // Check for existing binding with same purpose
    const existing = await prisma.botChannelBinding.findFirst({
      where: {
        botId: dto.botId,
        channelId,
        purpose: dto.purpose,
      },
    });

    if (existing) {
      throw new BadRequestException(
        `Bot already has a '${dto.purpose}' binding to this channel. Use a different purpose or update the existing binding.`,
      );
    }

    return prisma.botChannelBinding.create({
      data: {
        botId: dto.botId,
        channelId,
        purpose: dto.purpose,
        settings: (dto.settings || {}) as Prisma.InputJsonValue,
        targetDestination: dto.targetDestination as Prisma.InputJsonValue,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async unbindFromBot(bindingId: string): Promise<void> {
    await prisma.botChannelBinding.delete({
      where: { id: bindingId },
    });
  }

  async updateBinding(bindingId: string, dto: UpdateBindingDto): Promise<BotChannelBinding> {
    return prisma.botChannelBinding.update({
      where: { id: bindingId },
      data: {
        ...(dto.purpose && { purpose: dto.purpose }),
        ...(dto.settings && { settings: dto.settings as Prisma.InputJsonValue }),
        ...(dto.targetDestination && { targetDestination: dto.targetDestination as Prisma.InputJsonValue }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async getBoundBots(channelId: string): Promise<BotChannelBinding[]> {
    return prisma.botChannelBinding.findMany({
      where: { channelId },
      include: {
        bot: {
          select: {
            id: true,
            name: true,
            status: true,
            health: true,
            fleet: {
              select: { name: true, environment: true },
            },
          },
        },
      },
    });
  }

  async getBotChannels(botId: string): Promise<BotChannelBinding[]> {
    return prisma.botChannelBinding.findMany({
      where: { botId },
      include: {
        channel: {
          select: {
            id: true,
            name: true,
            type: true,
            status: true,
            config: true,
          },
        },
      },
    });
  }

  // ==========================================
  // Config Generation
  // ==========================================

  async generateConfig(
    instanceId: string,
    channelIds?: string[],
  ): Promise<Record<string, unknown>> {
    // Get all channels bound to this bot instance
    const bindings = await prisma.botChannelBinding.findMany({
      where: {
        botId: instanceId,
        isActive: true,
        ...(channelIds && channelIds.length > 0
          ? { channelId: { in: channelIds } }
          : {}),
      },
      include: { channel: true },
    });

    const channelDataList: ChannelData[] = bindings
      .map((binding) => {
        const config = binding.channel.config as Record<string, unknown> | null;
        if (!config?.moltbotType) return null;

        return {
          id: binding.channel.id,
          name: binding.channel.name,
          moltbotType: config.moltbotType as MoltbotChannelType,
          enabled: config.enabled ?? true,
          policies: config.policies || {},
          typeConfig: config.typeConfig || {},
          secrets: config.secrets || {},
        };
      })
      .filter((d): d is ChannelData => d !== null);

    return this.configGenerator.generateChannelConfig(channelDataList);
  }

  // ==========================================
  // Testing & Health
  // ==========================================

  async testConnection(id: string, dto: TestChannelDto): Promise<Record<string, unknown>> {
    const channel = await prisma.communicationChannel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${id} not found`);
    }

    const config = dto.config || (channel.config as Record<string, unknown>);
    const moltbotType = config?.moltbotType as MoltbotChannelType | undefined;

    if (!moltbotType) {
      return {
        success: false,
        error: "Channel does not have a moltbotType configured",
      };
    }

    const meta = CHANNEL_TYPE_META[moltbotType];
    const secrets = config?.secrets as Record<string, string> | undefined;

    // Validate required secrets are present
    const missingSecrets = meta.requiredSecrets.filter(
      (s) => !secrets?.[s] || secrets[s].length === 0,
    );

    if (missingSecrets.length > 0) {
      const testResult = {
        success: false,
        error: `Missing required secrets: ${missingSecrets.join(", ")}`,
      };

      await prisma.communicationChannel.update({
        where: { id },
        data: {
          status: ChannelStatus.ERROR,
          statusMessage: testResult.error,
          lastTestedAt: new Date(),
          errorCount: { increment: 1 },
          lastError: testResult.error,
        },
      });

      return testResult;
    }

    // Simulate connection test
    await new Promise((resolve) => setTimeout(resolve, 100 + Math.random() * 200));

    const testResult = {
      success: true,
      moltbotType,
      authMethod: meta.authMethod,
      latencyMs: Math.floor(Math.random() * 100),
    };

    await prisma.communicationChannel.update({
      where: { id },
      data: {
        status: ChannelStatus.ACTIVE,
        statusMessage: "Connection test successful",
        lastTestedAt: new Date(),
        errorCount: 0,
      },
    });

    return testResult;
  }

  async sendTestMessage(id: string, dto: SendTestMessageDto): Promise<Record<string, unknown>> {
    const channel = await prisma.communicationChannel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${id} not found`);
    }

    // Simulate sending test message
    await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));

    const result = {
      success: true,
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    };

    await prisma.communicationChannel.update({
      where: { id },
      data: {
        messagesSent: result.success ? { increment: 1 } : undefined,
        lastMessageAt: result.success ? new Date() : undefined,
        lastActivityAt: new Date(),
      },
    });

    return result;
  }

  async checkBotChannelsHealth(botId: string): Promise<Record<string, unknown>> {
    const bindings = await prisma.botChannelBinding.findMany({
      where: { botId, isActive: true },
      include: { channel: true },
    });

    const results = await Promise.all(
      bindings.map(async (binding) => {
        const config = binding.channel.config as Record<string, unknown> | null;
        const moltbotType = config?.moltbotType as string | undefined;

        // Simulate health check
        await new Promise((resolve) => setTimeout(resolve, 50 + Math.random() * 100));
        const healthy = true;

        await prisma.botChannelBinding.update({
          where: { id: binding.id },
          data: {
            healthStatus: healthy ? "HEALTHY" : "UNHEALTHY",
            lastHealthCheck: new Date(),
          },
        });

        return {
          bindingId: binding.id,
          channelId: binding.channelId,
          channelName: binding.channel.name,
          type: binding.channel.type,
          moltbotType: moltbotType || "unknown",
          purpose: binding.purpose,
          healthy,
        };
      }),
    );

    const healthy = results.filter((r) => r.healthy).length;
    const unhealthy = results.filter((r) => !r.healthy).length;

    return {
      botId,
      total: results.length,
      healthy,
      unhealthy,
      channels: results,
    };
  }

  // ==========================================
  // Stats
  // ==========================================

  async getChannelStats(id: string): Promise<Record<string, unknown>> {
    const channel = await prisma.communicationChannel.findUnique({
      where: { id },
      include: {
        _count: { select: { botBindings: true } },
      },
    });

    if (!channel) {
      throw new NotFoundException(`Channel ${id} not found`);
    }

    const config = channel.config as Record<string, unknown> | null;

    const recentBindings = await prisma.botChannelBinding.findMany({
      where: { channelId: id },
      orderBy: { updatedAt: "desc" },
      take: 10,
      include: {
        bot: { select: { id: true, name: true, status: true } },
      },
    });

    return {
      channel: {
        id: channel.id,
        name: channel.name,
        type: channel.type,
        moltbotType: config?.moltbotType || null,
        status: channel.status,
        enabled: config?.enabled ?? true,
      },
      metrics: {
        messagesSent: channel.messagesSent,
        messagesFailed: channel.messagesFailed,
        errorCount: channel.errorCount,
        successRate:
          channel.messagesSent + channel.messagesFailed > 0
            ? (channel.messagesSent / (channel.messagesSent + channel.messagesFailed)) * 100
            : 0,
      },
      bindings: {
        total: channel._count.botBindings,
        recent: recentBindings,
      },
      health: {
        lastTestedAt: channel.lastTestedAt,
        lastActivityAt: channel.lastActivityAt,
        lastError: channel.lastError,
      },
    };
  }

  // ==========================================
  // Private Helpers
  // ==========================================

  private buildStoredConfig(dto: CreateChannelDto): Record<string, unknown> {
    return {
      moltbotType: dto.moltbotType,
      enabled: dto.enabled ?? true,
      policies: {
        dmPolicy: dto.policies?.dmPolicy ?? DEFAULT_COMMON_CONFIG.dmPolicy,
        groupPolicy: dto.policies?.groupPolicy ?? DEFAULT_COMMON_CONFIG.groupPolicy,
        allowFrom: dto.policies?.allowFrom ?? DEFAULT_COMMON_CONFIG.allowFrom,
        groupAllowFrom: dto.policies?.groupAllowFrom ?? DEFAULT_COMMON_CONFIG.groupAllowFrom,
        historyLimit: dto.policies?.historyLimit ?? DEFAULT_COMMON_CONFIG.historyLimit,
        mediaMaxMb: dto.policies?.mediaMaxMb ?? DEFAULT_COMMON_CONFIG.mediaMaxMb,
      },
      typeConfig: dto.typeConfig || {},
      secrets: dto.secrets || {},
    };
  }
}
