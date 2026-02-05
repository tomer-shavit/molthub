import { PrismaClient, CostEvent, BudgetConfig, Prisma } from "@prisma/client";
import type {
  ICostRepository,
  CostEventFilters,
  CostSummaryFilters,
  CostSummary,
  CostSummaryByInstance,
  CostSummaryByProvider,
  CostSummaryByModel,
  BudgetStatus,
  BudgetFilters,
  CreateCostEventInput,
} from "../interfaces/cost.repository";
import type {
  PaginationOptions,
  PaginatedResult,
  TransactionClient,
} from "../interfaces/base";

export class PrismaCostRepository implements ICostRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: TransactionClient): PrismaClient | TransactionClient {
    return tx ?? this.prisma;
  }

  private buildEventWhereClause(filters?: CostEventFilters): Prisma.CostEventWhereInput {
    if (!filters) return {};

    const where: Prisma.CostEventWhereInput = {};

    if (filters.instanceId) {
      where.instanceId = filters.instanceId;
    }

    if (filters.provider) {
      where.provider = filters.provider;
    }

    if (filters.model) {
      where.model = filters.model;
    }

    if (filters.channelType) {
      where.channelType = filters.channelType;
    }

    if (filters.startDate || filters.endDate) {
      where.occurredAt = {};
      if (filters.startDate) {
        where.occurredAt.gte = filters.startDate;
      }
      if (filters.endDate) {
        where.occurredAt.lte = filters.endDate;
      }
    }

    return where;
  }

  async recordEvent(
    data: CreateCostEventInput,
    tx?: TransactionClient
  ): Promise<CostEvent> {
    const client = this.getClient(tx);

    // Create the cost event
    const costEvent = await client.costEvent.create({
      data: {
        instanceId: data.instanceId,
        provider: data.provider,
        model: data.model,
        inputTokens: data.inputTokens ?? 0,
        outputTokens: data.outputTokens ?? 0,
        costCents: data.costCents,
        channelType: data.channelType,
        traceId: data.traceId,
        metadata: data.metadata ? JSON.stringify(data.metadata) : "{}",
      },
    });

    // Get the instance to find its fleet
    const instance = await client.botInstance.findUnique({
      where: { id: data.instanceId },
      select: { fleetId: true },
    });

    if (instance) {
      // Update matching BudgetConfig currentSpendCents (monthly) and currentDailySpendCents (daily)
      await client.budgetConfig.updateMany({
        where: {
          isActive: true,
          OR: [
            { instanceId: data.instanceId },
            { fleetId: instance.fleetId },
          ],
        },
        data: {
          currentSpendCents: {
            increment: data.costCents,
          },
          currentDailySpendCents: {
            increment: data.costCents,
          },
        },
      });
    }

    return costEvent;
  }

  async findByInstance(
    instanceId: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<CostEvent>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.prisma.costEvent.findMany({
        where: { instanceId },
        skip,
        take: limit,
        orderBy: { occurredAt: "desc" },
      }),
      this.prisma.costEvent.count({ where: { instanceId } }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByDateRange(
    startDate: Date,
    endDate: Date,
    filters?: CostEventFilters,
    options?: PaginationOptions
  ): Promise<PaginatedResult<CostEvent>> {
    const page = options?.page ?? 1;
    const limit = options?.limit ?? 20;
    const skip = (page - 1) * limit;

    const where = this.buildEventWhereClause({
      ...filters,
      startDate,
      endDate,
    });

    const [data, total] = await Promise.all([
      this.prisma.costEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { occurredAt: "desc" },
      }),
      this.prisma.costEvent.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getSummaryByInstance(
    instanceId: string,
    startDate: Date,
    endDate: Date
  ): Promise<CostSummary> {
    const result = await this.prisma.costEvent.aggregate({
      where: {
        instanceId,
        occurredAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      _sum: {
        costCents: true,
        inputTokens: true,
        outputTokens: true,
      },
      _count: { id: true },
    });

    return {
      totalCostCents: result._sum.costCents ?? 0,
      totalInputTokens: result._sum.inputTokens ?? 0,
      totalOutputTokens: result._sum.outputTokens ?? 0,
      totalEvents: result._count.id,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  async getSummaryByInstances(
    filters: CostSummaryFilters
  ): Promise<CostSummaryByInstance[]> {
    const where: Prisma.CostEventWhereInput = {};

    if (filters.startDate || filters.endDate) {
      where.occurredAt = {};
      if (filters.startDate) where.occurredAt.gte = filters.startDate;
      if (filters.endDate) where.occurredAt.lte = filters.endDate;
    }

    if (filters.instanceId) {
      where.instanceId = filters.instanceId;
    }

    if (filters.provider) {
      where.provider = filters.provider;
    }

    if (filters.workspaceId) {
      where.instance = { workspaceId: filters.workspaceId };
    }

    if (filters.fleetId) {
      where.instance = { ...where.instance as Prisma.BotInstanceWhereInput, fleetId: filters.fleetId };
    }

    const results = await this.prisma.costEvent.groupBy({
      by: ["instanceId"],
      where,
      _sum: {
        costCents: true,
        inputTokens: true,
        outputTokens: true,
      },
      _count: { id: true },
      orderBy: {
        _sum: {
          costCents: "desc",
        },
      },
    });

    return results.map((r) => ({
      instanceId: r.instanceId,
      totalCostCents: r._sum.costCents ?? 0,
      totalInputTokens: r._sum.inputTokens ?? 0,
      totalOutputTokens: r._sum.outputTokens ?? 0,
      totalEvents: r._count.id,
      periodStart: filters.startDate ?? new Date(0),
      periodEnd: filters.endDate ?? new Date(),
    }));
  }

  async getSummaryByProvider(
    filters: CostSummaryFilters
  ): Promise<CostSummaryByProvider[]> {
    const where: Prisma.CostEventWhereInput = {};

    if (filters.startDate || filters.endDate) {
      where.occurredAt = {};
      if (filters.startDate) where.occurredAt.gte = filters.startDate;
      if (filters.endDate) where.occurredAt.lte = filters.endDate;
    }

    if (filters.instanceId) {
      where.instanceId = filters.instanceId;
    }

    if (filters.workspaceId) {
      where.instance = { workspaceId: filters.workspaceId };
    }

    if (filters.fleetId) {
      where.instance = { ...where.instance as Prisma.BotInstanceWhereInput, fleetId: filters.fleetId };
    }

    const results = await this.prisma.costEvent.groupBy({
      by: ["provider"],
      where,
      _sum: {
        costCents: true,
        inputTokens: true,
        outputTokens: true,
      },
      _count: { id: true },
      orderBy: {
        _sum: {
          costCents: "desc",
        },
      },
    });

    return results.map((r) => ({
      provider: r.provider,
      totalCostCents: r._sum.costCents ?? 0,
      totalInputTokens: r._sum.inputTokens ?? 0,
      totalOutputTokens: r._sum.outputTokens ?? 0,
      totalEvents: r._count.id,
      periodStart: filters.startDate ?? new Date(0),
      periodEnd: filters.endDate ?? new Date(),
    }));
  }

  async getSummaryByModel(
    filters: CostSummaryFilters
  ): Promise<CostSummaryByModel[]> {
    const where: Prisma.CostEventWhereInput = {};

    if (filters.startDate || filters.endDate) {
      where.occurredAt = {};
      if (filters.startDate) where.occurredAt.gte = filters.startDate;
      if (filters.endDate) where.occurredAt.lte = filters.endDate;
    }

    if (filters.instanceId) {
      where.instanceId = filters.instanceId;
    }

    if (filters.provider) {
      where.provider = filters.provider;
    }

    if (filters.workspaceId) {
      where.instance = { workspaceId: filters.workspaceId };
    }

    if (filters.fleetId) {
      where.instance = { ...where.instance as Prisma.BotInstanceWhereInput, fleetId: filters.fleetId };
    }

    const results = await this.prisma.costEvent.groupBy({
      by: ["model", "provider"],
      where,
      _sum: {
        costCents: true,
        inputTokens: true,
        outputTokens: true,
      },
      _count: { id: true },
      orderBy: {
        _sum: {
          costCents: "desc",
        },
      },
    });

    return results.map((r) => ({
      model: r.model,
      provider: r.provider,
      totalCostCents: r._sum.costCents ?? 0,
      totalInputTokens: r._sum.inputTokens ?? 0,
      totalOutputTokens: r._sum.outputTokens ?? 0,
      totalEvents: r._count.id,
      periodStart: filters.startDate ?? new Date(0),
      periodEnd: filters.endDate ?? new Date(),
    }));
  }

  async getSummaryByDateRange(
    startDate: Date,
    endDate: Date,
    filters?: CostSummaryFilters
  ): Promise<CostSummary> {
    const where: Prisma.CostEventWhereInput = {
      occurredAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (filters?.instanceId) {
      where.instanceId = filters.instanceId;
    }

    if (filters?.provider) {
      where.provider = filters.provider;
    }

    if (filters?.workspaceId) {
      where.instance = { workspaceId: filters.workspaceId };
    }

    if (filters?.fleetId) {
      where.instance = { ...where.instance as Prisma.BotInstanceWhereInput, fleetId: filters.fleetId };
    }

    const result = await this.prisma.costEvent.aggregate({
      where,
      _sum: {
        costCents: true,
        inputTokens: true,
        outputTokens: true,
      },
      _count: { id: true },
    });

    return {
      totalCostCents: result._sum.costCents ?? 0,
      totalInputTokens: result._sum.inputTokens ?? 0,
      totalOutputTokens: result._sum.outputTokens ?? 0,
      totalEvents: result._count.id,
      periodStart: startDate,
      periodEnd: endDate,
    };
  }

  // Budget methods
  async findBudget(id: string): Promise<BudgetConfig | null> {
    return this.prisma.budgetConfig.findUnique({ where: { id } });
  }

  async findBudgetByInstance(instanceId: string): Promise<BudgetConfig | null> {
    return this.prisma.budgetConfig.findFirst({
      where: { instanceId, isActive: true },
    });
  }

  async findBudgetByFleet(fleetId: string): Promise<BudgetConfig | null> {
    return this.prisma.budgetConfig.findFirst({
      where: { fleetId, isActive: true },
    });
  }

  async findBudgetsByWorkspace(workspaceId: string): Promise<BudgetConfig[]> {
    return this.prisma.budgetConfig.findMany({
      where: {
        isActive: true,
        OR: [
          { instance: { workspaceId } },
          { fleet: { workspaceId } },
        ],
      },
    });
  }

  async createBudget(
    data: Prisma.BudgetConfigCreateInput,
    tx?: TransactionClient
  ): Promise<BudgetConfig> {
    const client = this.getClient(tx);
    return client.budgetConfig.create({ data });
  }

  async updateBudgetSpend(
    id: string,
    spendCents: number,
    tx?: TransactionClient
  ): Promise<BudgetConfig> {
    const client = this.getClient(tx);
    return client.budgetConfig.update({
      where: { id },
      data: { currentSpendCents: spendCents },
    });
  }

  async incrementBudgetSpend(
    id: string,
    incrementCents: number,
    tx?: TransactionClient
  ): Promise<BudgetConfig> {
    const client = this.getClient(tx);
    return client.budgetConfig.update({
      where: { id },
      data: { currentSpendCents: { increment: incrementCents } },
    });
  }

  async resetBudgetPeriod(
    id: string,
    newPeriodStart: Date,
    newPeriodEnd?: Date,
    tx?: TransactionClient
  ): Promise<BudgetConfig> {
    const client = this.getClient(tx);
    return client.budgetConfig.update({
      where: { id },
      data: {
        currentSpendCents: 0,
        periodStart: newPeriodStart,
        periodEnd: newPeriodEnd,
      },
    });
  }

  async getBudgetStatus(id: string): Promise<BudgetStatus | null> {
    const budget = await this.prisma.budgetConfig.findUnique({
      where: { id },
    });

    if (!budget) {
      return null;
    }

    return this.computeBudgetStatus(budget);
  }

  async getBudgetStatusesByWorkspace(workspaceId: string): Promise<BudgetStatus[]> {
    const budgets = await this.findBudgetsByWorkspace(workspaceId);
    return budgets.map((budget) => this.computeBudgetStatus(budget));
  }

  async deleteBudget(id: string, tx?: TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.budgetConfig.delete({ where: { id } });
  }

  async findBudgets(filters?: BudgetFilters): Promise<BudgetConfig[]> {
    const where: Prisma.BudgetConfigWhereInput = {};

    if (filters?.instanceId) {
      where.instanceId = filters.instanceId;
    }

    if (filters?.fleetId) {
      where.fleetId = filters.fleetId;
    }

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return this.prisma.budgetConfig.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async updateBudget(
    id: string,
    data: Prisma.BudgetConfigUpdateInput,
    tx?: TransactionClient
  ): Promise<BudgetConfig> {
    const client = this.getClient(tx);
    return client.budgetConfig.update({
      where: { id },
      data,
    });
  }

  async resetAllActiveBudgets(
    newPeriodStart: Date,
    newPeriodEnd: Date,
    tx?: TransactionClient
  ): Promise<number> {
    const client = this.getClient(tx);
    const result = await client.budgetConfig.updateMany({
      where: { isActive: true },
      data: {
        currentSpendCents: 0,
        periodStart: newPeriodStart,
        periodEnd: newPeriodEnd,
      },
    });
    return result.count;
  }

  async resetAllDailyBudgets(
    newDailyPeriodStart: Date,
    tx?: TransactionClient
  ): Promise<number> {
    const client = this.getClient(tx);
    const result = await client.budgetConfig.updateMany({
      where: {
        isActive: true,
        dailyLimitCents: { not: null },
      },
      data: {
        currentDailySpendCents: 0,
        dailyPeriodStart: newDailyPeriodStart,
      },
    });
    return result.count;
  }

  private computeBudgetStatus(budget: BudgetConfig): BudgetStatus {
    const percentUsed = budget.monthlyLimitCents > 0
      ? (budget.currentSpendCents / budget.monthlyLimitCents) * 100
      : 0;

    return {
      budgetConfig: budget,
      currentSpendCents: budget.currentSpendCents,
      remainingCents: Math.max(0, budget.monthlyLimitCents - budget.currentSpendCents),
      percentUsed,
      isOverBudget: budget.currentSpendCents >= budget.monthlyLimitCents,
      isWarning: percentUsed >= budget.warnThresholdPct,
      isCritical: percentUsed >= budget.criticalThresholdPct,
    };
  }
}
