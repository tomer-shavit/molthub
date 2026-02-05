import { Injectable, NotFoundException, Logger, Inject, BadRequestException } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import {
  BudgetConfig,
  COST_REPOSITORY,
  ICostRepository,
} from "@clawster/database";
import { CreateBudgetDto, UpdateBudgetDto, BudgetQueryDto } from "./costs.dto";

@Injectable()
export class BudgetService {
  private readonly logger = new Logger(BudgetService.name);

  constructor(
    @Inject(COST_REPOSITORY)
    private readonly costRepo: ICostRepository,
  ) {}

  // ============================================
  // CRUD Operations
  // ============================================

  async create(dto: CreateBudgetDto): Promise<BudgetConfig> {
    // Validate threshold relationships
    this.validateThresholds(dto);

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    // Set daily period start to beginning of today (UTC)
    const dailyPeriodStart = dto.dailyLimitCents
      ? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
      : undefined;

    return this.costRepo.createBudget({
      name: dto.name,
      description: dto.description,
      instance: dto.instanceId ? { connect: { id: dto.instanceId } } : undefined,
      fleet: dto.fleetId ? { connect: { id: dto.fleetId } } : undefined,
      monthlyLimitCents: dto.monthlyLimitCents,
      currency: dto.currency ?? "USD",
      warnThresholdPct: dto.warnThresholdPct ?? 75,
      criticalThresholdPct: dto.criticalThresholdPct ?? 90,
      periodStart: now,
      periodEnd,
      // Daily limit fields
      dailyLimitCents: dto.dailyLimitCents,
      dailyWarnThresholdPct: dto.dailyWarnThresholdPct ?? 75,
      dailyCriticalThresholdPct: dto.dailyCriticalThresholdPct ?? 90,
      dailyPeriodStart,
      createdBy: "system",
    });
  }

  async findAll(query: BudgetQueryDto): Promise<BudgetConfig[]> {
    return this.costRepo.findBudgets({
      instanceId: query.instanceId,
      fleetId: query.fleetId,
      isActive: query.isActive,
    });
  }

  async findOne(id: string): Promise<BudgetConfig> {
    const budget = await this.costRepo.findBudget(id);

    if (!budget) {
      throw new NotFoundException(`Budget config ${id} not found`);
    }

    return budget;
  }

  async update(id: string, dto: UpdateBudgetDto): Promise<BudgetConfig> {
    const existing = await this.findOne(id);

    // Validate threshold relationships (merge with existing values for validation)
    this.validateThresholds({
      warnThresholdPct: dto.warnThresholdPct ?? existing.warnThresholdPct,
      criticalThresholdPct: dto.criticalThresholdPct ?? existing.criticalThresholdPct,
      dailyWarnThresholdPct: dto.dailyWarnThresholdPct ?? existing.dailyWarnThresholdPct ?? undefined,
      dailyCriticalThresholdPct: dto.dailyCriticalThresholdPct ?? existing.dailyCriticalThresholdPct ?? undefined,
    });

    return this.costRepo.updateBudget(id, {
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
      // Daily limit fields
      ...(dto.dailyLimitCents !== undefined && {
        dailyLimitCents: dto.dailyLimitCents,
      }),
      ...(dto.dailyWarnThresholdPct !== undefined && {
        dailyWarnThresholdPct: dto.dailyWarnThresholdPct,
      }),
      ...(dto.dailyCriticalThresholdPct !== undefined && {
        dailyCriticalThresholdPct: dto.dailyCriticalThresholdPct,
      }),
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await this.costRepo.deleteBudget(id);
  }

  // ============================================
  // Cron Jobs
  // ============================================

  // NOTE: Budget threshold checking is handled by AlertingService (every 60s).
  // This service only handles period resets.

  /**
   * Reset monthly budgets on the 1st of each month at midnight UTC.
   * Resets currentSpendCents to 0 and updates periodStart/periodEnd.
   */
  @Cron("0 0 1 * *")
  async resetMonthlyBudgets(): Promise<void> {
    this.logger.log("Resetting monthly budgets...");

    const now = new Date();
    const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

    const count = await this.costRepo.resetAllActiveBudgets(now, periodEnd);

    this.logger.log(`Reset ${count} active budgets for new period.`);
  }

  /**
   * Reset daily budgets at midnight UTC every day.
   * Resets currentDailySpendCents to 0 and updates dailyPeriodStart.
   */
  @Cron("0 0 * * *")
  async resetDailyBudgets(): Promise<void> {
    this.logger.log("Resetting daily budgets...");

    const now = new Date();
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const count = await this.costRepo.resetAllDailyBudgets(todayStart);

    this.logger.log(`Reset daily spend for ${count} active budgets.`);
  }

  // ============================================
  // Private Helpers
  // ============================================

  /**
   * Validate that warning thresholds are less than critical thresholds.
   */
  private validateThresholds(dto: {
    warnThresholdPct?: number;
    criticalThresholdPct?: number;
    dailyWarnThresholdPct?: number;
    dailyCriticalThresholdPct?: number;
  }): void {
    const warnPct = dto.warnThresholdPct ?? 75;
    const critPct = dto.criticalThresholdPct ?? 90;

    if (warnPct >= critPct) {
      throw new BadRequestException(
        "Monthly warning threshold must be less than critical threshold",
      );
    }

    // Only validate daily thresholds if both are provided
    if (dto.dailyWarnThresholdPct !== undefined && dto.dailyCriticalThresholdPct !== undefined) {
      if (dto.dailyWarnThresholdPct >= dto.dailyCriticalThresholdPct) {
        throw new BadRequestException(
          "Daily warning threshold must be less than critical threshold",
        );
      }
    }
  }
}
