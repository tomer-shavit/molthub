import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  prisma,
  BotHealth,
  BotStatus,
  GatewayConnectionStatus,
  ChannelAuthState,
  AlertSeverity,
  AlertStatus,
} from "@molthub/database";
import { AlertsService } from "../alerts/alerts.service";

// ---- Types -----------------------------------------------------------------

export type AlertRule =
  | "unreachable_instance"
  | "degraded_instance"
  | "config_drift"
  | "channel_auth_expired"
  | "health_check_failed";

// ---- Thresholds ------------------------------------------------------------

/** Unreachable threshold in minutes. */
const UNREACHABLE_THRESHOLD_MIN = 2;

/** Degraded threshold in minutes. */
const DEGRADED_THRESHOLD_MIN = 5;

/** Consecutive health check failures threshold. */
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

// ---- Remediation action mapping --------------------------------------------

const REMEDIATION_ACTIONS: Record<AlertRule, string> = {
  unreachable_instance: "restart",
  degraded_instance: "run-doctor",
  config_drift: "reconcile",
  channel_auth_expired: "re-pair-channel",
  health_check_failed: "restart",
};

// ---- Service ---------------------------------------------------------------

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  constructor(private readonly alertsService: AlertsService) {}

  // ---- Scheduled evaluation ------------------------------------------------

  @Cron("*/60 * * * * *")
  async handleAlertEvaluationCron(): Promise<void> {
    try {
      await this.evaluateAlerts();
    } catch (err) {
      this.logger.error(`Alert evaluation failed: ${(err as Error).message}`);
    }
  }

  // ---- Public API (delegates to AlertsService) -----------------------------

  /**
   * Return all active (non-resolved) alerts, optionally filtered by instance.
   */
  async getActiveAlerts(instanceId?: string) {
    const result = await this.alertsService.listAlerts({
      instanceId,
      status: AlertStatus.ACTIVE,
    });
    return result.data;
  }

  /**
   * Return all alerts (including acknowledged/resolved), optionally filtered by instance.
   */
  async getAllAlerts(instanceId?: string) {
    const result = await this.alertsService.listAlerts({
      instanceId,
    });
    return result.data;
  }

  /**
   * Acknowledge an alert by ID.
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy?: string) {
    return this.alertsService.acknowledgeAlert(alertId, acknowledgedBy);
  }

  /**
   * Get the count of active (unacknowledged) alerts.
   */
  async getActiveAlertCount(): Promise<number> {
    return this.alertsService.getActiveAlertCount();
  }

  // ---- Alert evaluation engine ---------------------------------------------

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
      await this.evaluateDegraded(instance);
      await this.evaluateConfigDrift(instance);
      await this.evaluateChannelAuthExpired(instance);
      await this.evaluateHealthCheckFailed(instance);
    }
  }

  // ---- Rule evaluators -----------------------------------------------------

  private async evaluateUnreachable(instance: {
    id: string;
    name: string;
    fleetId: string;
    gatewayConnection: {
      status: string;
      lastHeartbeat: Date | null;
    } | null;
  }): Promise<void> {
    const conn = instance.gatewayConnection;

    const isUnreachable =
      !conn ||
      conn.status === GatewayConnectionStatus.ERROR ||
      conn.status === GatewayConnectionStatus.DISCONNECTED;

    const lastHeartbeat = conn?.lastHeartbeat;
    const minutesSinceHeartbeat = lastHeartbeat
      ? (Date.now() - lastHeartbeat.getTime()) / 60_000
      : Infinity;

    if (isUnreachable && minutesSinceHeartbeat >= UNREACHABLE_THRESHOLD_MIN) {
      await this.alertsService.upsertAlert({
        rule: "unreachable_instance",
        severity: AlertSeverity.CRITICAL,
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Instance unreachable: ${instance.name}`,
        message: `Instance "${instance.name}" has been unreachable for ${Math.round(minutesSinceHeartbeat)} minutes`,
        detail: `Last heartbeat: ${lastHeartbeat?.toISOString() ?? "never"}`,
        remediationAction: REMEDIATION_ACTIONS.unreachable_instance,
      });
    } else {
      await this.alertsService.resolveAlertByKey("unreachable_instance", instance.id);
    }
  }

  private async evaluateDegraded(instance: {
    id: string;
    name: string;
    fleetId: string;
    health: string;
    lastHealthCheckAt: Date | null;
  }): Promise<void> {
    if (instance.health !== BotHealth.DEGRADED) {
      await this.alertsService.resolveAlertByKey("degraded_instance", instance.id);
      return;
    }

    const lastCheck = instance.lastHealthCheckAt;
    const minutesDegraded = lastCheck
      ? (Date.now() - lastCheck.getTime()) / 60_000
      : 0;

    if (minutesDegraded >= DEGRADED_THRESHOLD_MIN) {
      await this.alertsService.upsertAlert({
        rule: "degraded_instance",
        severity: AlertSeverity.WARNING,
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Instance degraded: ${instance.name}`,
        message: `Instance "${instance.name}" has been degraded for ${Math.round(minutesDegraded)} minutes`,
        remediationAction: REMEDIATION_ACTIONS.degraded_instance,
      });
    }
  }

  private async evaluateConfigDrift(instance: {
    id: string;
    name: string;
    fleetId: string;
    configHash: string | null;
    gatewayConnection: {
      configHash: string | null;
    } | null;
  }): Promise<void> {
    const gwHash = instance.gatewayConnection?.configHash;
    const instanceHash = instance.configHash;

    if (gwHash && instanceHash && gwHash !== instanceHash) {
      await this.alertsService.upsertAlert({
        rule: "config_drift",
        severity: AlertSeverity.ERROR,
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Config drift: ${instance.name}`,
        message: `Configuration drift detected on "${instance.name}"`,
        detail: `Instance hash: ${instanceHash}, Gateway hash: ${gwHash}`,
        remediationAction: REMEDIATION_ACTIONS.config_drift,
      });
    } else {
      await this.alertsService.resolveAlertByKey("config_drift", instance.id);
    }
  }

  private async evaluateChannelAuthExpired(instance: {
    id: string;
    name: string;
    fleetId: string;
    channelAuthSessions: Array<{
      channelType: string;
      state: string;
    }>;
  }): Promise<void> {
    const expiredSessions = instance.channelAuthSessions.filter(
      (s) =>
        s.state === ChannelAuthState.EXPIRED ||
        s.state === ChannelAuthState.ERROR,
    );

    if (expiredSessions.length > 0) {
      const channels = expiredSessions.map((s) => s.channelType).join(", ");
      await this.alertsService.upsertAlert({
        rule: "channel_auth_expired",
        severity: AlertSeverity.ERROR,
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Channel auth expired: ${instance.name}`,
        message: `Channel auth expired/failed on "${instance.name}"`,
        detail: `Affected channels: ${channels}`,
        remediationAction: REMEDIATION_ACTIONS.channel_auth_expired,
      });
    } else {
      await this.alertsService.resolveAlertByKey("channel_auth_expired", instance.id);
    }
  }

  private async evaluateHealthCheckFailed(instance: {
    id: string;
    name: string;
    fleetId: string;
    errorCount: number;
    health: string;
  }): Promise<void> {
    if (instance.errorCount >= CONSECUTIVE_FAILURE_THRESHOLD) {
      await this.alertsService.upsertAlert({
        rule: "health_check_failed",
        severity: AlertSeverity.ERROR,
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Health check failed: ${instance.name}`,
        message: `${instance.errorCount} consecutive health check failures on "${instance.name}"`,
        remediationAction: REMEDIATION_ACTIONS.health_check_failed,
      });
    } else {
      await this.alertsService.resolveAlertByKey("health_check_failed", instance.id);
    }
  }
}
