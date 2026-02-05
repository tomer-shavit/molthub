import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  PrismaClient,
  PRISMA_CLIENT,
  BOT_INSTANCE_REPOSITORY,
  IBotInstanceRepository,
} from "@clawster/database";
import { AlertsService } from "../alerts/alerts.service";
import { NotificationDeliveryService } from "../notification-channels/notification-delivery.service";

// ---- Types -----------------------------------------------------------------

export type AlertRule =
  | "unreachable_instance"
  | "degraded_instance"
  | "config_drift"
  | "channel_auth_expired"
  | "health_check_failed"
  | "token_spike"
  | "budget_warning"
  | "budget_critical"
  | "budget_daily_warning"
  | "budget_daily_critical";

// ---- Thresholds ------------------------------------------------------------

/** Unreachable threshold in minutes. */
const UNREACHABLE_THRESHOLD_MIN = 2;

/** Degraded threshold in minutes. */
const DEGRADED_THRESHOLD_MIN = 5;

/** Consecutive health check failures threshold. */
const CONSECUTIVE_FAILURE_THRESHOLD = 3;

/** Token spike recent window in minutes. */
const TOKEN_SPIKE_RECENT_WINDOW_MIN = 5;

/** Token spike baseline window in minutes. */
const TOKEN_SPIKE_BASELINE_WINDOW_MIN = 30;

/** Token spike threshold as a multiplier (200% = 2x above baseline). */
const TOKEN_SPIKE_THRESHOLD_MULTIPLIER = 2;

/** Minimum number of events in the recent window to trigger a spike alert. */
const TOKEN_SPIKE_MIN_RECENT_EVENTS = 2;

// ---- Remediation action mapping --------------------------------------------

const REMEDIATION_ACTIONS: Record<AlertRule, string> = {
  unreachable_instance: "restart",
  degraded_instance: "run-doctor",
  config_drift: "reconcile",
  channel_auth_expired: "re-pair-channel",
  health_check_failed: "restart",
  token_spike: "review_costs",
  budget_warning: "review_costs",
  budget_critical: "review_costs",
  budget_daily_warning: "review_costs",
  budget_daily_critical: "review_costs",
};

// ---- Service ---------------------------------------------------------------

