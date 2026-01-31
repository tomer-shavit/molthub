import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, Trace } from "@molthub/database";
import { CreateTraceDto, ListTracesQueryDto } from "./traces.dto";

@Injectable()
export class TracesService {
  async create(dto: CreateTraceDto): Promise<Trace> {
    const trace = await prisma.trace.create({
      data: {
        botInstanceId: dto.botInstanceId,
        traceId: dto.traceId,
        parentTraceId: dto.parentTraceId,
        name: dto.name,
        type: dto.type,
        status: dto.status || "PENDING",
        startedAt: dto.startedAt || new Date(),
        endedAt: dto.endedAt,
        durationMs: dto.durationMs,
        input: dto.input ? JSON.stringify(dto.input) : undefined,
        output: dto.output ? JSON.stringify(dto.output) : undefined,
        error: dto.error ? JSON.stringify(dto.error) : undefined,
        metadata: JSON.stringify(dto.metadata || {}),
        tags: JSON.stringify(dto.tags || {}),
      },
    });

    return trace;
  }

  async findAll(query: ListTracesQueryDto): Promise<Trace[]> {
    return prisma.trace.findMany({
      where: {
        ...(query.botInstanceId && { botInstanceId: query.botInstanceId }),
        ...(query.type && { type: query.type }),
        ...(query.status && { status: query.status }),
        ...(query.traceId && { traceId: query.traceId }),
        ...(query.parentTraceId && { parentTraceId: query.parentTraceId }),
        ...(query.from && query.to && {
          startedAt: {
            gte: new Date(query.from),
            lte: new Date(query.to),
          },
        }),
      },
      orderBy: { startedAt: "desc" },
      take: query.limit || 100,
    });
  }

  async findOne(id: string): Promise<Trace> {
    const trace = await prisma.trace.findUnique({
      where: { id },
    });

    if (!trace) {
      throw new NotFoundException(`Trace ${id} not found`);
    }

    return trace;
  }

  async findByTraceId(traceId: string): Promise<Trace & { children: Trace[] }> {
    const trace = await prisma.trace.findUnique({
      where: { traceId },
      include: {
        botInstance: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!trace) {
      throw new NotFoundException(`Trace with ID ${traceId} not found`);
    }

    // Get child traces
    const children = await prisma.trace.findMany({
      where: { parentTraceId: traceId },
      orderBy: { startedAt: "asc" },
    });

    return { ...trace, children };
  }

  async complete(id: string, output?: Record<string, unknown>): Promise<Trace> {
    const trace = await this.findOne(id);
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - trace.startedAt.getTime();

    return prisma.trace.update({
      where: { id },
      data: {
        status: "SUCCESS",
        endedAt,
        durationMs,
        ...(output && { output: JSON.stringify(output) }),
      },
    });
  }

  async fail(id: string, error: Record<string, unknown>): Promise<Trace> {
    const trace = await this.findOne(id);
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - trace.startedAt.getTime();

    return prisma.trace.update({
      where: { id },
      data: {
        status: "ERROR",
        endedAt,
        durationMs,
        error: JSON.stringify(error),
      },
    });
  }

  async getTraceTree(traceId: string): Promise<Record<string, unknown>> {
    const root = await this.findByTraceId(traceId);

    async function buildTree(parentId: string): Promise<Record<string, unknown>[]> {
      const children = await prisma.trace.findMany({
        where: { parentTraceId: parentId },
        orderBy: { startedAt: "asc" },
      });

      return Promise.all(
        children.map(async (child) => ({
          ...child,
          children: await buildTree(child.traceId),
        }))
      );
    }

    return {
      ...root,
      children: await buildTree(traceId),
    };
  }

  async getStats(botInstanceId: string, from: Date, to: Date): Promise<{
    total: number;
    success: number;
    error: number;
    pending: number;
    avgDuration: number;
    byType: Record<string, number>;
  }> {
    const traces = await prisma.trace.findMany({
      where: {
        botInstanceId,
        startedAt: {
          gte: from,
          lte: to,
        },
      },
    });

    const stats = traces.reduce(
      (acc, trace) => {
        acc.total++;
        acc[trace.status.toLowerCase()]++;
        if (trace.durationMs) {
          acc.totalDuration += trace.durationMs;
        }
        acc.byType[trace.type] = (acc.byType[trace.type] || 0) + 1;
        return acc;
      },
      {
        total: 0,
        success: 0,
        error: 0,
        pending: 0,
        totalDuration: 0,
        byType: {} as Record<string, number>,
      }
    );

    return {
      total: stats.total,
      success: stats.success,
      error: stats.error,
      pending: stats.pending,
      avgDuration: stats.total > 0 ? Math.round(stats.totalDuration / stats.total) : 0,
      byType: stats.byType,
    };
  }
}