import { Injectable, Logger } from "@nestjs/common";
import { prisma } from "@clawster/database";
import { NotificationChannelsService } from "./notification-channels.service";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DeliverAlertPayload {
  severity: string;
  rule: string;
  botInstanceId?: string;
  message: string;
  details?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class NotificationDeliveryService {
  private readonly logger = new Logger(NotificationDeliveryService.name);

  constructor(
    private readonly notificationChannelsService: NotificationChannelsService,
  ) {}

  /**
   * Deliver an alert to all matching notification channels.
   *
   * 1. Query AlertNotificationRule records that match the severity + rule
   * 2. For each matching rule, get the associated NotificationChannel
   * 3. Format and send the notification based on channel type
   * 4. Update delivery/failure tracking on the channel
   */
  async deliverAlert(payload: DeliverAlertPayload): Promise<void> {
    const { severity, rule, botInstanceId, message, details } = payload;

    let matchingRules: Awaited<
      ReturnType<NotificationChannelsService["findRulesForAlert"]>
    >;

    try {
      matchingRules =
        await this.notificationChannelsService.findRulesForAlert(
          severity,
          rule,
        );
    } catch (err) {
      this.logger.error(
        `Failed to query notification rules for alert: ${(err as Error).message}`,
      );
      return;
    }

    if (matchingRules.length === 0) {
      this.logger.debug(
        `No notification rules matched for severity=${severity} rule=${rule}`,
      );
      return;
    }

    // Resolve bot instance name for display purposes
    let botName = botInstanceId ?? "unknown";
    if (botInstanceId) {
      try {
        const instance = await prisma.botInstance.findUnique({
          where: { id: botInstanceId },
          select: { name: true },
        });
        if (instance) botName = instance.name;
      } catch {
        // Fall back to ID
      }
    }

    // Deduplicate channels (multiple rules can point to the same channel)
    const channelMap = new Map<
      string,
      (typeof matchingRules)[number]["channel"]
    >();
    for (const nr of matchingRules) {
      channelMap.set(nr.channel.id, nr.channel);
    }

    const deliveryPromises = Array.from(channelMap.values()).map((channel) =>
      this.sendToChannel(channel, {
        severity,
        rule,
        botName,
        message,
        details,
      }),
    );

    await Promise.allSettled(deliveryPromises);
  }

  // ---- Channel dispatch ----------------------------------------------------

  private async sendToChannel(
    channel: {
      id: string;
      type: string;
      config: string;
      name: string;
    },
    alert: {
      severity: string;
      rule: string;
      botName: string;
      message: string;
      details?: string;
    },
  ): Promise<void> {
    try {
      let config: Record<string, any>;
      try {
        config = JSON.parse(channel.config);
      } catch {
        throw new Error(`Invalid JSON config for channel "${channel.name}"`);
      }

      switch (channel.type) {
        case "SLACK_WEBHOOK":
          await this.sendSlackWebhook(config, alert);
          break;
        case "WEBHOOK":
          await this.sendWebhook(config, alert);
          break;
        case "EMAIL":
          this.logger.warn(
            `EMAIL delivery not yet implemented — skipping channel "${channel.name}"`,
          );
          // TODO: Implement email delivery
          return;
        default:
          this.logger.warn(
            `Unknown channel type "${channel.type}" for channel "${channel.name}"`,
          );
          return;
      }

      // Success — update delivery tracking
      await prisma.notificationChannel.update({
        where: { id: channel.id },
        data: {
          lastDeliveryAt: new Date(),
          deliveryCount: { increment: 1 },
        },
      });

      this.logger.log(
        `Delivered alert [${alert.severity}] "${alert.rule}" to channel "${channel.name}" (${channel.type})`,
      );
    } catch (err) {
      const errorMessage = (err as Error).message ?? String(err);

      // Failure — update failure tracking
      try {
        await prisma.notificationChannel.update({
          where: { id: channel.id },
          data: {
            lastError: errorMessage,
            failureCount: { increment: 1 },
          },
        });
      } catch (updateErr) {
        this.logger.error(
          `Failed to update failure tracking for channel ${channel.id}: ${(updateErr as Error).message}`,
        );
      }

      this.logger.error(
        `Failed to deliver alert to channel "${channel.name}" (${channel.type}): ${errorMessage}`,
      );
    }
  }

  // ---- Slack Webhook -------------------------------------------------------

  private async sendSlackWebhook(
    config: Record<string, any>,
    alert: {
      severity: string;
      rule: string;
      botName: string;
      message: string;
      details?: string;
    },
  ): Promise<void> {
    const url = config.url;
    if (!url) {
      throw new Error("Slack webhook URL is missing from channel config");
    }

    const severityEmoji = this.getSeverityEmoji(alert.severity);
    const timestamp = new Date().toISOString();

    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${severityEmoji} ${alert.severity} Alert`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*Bot:*\n${alert.botName}`,
          },
          {
            type: "mrkdwn",
            text: `*Severity:*\n${alert.severity}`,
          },
          {
            type: "mrkdwn",
            text: `*Rule:*\n${alert.rule}`,
          },
          {
            type: "mrkdwn",
            text: `*Time:*\n${timestamp}`,
          },
        ],
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*Message:*\n${alert.message}`,
        },
      },
    ];

    if (alert.details) {
      blocks.push({
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `_Details: ${alert.details}_`,
          },
        ],
      });
    }

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blocks }),
    });

    if (!response.ok) {
      throw new Error(
        `Slack webhook responded with status ${response.status}`,
      );
    }
  }

  // ---- Generic Webhook -----------------------------------------------------

  private async sendWebhook(
    config: Record<string, any>,
    alert: {
      severity: string;
      rule: string;
      botName: string;
      message: string;
      details?: string;
    },
  ): Promise<void> {
    const url = config.url;
    if (!url) {
      throw new Error("Webhook URL is missing from channel config");
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(config.headers ?? {}),
    };

    const body = {
      event: "alert",
      source: "clawster",
      severity: alert.severity,
      rule: alert.rule,
      botName: alert.botName,
      message: alert.message,
      details: alert.details ?? null,
      timestamp: new Date().toISOString(),
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with status ${response.status}`);
    }
  }

  // ---- Helpers -------------------------------------------------------------

  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case "CRITICAL":
        return ":rotating_light:";
      case "ERROR":
        return ":x:";
      case "WARNING":
        return ":warning:";
      case "INFO":
        return ":information_source:";
      default:
        return ":bell:";
    }
  }
}
