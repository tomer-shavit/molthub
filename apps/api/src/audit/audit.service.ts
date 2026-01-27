import { Injectable } from "@nestjs/common";
import { prisma, AuditEvent } from "@molthub/database";
import { ListAuditEventsQueryDto } from "./audit.dto";

@Injectable()
export class AuditService {
  async findAll(query: ListAuditEventsQueryDto): Promise<AuditEvent[]> {
    return prisma.auditEvent.findMany({
      where: {
        ...(query.instanceId && { resourceId: query.instanceId }),
        ...(query.actor && { actor: query.actor }),
        ...(query.from && { timestamp: { gte: new Date(query.from) } }),
        ...(query.to && { timestamp: { lte: new Date(query.to) } }),
      },
      orderBy: { timestamp: "desc" },
      take: 100,
    });
  }

  async logEvent(
    actor: string,
    action: string,
    resourceType: string,
    resourceId: string,
    workspaceId: string,
    diffSummary?: string,
    metadata?: Record<string, unknown>
  ): Promise<AuditEvent> {
    return prisma.auditEvent.create({
      data: {
        actor,
        action,
        resourceType,
        resourceId,
        workspaceId,
        diffSummary,
        metadata: metadata || {},
      },
    });
  }
}