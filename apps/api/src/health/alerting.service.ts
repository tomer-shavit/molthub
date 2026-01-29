import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  prisma,
  BotHealth,
  BotStatus,
  GatewayConnectionStatus,
  ChannelAuthState,
} from "@molthub/database";

// ---- Types -----------------------------------------------------------------

export type AlertRule =
  | "unreachable_instance"
  | "degraded_instance"
  | "config_drift"
  | "channel_auth_expired"
  | "health_check_failed";

export type AlertSeverity = "info" | "warning" | "error" | "critical";

export interface Alert {
  id: string;
  rule: AlertRule;
  severity: AlertSeverity;
  instanceId: string;
  instanceName: string;
  message: string;
  detail?: string;
  firstTriggeredAt: Date;
  lastTriggeredAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
}

/**
 * In-memory alert store. In a production system this would be backed by a DB
 * table; for WP-10 we use a memory map keyed by `rule:instanceId`.
 */
interface AlertRecord {
  id: string;
  rule: AlertRule;
  severity: AlertSeverity;
  instanceId: string;
  instanceName: string;
  message: string;
  detail?: string;
  firstTriggeredAt: Date;
  lastTriggeredAt: Date;
  acknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  /** Consecutive evaluation cycles the condition has been true. */
  consecutiveHits: number;
}

// ---- Thresholds ------------------------------------------------------------

/** Unreachable threshold in minutes. */
const UNREACHABLE_THRESHOLD_MIN = 2;

/** Degraded threshold in minutes. */
const DEGRADED_THRESHOLD_MIN = 5;

/** Consecutive health check failures threshold. */
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