@Injectable()
export class AlertingService {
  private readonly logger = new Logger(AlertingService.name);

  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    @Inject(BOT_INSTANCE_REPOSITORY) private readonly botInstanceRepo: IBotInstanceRepository,
    private readonly alertsService: AlertsService,
    private readonly notificationDeliveryService: NotificationDeliveryService,
  ) {}

  // ---- Notification delivery helper ----------------------------------------

  /**
   * Upsert an alert and trigger notification delivery in the background.
   * Notification failures are logged but never block alert evaluation.
   */
  private async upsertAlertAndNotify(
    data: Parameters<AlertsService["upsertAlert"]>[0],
    botInstanceId?: string,
  ): Promise<void> {
    const alert = await this.alertsService.upsertAlert(data);

    // Fire-and-forget notification delivery — do not await
    this.notificationDeliveryService
      .deliverAlert({
        severity: data.severity,
        rule: data.rule,
        botInstanceId,
        message: data.message,
        details: data.detail,
      })
      .catch((err) => {
        this.logger.warn(
          `Notification delivery failed for alert "${alert.id}": ${(err as Error).message}`,
        );
      });
  }

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
      status: "ACTIVE",
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
    const instances = await this.prisma.botInstance.findMany({
      where: {
        status: { notIn: ["DELETING", "CREATING"] },
      },
      include: {
        gatewayConnection: true,
        channelAuthSessions: true,
      },
    });

    for (const instance of instances) {
      await Promise.all([
        this.evaluateUnreachable(instance),
        this.evaluateDegraded(instance),
        this.evaluateConfigDrift(instance),
        this.evaluateChannelAuthExpired(instance),
        this.evaluateHealthCheckFailed(instance),
        this.evaluateTokenSpike(instance),
        this.evaluateBudgetThresholds(instance),
      ]);
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
      conn.status === "ERROR" ||
      conn.status === "DISCONNECTED";

    const lastHeartbeat = conn?.lastHeartbeat;
    const minutesSinceHeartbeat = lastHeartbeat
      ? (Date.now() - lastHeartbeat.getTime()) / 60_000
      : Infinity;

    if (isUnreachable && minutesSinceHeartbeat >= UNREACHABLE_THRESHOLD_MIN) {
      await this.upsertAlertAndNotify({
        rule: "unreachable_instance",
        severity: "CRITICAL",
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Instance unreachable: ${instance.name}`,
        message: `Instance "${instance.name}" has been unreachable for ${Math.round(minutesSinceHeartbeat)} minutes`,
        detail: `Last heartbeat: ${lastHeartbeat?.toISOString() ?? "never"}`,
        remediationAction: REMEDIATION_ACTIONS.unreachable_instance,
      }, instance.id);
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
    if (instance.health !== "DEGRADED") {
      await this.alertsService.resolveAlertByKey("degraded_instance", instance.id);
      return;
    }

    const lastCheck = instance.lastHealthCheckAt;
    const minutesDegraded = lastCheck
      ? (Date.now() - lastCheck.getTime()) / 60_000
      : 0;

    if (minutesDegraded >= DEGRADED_THRESHOLD_MIN) {
      await this.upsertAlertAndNotify({
        rule: "degraded_instance",
        severity: "WARNING",
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Instance degraded: ${instance.name}`,
        message: `Instance "${instance.name}" has been degraded for ${Math.round(minutesDegraded)} minutes`,
        remediationAction: REMEDIATION_ACTIONS.degraded_instance,
      }, instance.id);
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
      await this.upsertAlertAndNotify({
        rule: "config_drift",
        severity: "ERROR",
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Config drift: ${instance.name}`,
        message: `Configuration drift detected on "${instance.name}"`,
        detail: `Instance hash: ${instanceHash}, Gateway hash: ${gwHash}`,
        remediationAction: REMEDIATION_ACTIONS.config_drift,
      }, instance.id);
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
        s.state === "EXPIRED" ||
        s.state === "ERROR",
    );

    if (expiredSessions.length > 0) {
      const channels = expiredSessions.map((s) => s.channelType).join(", ");
      await this.upsertAlertAndNotify({
        rule: "channel_auth_expired",
        severity: "ERROR",
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Channel auth expired: ${instance.name}`,
        message: `Channel auth expired/failed on "${instance.name}"`,
        detail: `Affected channels: ${channels}`,
        remediationAction: REMEDIATION_ACTIONS.channel_auth_expired,
      }, instance.id);
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
      await this.upsertAlertAndNotify({
        rule: "health_check_failed",
        severity: "ERROR",
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Health check failed: ${instance.name}`,
        message: `${instance.errorCount} consecutive health check failures on "${instance.name}"`,
        remediationAction: REMEDIATION_ACTIONS.health_check_failed,
      }, instance.id);
    } else {
      await this.alertsService.resolveAlertByKey("health_check_failed", instance.id);
    }
  }

  private async evaluateTokenSpike(instance: {
    id: string;
    name: string;
    fleetId: string;
  }): Promise<void> {
    const now = new Date();
    const recentStart = new Date(now.getTime() - TOKEN_SPIKE_RECENT_WINDOW_MIN * 60_000);
    const baselineStart = new Date(recentStart.getTime() - TOKEN_SPIKE_BASELINE_WINDOW_MIN * 60_000);

    const [recentEvents, baselineEvents] = await Promise.all([
      this.prisma.costEvent.findMany({
        where: {
          instanceId: instance.id,
          occurredAt: { gte: recentStart, lte: now },
        },
        select: { inputTokens: true, outputTokens: true },
      }),
      this.prisma.costEvent.findMany({
        where: {
          instanceId: instance.id,
          occurredAt: { gte: baselineStart, lt: recentStart },
        },
        select: { inputTokens: true, outputTokens: true },
      }),
    ]);

    // No recent data — resolve any existing alert and return
    if (recentEvents.length === 0) {
      await this.alertsService.resolveAlertByKey("token_spike", instance.id);
      return;
    }

    // No baseline data — skip evaluation (cannot determine spike without baseline)
    if (baselineEvents.length === 0) {
      return;
    }

    const recentTokens = recentEvents.reduce(
      (sum, e) => sum + e.inputTokens + e.outputTokens,
      0,
    );
    const baselineTokens = baselineEvents.reduce(
      (sum, e) => sum + e.inputTokens + e.outputTokens,
      0,
    );

    const recentTokensPerMin = recentTokens / TOKEN_SPIKE_RECENT_WINDOW_MIN;
    const baselineTokensPerMin = baselineTokens / TOKEN_SPIKE_BASELINE_WINDOW_MIN;

    const isSpiking =
      recentEvents.length >= TOKEN_SPIKE_MIN_RECENT_EVENTS &&
      baselineTokensPerMin > 0 &&
      recentTokensPerMin > TOKEN_SPIKE_THRESHOLD_MULTIPLIER * baselineTokensPerMin;

    if (isSpiking) {
      const spikePercentage = Math.round(
        ((recentTokensPerMin - baselineTokensPerMin) / baselineTokensPerMin) * 100,
      );

      await this.upsertAlertAndNotify({
        rule: "token_spike",
        severity: "WARNING",
        instanceId: instance.id,
        fleetId: instance.fleetId,
        title: `Token usage spike detected for ${instance.name}`,
        message: `Token usage spiked ${spikePercentage}% above baseline (${Math.round(recentTokensPerMin)} tokens/min vs ${Math.round(baselineTokensPerMin)} tokens/min baseline)`,
        detail: JSON.stringify({
          recentTokens,
          baselineTokens,
          spikePercentage,
          recentWindowMinutes: TOKEN_SPIKE_RECENT_WINDOW_MIN,
          baselineWindowMinutes: TOKEN_SPIKE_BASELINE_WINDOW_MIN,
        }),
        remediationAction: REMEDIATION_ACTIONS.token_spike,
      }, instance.id);
    } else {
      await this.alertsService.resolveAlertByKey("token_spike", instance.id);
    }
  }

  // ---- Budget threshold evaluator ------------------------------------------

  /**
   * Evaluate budget thresholds for an instance.
   * Queries active BudgetConfig records scoped to this instance or its fleet,
   * checks both monthly and daily spend against configured thresholds,
   * and fires WARNING or CRITICAL alerts when thresholds are exceeded.
   *
   * Alert payload includes: bot name, current spend, budget limit, percentage used.
   */
  private async evaluateBudgetThresholds(instance: {
    id: string;
    name: string;
    fleetId: string;
  }): Promise<void> {
    // Find active budgets scoped to this instance or its fleet
    const budgets = await this.prisma.budgetConfig.findMany({
      where: {
        isActive: true,
        OR: [
          { instanceId: instance.id },
          { fleetId: instance.fleetId },
        ],
      },
    });

    if (budgets.length === 0) {
      // No budgets configured — resolve any lingering budget alerts
      await this.alertsService.resolveAlertByKey("budget_warning", instance.id);
      await this.alertsService.resolveAlertByKey("budget_critical", instance.id);
      await this.alertsService.resolveAlertByKey("budget_daily_warning", instance.id);
      await this.alertsService.resolveAlertByKey("budget_daily_critical", instance.id);
      return;
    }

    // Evaluate monthly and daily thresholds
    await this.evaluateMonthlyBudgetThresholds(instance, budgets);
    await this.evaluateDailyBudgetThresholds(instance, budgets);
  }

  /**
   * Evaluate monthly budget thresholds.
   */
  private async evaluateMonthlyBudgetThresholds(
    instance: { id: string; name: string; fleetId: string },
    budgets: Array<{
      id: string;
      name: string;
      monthlyLimitCents: number;
      warnThresholdPct: number;
      criticalThresholdPct: number;
      currentSpendCents: number;
    }>,
  ): Promise<void> {
    // Use stored currentSpendCents from budget (updated on each cost event)
    let worstCritical = false;
    let worstWarning = false;
    let worstBudget: (typeof budgets)[0] | null = null;
    let worstSpendPct = 0;
    let worstSpendCents = 0;

    for (const budget of budgets) {
      if (budget.monthlyLimitCents <= 0) continue;

      const spendPct = (budget.currentSpendCents / budget.monthlyLimitCents) * 100;

      if (spendPct >= budget.criticalThresholdPct && spendPct > worstSpendPct) {
        worstCritical = true;
        worstWarning = false;
        worstBudget = budget;
        worstSpendPct = spendPct;
        worstSpendCents = budget.currentSpendCents;
      } else if (
        spendPct >= budget.warnThresholdPct &&
        !worstCritical &&
        spendPct > worstSpendPct
      ) {
        worstWarning = true;
        worstBudget = budget;
        worstSpendPct = spendPct;
        worstSpendCents = budget.currentSpendCents;
      }
    }

    // Fire or resolve CRITICAL alert
    if (worstCritical && worstBudget) {
      await this.upsertAlertAndNotify(
        {
          rule: "budget_critical",
          severity: "CRITICAL",
          instanceId: instance.id,
          fleetId: instance.fleetId,
          title: `Monthly budget critical: ${instance.name}`,
          message: `Budget "${worstBudget.name}" is at ${worstSpendPct.toFixed(1)}% ($${(worstSpendCents / 100).toFixed(2)} of $${(worstBudget.monthlyLimitCents / 100).toFixed(2)} monthly limit)`,
          detail: JSON.stringify({
            budgetId: worstBudget.id,
            budgetName: worstBudget.name,
            currentSpendCents: worstSpendCents,
            monthlyLimitCents: worstBudget.monthlyLimitCents,
            spendPct: worstSpendPct,
            instanceName: instance.name,
            type: "monthly",
          }),
          remediationAction: REMEDIATION_ACTIONS.budget_critical,
          remediationNote:
            "Review cost events and consider adjusting the budget limit or reducing usage.",
        },
        instance.id,
      );
    } else {
      await this.alertsService.resolveAlertByKey("budget_critical", instance.id);
    }

    // Fire or resolve WARNING alert (only fires when warning but not critical)
    if (worstWarning && worstBudget) {
      await this.upsertAlertAndNotify(
        {
          rule: "budget_warning",
          severity: "WARNING",
          instanceId: instance.id,
          fleetId: instance.fleetId,
          title: `Monthly budget warning: ${instance.name}`,
          message: `Budget "${worstBudget.name}" is at ${worstSpendPct.toFixed(1)}% ($${(worstSpendCents / 100).toFixed(2)} of $${(worstBudget.monthlyLimitCents / 100).toFixed(2)} monthly limit)`,
          detail: JSON.stringify({
            budgetId: worstBudget.id,
            budgetName: worstBudget.name,
            currentSpendCents: worstSpendCents,
            monthlyLimitCents: worstBudget.monthlyLimitCents,
            spendPct: worstSpendPct,
            instanceName: instance.name,
            type: "monthly",
          }),
          remediationAction: REMEDIATION_ACTIONS.budget_warning,
          remediationNote:
            "Review cost events and consider adjusting the budget limit or reducing usage.",
        },
        instance.id,
      );
    } else {
      await this.alertsService.resolveAlertByKey("budget_warning", instance.id);
    }
  }

  /**
   * Evaluate daily budget thresholds.
   */
  private async evaluateDailyBudgetThresholds(
    instance: { id: string; name: string; fleetId: string },
    budgets: Array<{
      id: string;
      name: string;
      dailyLimitCents: number | null;
      dailyWarnThresholdPct: number | null;
      dailyCriticalThresholdPct: number | null;
      currentDailySpendCents: number;
    }>,
  ): Promise<void> {
    // Filter to budgets that have daily limits configured
    const dailyBudgets = budgets.filter((b) => b.dailyLimitCents && b.dailyLimitCents > 0);

    if (dailyBudgets.length === 0) {
      // No daily budgets configured — resolve any lingering daily alerts
      await this.alertsService.resolveAlertByKey("budget_daily_warning", instance.id);
      await this.alertsService.resolveAlertByKey("budget_daily_critical", instance.id);
      return;
    }

    let worstCritical = false;
    let worstWarning = false;
    let worstBudget: (typeof dailyBudgets)[0] | null = null;
    let worstSpendPct = 0;
    let worstSpendCents = 0;

    for (const budget of dailyBudgets) {
      const dailyLimit = budget.dailyLimitCents!;
      const warnPct = budget.dailyWarnThresholdPct ?? 75;
      const critPct = budget.dailyCriticalThresholdPct ?? 90;

      const spendPct = (budget.currentDailySpendCents / dailyLimit) * 100;

      if (spendPct >= critPct && spendPct > worstSpendPct) {
        worstCritical = true;
        worstWarning = false;
        worstBudget = budget;
        worstSpendPct = spendPct;
        worstSpendCents = budget.currentDailySpendCents;
      } else if (spendPct >= warnPct && !worstCritical && spendPct > worstSpendPct) {
        worstWarning = true;
        worstBudget = budget;
        worstSpendPct = spendPct;
        worstSpendCents = budget.currentDailySpendCents;
      }
    }

    // Fire or resolve daily CRITICAL alert
    if (worstCritical && worstBudget) {
      await this.upsertAlertAndNotify(
        {
          rule: "budget_daily_critical",
          severity: "CRITICAL",
          instanceId: instance.id,
          fleetId: instance.fleetId,
          title: `Daily budget critical: ${instance.name}`,
          message: `Budget "${worstBudget.name}" daily spend is at ${worstSpendPct.toFixed(1)}% ($${(worstSpendCents / 100).toFixed(2)} of $${(worstBudget.dailyLimitCents! / 100).toFixed(2)} daily limit)`,
          detail: JSON.stringify({
            budgetId: worstBudget.id,
            budgetName: worstBudget.name,
            currentDailySpendCents: worstSpendCents,
            dailyLimitCents: worstBudget.dailyLimitCents,
            spendPct: worstSpendPct,
            instanceName: instance.name,
            type: "daily",
          }),
          remediationAction: REMEDIATION_ACTIONS.budget_daily_critical,
          remediationNote:
            "Daily spend limit exceeded. Review today's cost events and consider reducing usage.",
        },
        instance.id,
      );
    } else {
      await this.alertsService.resolveAlertByKey("budget_daily_critical", instance.id);
    }

    // Fire or resolve daily WARNING alert (only fires when warning but not critical)
    if (worstWarning && worstBudget) {
      await this.upsertAlertAndNotify(
        {
          rule: "budget_daily_warning",
          severity: "WARNING",
          instanceId: instance.id,
          fleetId: instance.fleetId,
          title: `Daily budget warning: ${instance.name}`,
          message: `Budget "${worstBudget.name}" daily spend is at ${worstSpendPct.toFixed(1)}% ($${(worstSpendCents / 100).toFixed(2)} of $${(worstBudget.dailyLimitCents! / 100).toFixed(2)} daily limit)`,
          detail: JSON.stringify({
            budgetId: worstBudget.id,
            budgetName: worstBudget.name,
            currentDailySpendCents: worstSpendCents,
            dailyLimitCents: worstBudget.dailyLimitCents,
            spendPct: worstSpendPct,
            instanceName: instance.name,
            type: "daily",
          }),
          remediationAction: REMEDIATION_ACTIONS.budget_daily_warning,
          remediationNote:
            "Approaching daily spend limit. Review today's cost events and consider reducing usage.",
        },
        instance.id,
      );
    } else {
      await this.alertsService.resolveAlertByKey("budget_daily_warning", instance.id);
    }
  }
}
