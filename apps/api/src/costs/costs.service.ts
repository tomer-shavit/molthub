import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, CostEvent, Prisma } from "@molthub/database";
import { CreateCostEventDto, CostQueryDto, CostSummaryQueryDto } from "./costs.dto";

export interface CostSummaryByProvider {
  provider: string;
  _sum: {
    costCents: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  _count: {
    id: number;
  };
}

export interface CostSummaryByModel {
  model: string;
  provider: string;
  _sum: {
    costCents: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  _count: {
    id: number;
  };
}

export interface CostSummaryByChannel {
  channelType: string | null;
  _sum: {
    costCents: number | null;
  };
  _count: {
    id: number;
  };
}

export interface CostSummaryResult {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEvents: number;
  byProvider: CostSummaryByProvider[];
  byModel: CostSummaryByModel[];
  byChannel: CostSummaryByChannel[];
}

export interface PaginatedCostEvents {
  data: CostEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable()
export class CostsService {
  async recordCostEvent(dto: CreateCostEventDto): Promise<CostEvent> {
    // Verify instance exists
    const instance = await prisma.botInstance.findUnique({
      where: { id: dto.instanceId },
    });

    if (!instance) {
      throw new NotFoundException(`Bot instance ${dto.instanceId} not found`);
    }

    // Create the cost event
    const costEvent = await prisma.costEvent.create({
      data: {
        instanceId: dto.instanceId,
        provider: dto.provider,
        model: dto.model,
        inputTokens: dto.inputTokens,
        outputTokens: dto.outputTokens,
        costCents: dto.costCents,
        channelType: dto.channelType,
        traceId: dto.traceId,
      },
    });

    // Update matching BudgetConfig currentSpendCents
    // Find budgets scoped to this instance or its fleet
    await prisma.budgetConfig.updateMany({
      where: {
        isActive: true,
        OR: [
          { instanceId: dto.instanceId },
          { fleetId: instance.fleetId },
        ],
      },
      data: {
        currentSpendCents: {
          increment: dto.costCents,
        },
      },
    });

    return costEvent;
  }

  async getCostSummary(query: CostSummaryQueryDto): Promise<CostSummaryResult> {
    const where: Prisma.CostEventWhereInput = {};

    if (query.instanceId) {
      where.instanceId = query.instanceId;
    }
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = new Date(query.from);
      if (query.to) where.occurredAt.lte = new Date(query.to);
    }

    const [totals, byProvider, byModel, byChannel] = await Promise.all([
      prisma.costEvent.aggregate({
        where,
        _sum: {
          costCents: true,
          inputTokens: true,
          outputTokens: true,
        },
        _count: {
          id: true,
        },
      }),

      prisma.costEvent.groupBy({
        by: ["provider"],
        where,
        _sum: {
          costCents: true,
          inputTokens: true,
          outputTokens: true,
        },
        _count: {
          id: true,
        },
        orderBy: {
          _sum: {
            costCents: "desc",
          },
        },
      }),

      prisma.costEvent.groupBy({
        by: ["model", "provider"],
        where,
        _sum: {
          costCents: true,
          inputTokens: true,
          outputTokens: true,
        },
        _count: {
          id: true,
        },
        orderBy: {
          _sum: {
            costCents: "desc",
          },
        },
      }),

      prisma.costEvent.groupBy({
        by: ["channelType"],
        where,
        _sum: {
          costCents: true,
        },
        _count: {
          id: true,
        },
        orderBy: {
          _sum: {
            costCents: "desc",
          },
        },
      }),
    ]);

    return {
      totalCostCents: totals._sum.costCents ?? 0,
      totalInputTokens: totals._sum.inputTokens ?? 0,
      totalOutputTokens: totals._sum.outputTokens ?? 0,
      totalEvents: totals._count.id,
      byProvider,
      byModel,
      byChannel,
    };
  }

  async getInstanceCosts(
    instanceId: string,
    from?: string,
    to?: string,
  ): Promise<CostSummaryResult> {
    // Verify instance exists
    const instance = await prisma.botInstance.findUnique({
      where: { id: instanceId },
    });

    if (!instance) {
      throw new NotFoundException(`Bot instance ${instanceId} not found`);
    }

    return this.getCostSummary({ instanceId, from, to });
  }

  async listCostEvents(query: CostQueryDto): Promise<PaginatedCostEvents> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.CostEventWhereInput = {};

    if (query.instanceId) {
      where.instanceId = query.instanceId;
    }
    if (query.provider) {
      where.provider = query.provider;
    }
    if (query.from || query.to) {
      where.occurredAt = {};
      if (query.from) where.occurredAt.gte = new Date(query.from);
      if (query.to) where.occurredAt.lte = new Date(query.to);
    }

    const [data, total] = await Promise.all([
      prisma.costEvent.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.costEvent.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