// ---- Service ---------------------------------------------------------------

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  /** In-memory alert store. Key = `rule:instanceId`. */
  private readonly alerts = new Map<string, AlertRecord>();

  /** Auto-incrementing ID counter. */
  private nextId = 1;

  // ---- Scheduled evaluation ------------------------------------------------

  @Cron("*/60 * * * * *")
  async handleAlertEvaluationCron(): Promise<void> {
    try {
      await this.evaluateAlerts();
    } catch (err) {
      this.logger.error(`Alert evaluation failed: ${(err as Error).message}`);
    }
  }

  // ---- Public API ----------------------------------------------------------

  /**
   * Evaluate all alert rules across all instances.
   */
  async evaluateAlerts(): Promise<void> {
    const instances = await prisma.botInstance.findMany({
      where: {
        status: { notIn: [BotStatus.DELETING, BotStatus.CREATING] },
      },
      include: {
        gatewayConnection: true,
        channelAuthSessions: true,
      },
    });

    for (const instance of instances) {
      await this.evaluateUnreachable(instance);
      this.evaluateDegraded(instance);
      this.evaluateConfigDrift(instance);
      this.evaluateChannelAuthExpired(instance);
      this.evaluateHealthCheckFailed(instance);
    }

    // Clear alerts for conditions that are no longer true
    this.pruneResolvedAlerts(instances.map((i) => i.id));
  }

  /**
   * Return all active (non-acknowledged) alerts, optionally filtered by instance.
   */
  getActiveAlerts(instanceId?: string): Alert[] {
    const result: Alert[] = [];
    for (const record of this.alerts.values()) {
      if (record.acknowledged) continue;
      if (instanceId && record.instanceId !== instanceId) continue;
      result.push(this.toAlert(record));
    }
    return result.sort(
      (a, b) => b.lastTriggeredAt.getTime() - a.lastTriggeredAt.getTime(),
    );
  }

  /**
   * Return all alerts (including acknowledged), optionally filtered by instance.
   */
  getAllAlerts(instanceId?: string): Alert[] {
    const result: Alert[] = [];
    for (const record of this.alerts.values()) {
      if (instanceId && record.instanceId !== instanceId) continue;
      result.push(this.toAlert(record));
    }
    return result.sort(
      (a, b) => b.lastTriggeredAt.getTime() - a.lastTriggeredAt.getTime(),
    );
  }

  /**
   * Acknowledge an alert by ID.
   */
  acknowledgeAlert(alertId: string, acknowledgedBy?: string): Alert | null {
    for (const record of this.alerts.values()) {
      if (record.id === alertId) {
        record.acknowledged = true;
        record.acknowledgedAt = new Date();
        record.acknowledgedBy = acknowledgedBy ?? "system";
        return this.toAlert(record);
      }
    }
    return null;
  }

  /**
   * Get the count of active (unacknowledged) alerts.
   */
  getActiveAlertCount(): number {
    let count = 0;
    for (const record of this.alerts.values()) {
      if (!record.acknowledged) count++;
    }
    return count;
  }

  // ---- Rule evaluators -----------------------------------------------------

  private async evaluateUnreachable(instance: {
    id: string;
    name: string;
    gatewayConnection: {
      status: string;
      lastHeartbeat: Date | null;
    } | null;
  }): Promise<void> {
    const key = `unreachable_instance:${instance.id}`;
    const conn = instance.gatewayConnection;

    const isUnreachable =
      !conn ||
      conn.status === GatewayConnectionStatus.ERROR ||
      conn.status === GatewayConnectionStatus.DISCONNECTED;

    // Check duration
    const lastHeartbeat = conn?.lastHeartbeat;
    const minutesSinceHeartbeat = lastHeartbeat
      ? (Date.now() - lastHeartbeat.getTime()) / 60_000
      : Infinity;

    if (isUnreachable && minutesSinceHeartbeat >= UNREACHABLE_THRESHOLD_MIN) {
      this.upsertAlert(key, {
        rule: "unreachable_instance",
        severity: "critical",
        instanceId: instance.id,
        instanceName: instance.name,
        message: `Instance "${instance.name}" has been unreachable for ${Math.round(minutesSinceHeartbeat)} minutes`,
        detail: `Last heartbeat: ${lastHeartbeat?.toISOString() ?? "never"}`,
      });
    } else {
      this.resolveAlert(key);
    }
  }

  private evaluateDegraded(instance: {
    id: string;
    name: string;
    health: string;
    lastHealthCheckAt: Date | null;
  }): void {
    const key = `degraded_instance:${instance.id}`;

    if (instance.health !== BotHealth.DEGRADED) {
      this.resolveAlert(key);
      return;
    }

    const lastCheck = instance.lastHealthCheckAt;
    const minutesDegraded = lastCheck
      ? (Date.now() - lastCheck.getTime()) / 60_000
      : 0;

    const existing = this.alerts.get(key);
    const effectiveMinutes = existing
      ? (Date.now() - existing.firstTriggeredAt.getTime()) / 60_000
      : minutesDegraded;

    if (effectiveMinutes >= DEGRADED_THRESHOLD_MIN) {
      this.upsertAlert(key, {
        rule: "degraded_instance",
        severity: "warning",
        instanceId: instance.id,
        instanceName: instance.name,
        message: `Instance "${instance.name}" has been degraded for ${Math.round(effectiveMinutes)} minutes`,
      });
    }
  }

  private evaluateConfigDrift(instance: {
    id: string;
    name: string;
    configHash: string | null;
    gatewayConnection: {
      configHash: string | null;
    } | null;
  }): void {
    const key = `config_drift:${instance.id}`;

    const gwHash = instance.gatewayConnection?.configHash;
    const instanceHash = instance.configHash;

    if (gwHash && instanceHash && gwHash !== instanceHash) {
      this.upsertAlert(key, {
        rule: "config_drift",
        severity: "error",
        instanceId: instance.id,
        instanceName: instance.name,
        message: `Configuration drift detected on "${instance.name}"`,
        detail: `Instance hash: ${instanceHash}, Gateway hash: ${gwHash}`,
      });
    } else {
      this.resolveAlert(key);
    }
  }

  private evaluateChannelAuthExpired(instance: {
    id: string;
    name: string;
    channelAuthSessions: Array<{
      channelType: string;
      state: string;
    }>;
  }): void {
    const key = `channel_auth_expired:${instance.id}`;

    const expiredSessions = instance.channelAuthSessions.filter(
      (s) => s.state === ChannelAuthState.EXPIRED || s.state === ChannelAuthState.ERROR,
    );

    if (expiredSessions.length > 0) {
      const channels = expiredSessions.map((s) => s.channelType).join(", ");
      this.upsertAlert(key, {
        rule: "channel_auth_expired",
        severity: "error",
        instanceId: instance.id,
        instanceName: instance.name,
        message: `Channel auth expired/failed on "${instance.name}"`,
        detail: `Affected channels: ${channels}`,
      });
    } else {
      this.resolveAlert(key);
    }
  }

  private evaluateHealthCheckFailed(instance: {
    id: string;
    name: string;
    errorCount: number;
    health: string;
  }): void {
    const key = `health_check_failed:${instance.id}`;

    if (instance.errorCount >= CONSECUTIVE_FAILURE_THRESHOLD) {
      this.upsertAlert(key, {
        rule: "health_check_failed",
        severity: "error",
        instanceId: instance.id,
        instanceName: instance.name,
        message: `${instance.errorCount} consecutive health check failures on "${instance.name}"`,
      });
    } else {
      this.resolveAlert(key);
    }
  }

  // ---- Alert management helpers --------------------------------------------

  private upsertAlert(
    key: string,
    data: {
      rule: AlertRule;
      severity: AlertSeverity;
      instanceId: string;
      instanceName: string;
      message: string;
      detail?: string;
    },
  ): void {
    const existing = this.alerts.get(key);
    if (existing) {
      existing.lastTriggeredAt = new Date();
      existing.message = data.message;
      existing.detail = data.detail;
      existing.severity = data.severity;
      existing.consecutiveHits++;
      // Un-acknowledge if re-triggered after acknowledgment
      if (existing.acknowledged) {
        existing.acknowledged = false;
        existing.acknowledgedAt = undefined;
        existing.acknowledgedBy = undefined;
      }
    } else {
      const id = `alert_${this.nextId++}`;
      this.alerts.set(key, {
        id,
        rule: data.rule,
        severity: data.severity,
        instanceId: data.instanceId,
        instanceName: data.instanceName,
        message: data.message,
        detail: data.detail,
        firstTriggeredAt: new Date(),
        lastTriggeredAt: new Date(),
        acknowledged: false,
        consecutiveHits: 1,
      });
    }
  }

  private resolveAlert(key: string): void {
    this.alerts.delete(key);
  }

  /**
   * Remove alerts for instances that no longer exist.
   */
  private pruneResolvedAlerts(activeInstanceIds: string[]): void {
    const activeSet = new Set(activeInstanceIds);
    for (const [key, record] of this.alerts) {
      if (!activeSet.has(record.instanceId)) {
        this.alerts.delete(key);
      }
    }
  }

  private toAlert(record: AlertRecord): Alert {
    return {
      id: record.id,
      rule: record.rule,
      severity: record.severity,
      instanceId: record.instanceId,
      instanceName: record.instanceName,
      message: record.message,
      detail: record.detail,
      firstTriggeredAt: record.firstTriggeredAt,
      lastTriggeredAt: record.lastTriggeredAt,
      acknowledged: record.acknowledged,
      acknowledgedAt: record.acknowledgedAt,
      acknowledgedBy: record.acknowledgedBy,
    };
  }
}
