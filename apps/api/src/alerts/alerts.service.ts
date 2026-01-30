import { Injectable, Logger } from "@nestjs/common";
import {
  prisma,
  AlertSeverity,
  AlertStatus,
  Prisma,
} from "@molthub/database";
import type { AlertQueryDto, AlertSummaryResponse } from "./alerts.dto";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UpsertAlertData {
  rule: string;
  instanceId?: string;
  fleetId?: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  detail?: string;
  remediationAction?: string;
  remediationNote?: string;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  // ---- Query methods -------------------------------------------------------

  /**
   * List alerts with optional filters and pagination.
   */
  async listAlerts(
    filters: AlertQueryDto,
  ): Promise<{ data: any[]; total: number; page: number; limit: number }> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 50;
    const skip = (page - 1) * limit;

    const where: Prisma.HealthAlertWhereInput = {};

    if (filters.instanceId) where.instanceId = filters.instanceId;
    if (filters.fleetId) where.fleetId = filters.fleetId;
    if (filters.severity) where.severity = filters.severity;
    if (filters.status) where.status = filters.status;
    if (filters.rule) where.rule = filters.rule;

    if (filters.from || filters.to) {
      where.firstTriggeredAt = {};
      if (filters.from) where.firstTriggeredAt.gte = new Date(filters.from);
      if (filters.to) where.firstTriggeredAt.lte = new Date(filters.to);
    }

    const [data, total] = await Promise.all([
      prisma.healthAlert.findMany({
        where,
        include: {
          instance: { select: { id: true, name: true, fleetId: true } },
          fleet: { select: { id: true, name: true } },
        },
        orderBy: { lastTriggeredAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.healthAlert.count({ where }),
    ]);

    return { data, total, page, limit };
  }

  /**
   * Get a single alert by ID with related instance/fleet data.
   */
  async getAlert(id: string) {
    return prisma.healthAlert.findUnique({
      where: { id },
      include: {
        instance: { select: { id: true, name: true, fleetId: true, health: true, status: true } },
        fleet: { select: { id: true, name: true } },
      },
    });
  }

  // ---- Status transition methods -------------------------------------------

  /**
   * Acknowledge an alert.
   */
  async acknowledgeAlert(id: string, acknowledgedBy?: string) {
    return prisma.healthAlert.update({
      where: { id },
      data: {
        status: AlertStatus.ACKNOWLEDGED,
        acknowledgedAt: new Date(),
        acknowledgedBy: acknowledgedBy ?? "system",
      },
    });
  }

  /**
   * Resolve an alert.
   */
  async resolveAlert(id: string) {
    return prisma.healthAlert.update({
      where: { id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });
  }

  /**
   * Suppress an alert.
   */
  async suppressAlert(id: string) {
    return prisma.healthAlert.update({
      where: { id },
      data: {
        status: AlertStatus.SUPPRESSED,
      },
    });
  }

  // ---- Upsert (used by the evaluator / alerting service) -------------------

  /**
   * Create or update an alert by composite key (rule + instanceId).
   * If an alert with the same rule and instanceId already exists and is not
   * RESOLVED, update it (bump consecutiveHits, lastTriggeredAt, etc.).
   * If it was previously RESOLVED or SUPPRESSED, re-activate it.
   */
  async upsertAlert(data: UpsertAlertData) {
    // Build composite lookup — rule + instanceId
    const existing = await prisma.healthAlert.findFirst({
      where: {
        rule: data.rule,
        instanceId: data.instanceId ?? null,
        status: { not: AlertStatus.RESOLVED },
      },
    });

    if (existing) {
      return prisma.healthAlert.update({
        where: { id: existing.id },
        data: {
          severity: data.severity,
          title: data.title,
          message: data.message,
          detail: data.detail,
          remediationAction: data.remediationAction,
          remediationNote: data.remediationNote,
          lastTriggeredAt: new Date(),
          consecutiveHits: { increment: 1 },
          // Re-activate if it was acknowledged or suppressed
          status: AlertStatus.ACTIVE,
          acknowledgedAt: null,
          acknowledgedBy: null,
        },
      });
    }

    // Create new alert
    return prisma.healthAlert.create({
      data: {
        rule: data.rule,
        instanceId: data.instanceId,
        fleetId: data.fleetId,
        severity: data.severity,
        status: AlertStatus.ACTIVE,
        title: data.title,
        message: data.message,
        detail: data.detail,
        remediationAction: data.remediationAction,
        remediationNote: data.remediationNote,
        firstTriggeredAt: new Date(),
        lastTriggeredAt: new Date(),
        consecutiveHits: 1,
      },
    });
  }

  /**
   * Resolve an alert matching rule + instanceId.
   * Used by the evaluator when a condition clears.
   */
  async resolveAlertByKey(rule: string, instanceId: string) {
    const existing = await prisma.healthAlert.findFirst({
      where: {
        rule,
        instanceId,
        status: { in: [AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED] },
      },
    });

    if (!existing) return null;

    return prisma.healthAlert.update({
      where: { id: existing.id },
      data: {
        status: AlertStatus.RESOLVED,
        resolvedAt: new Date(),
      },
    });
  }

  // ---- Summary / counts ----------------------------------------------------

  /**
   * Get counts grouped by severity and status.
   */
  async getAlertSummary(): Promise<AlertSummaryResponse> {
    const [bySeverityRaw, byStatusRaw, total] = await Promise.all([
      prisma.healthAlert.groupBy({
        by: ["severity"],
        _count: { id: true },
        where: { status: { not: AlertStatus.RESOLVED } },
      }),
      prisma.healthAlert.groupBy({
        by: ["status"],
        _count: { id: true },
      }),
      prisma.healthAlert.count({ where: { status: { not: AlertStatus.RESOLVED } } }),
    ]);

    const bySeverity: Record<string, number> = {};
    for (const row of bySeverityRaw) {
      bySeverity[row.severity] = row._count.id;
    }

    const byStatus: Record<string, number> = {};
    for (const row of byStatusRaw) {
      byStatus[row.status] = row._count.id;
    }

    return { bySeverity, byStatus, total };
  }

  /**
   * Return the count of alerts with status = ACTIVE.
   */
  async getActiveAlertCount(): Promise<number> {
    return prisma.healthAlert.count({
      where: { status: AlertStatus.ACTIVE },
    });
  }
}
