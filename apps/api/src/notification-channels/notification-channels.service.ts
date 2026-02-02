import { Injectable, Logger } from "@nestjs/common";
import {
  prisma,
  Prisma,
} from "@clawster/database";
import type {
  CreateNotificationChannelDto,
  UpdateNotificationChannelDto,
  CreateNotificationRuleDto,
  UpdateNotificationRuleDto,
  NotificationChannelQueryDto,
} from "./notification-channels.dto";

@Injectable()
export class NotificationChannelsService {
  private readonly logger = new Logger(NotificationChannelsService.name);

  // ---- Channel CRUD --------------------------------------------------------

  async create(workspaceId: string, dto: CreateNotificationChannelDto) {
    return prisma.notificationChannel.create({
      data: {
        workspaceId,
        name: dto.name,
        type: dto.type,
        config: dto.config,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async findAll(workspaceId: string, query: NotificationChannelQueryDto) {
    const where: Prisma.NotificationChannelWhereInput = { workspaceId };

    if (query.type) where.type = query.type;
    if (query.enabled !== undefined) where.enabled = query.enabled;

    return prisma.notificationChannel.findMany({
      where,
      include: {
        notificationRules: true,
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string) {
    return prisma.notificationChannel.findUnique({
      where: { id },
      include: {
        notificationRules: true,
      },
    });
  }

  async update(id: string, dto: UpdateNotificationChannelDto) {
    const data: Prisma.NotificationChannelUpdateInput = {};

    if (dto.name !== undefined) data.name = dto.name;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.config !== undefined) data.config = dto.config;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;

    return prisma.notificationChannel.update({
      where: { id },
      data,
      include: {
        notificationRules: true,
      },
    });
  }

  async remove(id: string) {
    return prisma.notificationChannel.delete({
      where: { id },
    });
  }

  // ---- Test Channel --------------------------------------------------------

  async testChannel(id: string) {
    const channel = await prisma.notificationChannel.findUnique({
      where: { id },
    });

    if (!channel) return null;

    let success = false;
    let error: string | null = null;

    try {
      const config = JSON.parse(channel.config);

      if (channel.type === "SLACK_WEBHOOK") {
        const response = await fetch(config.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: ":white_check_mark: Clawster notification channel test — this channel is working correctly.",
          }),
        });
        success = response.ok;
        if (!success) {
          error = `Slack webhook responded with status ${response.status}`;
        }
      } else if (channel.type === "WEBHOOK") {
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(config.headers ?? {}),
        };
        const response = await fetch(config.url, {
          method: "POST",
          headers,
          body: JSON.stringify({
            event: "test",
            source: "clawster",
            message: "Notification channel test — this channel is working correctly.",
            timestamp: new Date().toISOString(),
          }),
        });
        success = response.ok;
        if (!success) {
          error = `Webhook responded with status ${response.status}`;
        }
      } else if (channel.type === "EMAIL") {
        // Email testing is a no-op for now; mark as tested
        success = true;
      }
    } catch (err: any) {
      error = err.message ?? String(err);
      this.logger.warn(`Test failed for channel ${id}: ${error}`);
    }

    return prisma.notificationChannel.update({
      where: { id },
      data: {
        lastTestedAt: new Date(),
        lastError: error,
      },
    });
  }

  // ---- Notification Rules --------------------------------------------------

  async createRule(dto: CreateNotificationRuleDto) {
    return prisma.alertNotificationRule.create({
      data: {
        channelId: dto.channelId,
        severities: dto.severities ?? null,
        alertRules: dto.alertRules ?? null,
        enabled: dto.enabled ?? true,
      },
    });
  }

  async updateRule(id: string, dto: UpdateNotificationRuleDto) {
    const data: Prisma.AlertNotificationRuleUpdateInput = {};

    if (dto.severities !== undefined) data.severities = dto.severities;
    if (dto.alertRules !== undefined) data.alertRules = dto.alertRules;
    if (dto.enabled !== undefined) data.enabled = dto.enabled;

    return prisma.alertNotificationRule.update({
      where: { id },
      data,
    });
  }

  async removeRule(id: string) {
    return prisma.alertNotificationRule.delete({
      where: { id },
    });
  }

  // ---- Alert Matching ------------------------------------------------------

  /**
   * Find notification rules that match a given alert severity and rule name.
   * Returns the matching rules with their associated channels.
   */
  async findRulesForAlert(severity: string, rule: string) {
    const allRules = await prisma.alertNotificationRule.findMany({
      where: { enabled: true },
      include: {
        channel: true,
      },
    });

    return allRules.filter((nr) => {
      // Channel must be enabled
      if (!nr.channel.enabled) return false;

      // Check severity filter
      if (nr.severities) {
        try {
          const severities: string[] = JSON.parse(nr.severities);
          if (severities.length > 0 && !severities.includes(severity)) {
            return false;
          }
        } catch {
          // Malformed JSON — skip filter
        }
      }

      // Check alert rule filter
      if (nr.alertRules) {
        try {
          const alertRules: string[] = JSON.parse(nr.alertRules);
          if (alertRules.length > 0 && !alertRules.includes(rule)) {
            return false;
          }
        } catch {
          // Malformed JSON — skip filter
        }
      }

      return true;
    });
  }
}
