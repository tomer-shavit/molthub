import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, Prisma, Overlay } from "@molthub/database";
import { CreateOverlayDto, UpdateOverlayDto, ListOverlaysQueryDto } from "./overlays.dto";

@Injectable()
export class OverlaysService {
  async create(dto: CreateOverlayDto): Promise<Overlay> {
    const overlay = await prisma.overlay.create({
      data: {
        workspaceId: dto.workspaceId,
        name: dto.name,
        description: dto.description,
        targetType: dto.targetType,
        targetSelector: dto.targetSelector as Prisma.InputJsonValue,
        overrides: dto.overrides as Prisma.InputJsonValue,
        priority: dto.priority || 0,
        enabled: dto.enabled ?? true,
        rollout: dto.rollout as Prisma.InputJsonValue,
        schedule: dto.schedule as Prisma.InputJsonValue,
        createdBy: dto.createdBy || "system",
      },
    });

    return overlay;
  }

  async findAll(query: ListOverlaysQueryDto): Promise<Overlay[]> {
    return prisma.overlay.findMany({
      where: {
        workspaceId: query.workspaceId,
        ...(query.targetType && { targetType: query.targetType }),
        ...(query.enabled !== undefined && { enabled: query.enabled }),
      },
      orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
    });
  }

  async findOne(id: string): Promise<Overlay> {
    const overlay = await prisma.overlay.findUnique({
      where: { id },
    });

    if (!overlay) {
      throw new NotFoundException(`Overlay ${id} not found`);
    }

    return overlay;
  }

  async update(id: string, dto: UpdateOverlayDto): Promise<Overlay> {
    await this.findOne(id);

    return prisma.overlay.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.targetType && { targetType: dto.targetType }),
        ...(dto.targetSelector && { targetSelector: dto.targetSelector as Prisma.InputJsonValue }),
        ...(dto.overrides && { overrides: dto.overrides as Prisma.InputJsonValue }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.rollout && { rollout: dto.rollout as Prisma.InputJsonValue }),
        ...(dto.schedule && { schedule: dto.schedule as Prisma.InputJsonValue }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await prisma.overlay.delete({ where: { id } });
  }

  async findApplicableOverlays(workspaceId: string, filters: {
    fleetId?: string;
    environment?: string;
    tags?: Record<string, string>;
    instanceIds?: string[];
  }): Promise<Overlay[]> {
    const overlays = await prisma.overlay.findMany({
      where: {
        workspaceId,
        enabled: true,
      },
      orderBy: { priority: "desc" },
    });

    // Filter overlays based on target selectors
    return overlays.filter(overlay => {
      const selector = overlay.targetSelector as Record<string, unknown>;
      
      switch (overlay.targetType) {
        case "fleet":
          return !filters.fleetId || selector?.fleetId === filters.fleetId;
        case "environment":
          return !filters.environment || selector?.environment === filters.environment;
        case "instance":
          return !filters.instanceIds || (selector?.instanceIds as string[] | undefined)?.some((id: string) => filters.instanceIds?.includes(id));
        case "tag":
          if (!filters.tags || !selector?.tags) return true;
          return Object.entries(selector.tags).every(([key, value]) => 
            filters.tags?.[key] === value
          );
        default:
          return true;
      }
    });
  }
}