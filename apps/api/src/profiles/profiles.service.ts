import { Injectable, NotFoundException, BadRequestException } from "@nestjs/common";
import { prisma, Prisma, Profile } from "@molthub/database";
import { CreateProfileDto, UpdateProfileDto, ListProfilesQueryDto } from "./profiles.dto";

@Injectable()
export class ProfilesService {
  async create(dto: CreateProfileDto): Promise<Profile> {
    const profile = await prisma.profile.create({
      data: {
        workspaceId: dto.workspaceId,
        name: dto.name,
        description: dto.description,
        fleetIds: JSON.stringify(dto.fleetIds || []),
        defaults: JSON.stringify(dto.defaults),
        mergeStrategy: JSON.stringify(dto.mergeStrategy || {}),
        allowInstanceOverrides: dto.allowInstanceOverrides ?? true,
        lockedFields: JSON.stringify(dto.lockedFields || []),
        priority: dto.priority || 0,
        createdBy: dto.createdBy || "system",
      },
    });

    return profile;
  }

  async findAll(query: ListProfilesQueryDto): Promise<Profile[]> {
    return prisma.profile.findMany({
      where: {
        workspaceId: query.workspaceId,
        ...(query.fleetId && {
          OR: [
            { fleetIds: { equals: "[]" } },
            { fleetIds: { contains: query.fleetId } },
          ],
        }),
        ...(query.isActive !== undefined && { isActive: query.isActive }),
      },
      orderBy: { priority: "desc" },
    });
  }

  async findOne(id: string): Promise<Profile> {
    const profile = await prisma.profile.findUnique({
      where: { id },
    });

    if (!profile) {
      throw new NotFoundException(`Profile ${id} not found`);
    }

    return profile;
  }

  async update(id: string, dto: UpdateProfileDto): Promise<Profile> {
    await this.findOne(id);

    return prisma.profile.update({
      where: { id },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.fleetIds && { fleetIds: JSON.stringify(dto.fleetIds) }),
        ...(dto.defaults && { defaults: JSON.stringify(dto.defaults) }),
        ...(dto.mergeStrategy && { mergeStrategy: JSON.stringify(dto.mergeStrategy) }),
        ...(dto.allowInstanceOverrides !== undefined && { allowInstanceOverrides: dto.allowInstanceOverrides }),
        ...(dto.lockedFields && { lockedFields: JSON.stringify(dto.lockedFields) }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);
    await prisma.profile.delete({ where: { id } });
  }
}