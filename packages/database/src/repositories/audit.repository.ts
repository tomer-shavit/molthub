import { PrismaClient, AuditEvent, Prisma } from "@prisma/client";
import {
  IAuditRepository,
  AuditEventFilters,
  AuditEventWithRelations,
  AuditActionCount,
  AuditResourceTypeCount,
} from "../interfaces/audit.repository";
import {
  PaginationOptions,
  PaginatedResult,
  TransactionClient,
} from "../interfaces/base";

export class PrismaAuditRepository implements IAuditRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: TransactionClient): TransactionClient | PrismaClient {
    return tx ?? this.prisma;
  }

  private buildWhereClause(filters?: AuditEventFilters): Prisma.AuditEventWhereInput {
    if (!filters) return {};

    const where: Prisma.AuditEventWhereInput = {};

    if (filters.workspaceId) {
      where.workspaceId = filters.workspaceId;
    }

    if (filters.actor) {
      where.actor = filters.actor;
    }

    if (filters.action) {
      where.action = Array.isArray(filters.action)
        ? { in: filters.action }
        : filters.action;
    }

    if (filters.resourceType) {
      where.resourceType = Array.isArray(filters.resourceType)
        ? { in: filters.resourceType }
        : filters.resourceType;
    }

    if (filters.resourceId) {
      where.resourceId = filters.resourceId;
    }


    if (filters.timestampAfter || filters.timestampBefore) {
      where.timestamp = {};
      if (filters.timestampAfter) {
        where.timestamp.gte = filters.timestampAfter;
      }
      if (filters.timestampBefore) {
        where.timestamp.lte = filters.timestampBefore;
      }
    }

    return where;
  }

  async findById(
    id: string,
    tx?: TransactionClient
  ): Promise<AuditEventWithRelations | null> {
    const client = this.getClient(tx);
    return client.auditEvent.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },      },
    });
  }

  async findMany(
    filters?: AuditEventFilters,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<AuditEvent>> {
    const client = this.getClient(tx);
    const where = this.buildWhereClause(filters);
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      client.auditEvent.findMany({
        where,
        skip,
        take: limit,
        orderBy: { timestamp: "desc" },
      }),
      client.auditEvent.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findByWorkspace(
    workspaceId: string,
    filters?: Omit<AuditEventFilters, "workspaceId">,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<AuditEvent>> {
    return this.findMany({ ...filters, workspaceId }, pagination, tx);
  }

  async findByResource(
    resourceType: string,
    resourceId: string,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<AuditEvent>> {
    return this.findMany({ resourceType, resourceId }, pagination, tx);
  }

  async findByActor(
    actor: string,
    filters?: Omit<AuditEventFilters, "actor">,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<AuditEvent>> {
    return this.findMany({ ...filters, actor }, pagination, tx);
  }

  async count(filters?: AuditEventFilters, tx?: TransactionClient): Promise<number> {
    const client = this.getClient(tx);
    const where = this.buildWhereClause(filters);
    return client.auditEvent.count({ where });
  }

  async create(
    data: Prisma.AuditEventCreateInput,
    tx?: TransactionClient
  ): Promise<AuditEvent> {
    const client = this.getClient(tx);
    return client.auditEvent.create({ data });
  }

  async createMany(
    data: Prisma.AuditEventCreateManyInput[],
    tx?: TransactionClient
  ): Promise<number> {
    const client = this.getClient(tx);
    const result = await client.auditEvent.createMany({ data });
    return result.count;
  }

  async deleteOlderThan(date: Date, tx?: TransactionClient): Promise<number> {
    const client = this.getClient(tx);
    const result = await client.auditEvent.deleteMany({
      where: {
        timestamp: { lt: date },
      },
    });
    return result.count;
  }

  async groupByAction(
    filters?: AuditEventFilters,
    tx?: TransactionClient
  ): Promise<AuditActionCount[]> {
    const client = this.getClient(tx);
    const where = this.buildWhereClause(filters);

    const result = await client.auditEvent.groupBy({
      by: ["action"],
      where,
      _count: true,
    });

    return result.map((item) => ({
      action: item.action,
      _count: item._count,
    }));
  }

  async groupByResourceType(
    filters?: AuditEventFilters,
    tx?: TransactionClient
  ): Promise<AuditResourceTypeCount[]> {
    const client = this.getClient(tx);
    const where = this.buildWhereClause(filters);

    const result = await client.auditEvent.groupBy({
      by: ["resourceType"],
      where,
      _count: true,
    });

    return result.map((item) => ({
      resourceType: item.resourceType,
      _count: item._count,
    }));
  }
}
