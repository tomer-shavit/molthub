import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  prisma,
  BudgetConfig,
  Prisma,
} from "@clawster/database";
import { CreateBudgetDto, UpdateBudgetDto, BudgetQueryDto } from "./costs.dto";

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  // ============================================
  // CRUD Operations
  // ============================================

  async create(dto: CreateBudgetDto): Promise<BudgetConfig> {
    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    return prisma.budgetConfig.create({
      data: {
        name: dto.name,
        description: dto.description,
        instanceId: dto.instanceId,
        fleetId: dto.fleetId,
        monthlyLimitCents: dto.monthlyLimitCents,
        currency: dto.currency ?? "USD",
        warnThresholdPct: dto.warnThresholdPct ?? 75,
        criticalThresholdPct: dto.criticalThresholdPct ?? 90,
        periodStart: now,
        periodEnd,
        createdBy: "system",
      },
    });
  }

  async findAll(query: BudgetQueryDto): Promise<BudgetConfig[]> {
    const where: Prisma.BudgetConfigWhereInput = {};

    if (query.instanceId) where.instanceId = query.instanceId;
    if (query.fleetId) where.fleetId = query.fleetId;
    if (query.isActive !== undefined) where.isActive = query.isActive;

    return prisma.budgetConfig.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async findOne(id: string): Promise<BudgetConfig> {
    const budget = await prisma.budgetConfig.findUnique({
      where: { id },
    });

    if (!budget) {
      throw new NotFoundException(`Budget config ${id} not found`);
    }

    return budget;
  }

  async update(id: string, dto: UpdateBudgetDto): Promise<BudgetConfig> {
    await this.findOne(id);

    return prisma.budgetConfig.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.monthlyLimitCents !== undefined && {
          monthlyLimitCents: dto.monthlyLimitCents,
        }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.warnThresholdPct !== undefined && {
          warnThresholdPct: dto.warnThresholdPct,
        }),
        ...(dto.criticalThresholdPct !== undefined && {
          criticalThresholdPct: dto.criticalThresholdPct,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await prisma.budgetConfig.delete({ where: { id } });
  }

  // ============================================
  // Cron Jobs
  // ============================================

  /**
   * Check budget thresholds every 5 minutes.
   * Creates or updates HealthAlert records when thresholds are exceeded.
   * Resolves alerts when spend drops below thresholds.
   */
  @Cron("*/5 * * * *")
  async checkBudgetThresholds(): Promise<void> {
    this.logger.debug("Checking budget thresholds...");

    const activeBudgets = await prisma.budgetConfig.findMany({
      where: { isActive: true },
    });

    for (const budget of activeBudgets) {
      const spendPct =
        budget.monthlyLimitCents > 0
          ? (budget.currentSpendCents / budget.monthlyLimitCents) * 100
          : 0;

      const isCritical = spendPct >= budget.criticalThresholdPct;
      const isWarning = spendPct >= budget.warnThresholdPct;

      // Handle critical threshold
      await this.handleThresholdAlert(
        budget,
        "budget_critical",
        isCritical,
        "CRITICAL",
        spendPct,
      );

      // Handle warning threshold
      await this.handleThresholdAlert(
        budget,
        "budget_warning",
        isWarning && !isCritical,
        "WARNING",
        spendPct,
      );
    }

    this.logger.debug(
      `Budget threshold check complete. Checked ${activeBudgets.length} budgets.`,
    );
  }

  /**
   * Reset monthly budgets on the 1st of each month at midnight.
   * Resets currentSpendCents to 0 and updates periodStart/periodEnd.
   */
  @Cron("0 0 1 * *")
  async resetMonthlyBudgets(): Promise<void> {
    this.logger.log("Resetting monthly budgets...");

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const result = await prisma.budgetConfig.updateMany({
      where: { isActive: true },
      data: {
        currentSpendCents: 0,
        periodStart: now,
        periodEnd,
      },
    });

    this.logger.log(`Reset ${result.count} active budgets for new period.`);
  }

  // ============================================
  // Private Helpers
  // ============================================

  private async handleThresholdAlert(
    budget: BudgetConfig,
    rule: string,
    isTriggered: boolean,
    severity: string,
    spendPct: number,
  ): Promise<void> {
    // Find existing active alert for this budget + rule
    const existingAlert = await prisma.healthAlert.findFirst({
      where: {
        rule,
        status: { in: ["ACTIVE", "ACKNOWLEDGED"] },
        ...(budget.instanceId && { instanceId: budget.instanceId }),
        ...(budget.fleetId && { fleetId: budget.fleetId }),
      },
    });

    if (isTriggered) {
      const title = `Budget ${rule === "budget_critical" ? "critical" : "warning"}: ${budget.name}`;
      const message = `Budget "${budget.name}" is at ${spendPct.toFixed(1)}% ($${(budget.currentSpendCents / 100).toFixed(2)} of $${(budget.monthlyLimitCents / 100).toFixed(2)} limit).`;

      if (existingAlert) {
        // Update existing alert
        await prisma.healthAlert.update({
          where: { id: existingAlert.id },
          data: {
            lastTriggeredAt: new Date(),
            consecutiveHits: { increment: 1 },
            message,
            severity,
          },
        });
      } else {
        // Create new alert
        await prisma.healthAlert.create({
          data: {
            instanceId: budget.instanceId,
            fleetId: budget.fleetId,
            rule,
            severity,
            status: "ACTIVE",
            title,
            message,
            detail: JSON.stringify({
              budgetId: budget.id,
              budgetName: budget.name,
              currentSpendCents: budget.currentSpendCents,
              monthlyLimitCents: budget.monthlyLimitCents,
              spendPct,
            }),
            remediationAction: "review_costs",
            remediationNote: `Review cost events and consider adjusting the budget limit or reducing usage.`,
          },
        });
      }
    } else if (existingAlert) {
      // Resolve the alert since we're below threshold
      await prisma.healthAlert.update({
        where: { id: existingAlert.id },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
        },
      });
    }
  }
}
