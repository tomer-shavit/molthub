import {
  PrismaClient,
  BotTeamMember,
  A2aApiKey,
  Prisma,
} from "@prisma/client";
import {
  IRoutingRepository,
  BotTeamMemberFilters,
  BotTeamMemberWithRelations,
  A2aApiKeyFilters,
  A2aApiKeyWithRelations,
} from "../interfaces/routing.repository";
import * as crypto from "crypto";
import {
  PaginationOptions,
  PaginatedResult,
  TransactionClient,
} from "../interfaces/base";

export class PrismaRoutingRepository implements IRoutingRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private getClient(tx?: TransactionClient): TransactionClient | PrismaClient {
    return tx ?? this.prisma;
  }

  // ============================================
  // WHERE CLAUSE BUILDERS
  // ============================================

  private buildTeamMemberWhereClause(
    filters?: BotTeamMemberFilters
  ): Prisma.BotTeamMemberWhereInput {
    if (!filters) return {};

    const where: Prisma.BotTeamMemberWhereInput = {};

    if (filters.workspaceId) {
      where.workspaceId = filters.workspaceId;
    }

    if (filters.ownerBotId) {
      where.ownerBotId = filters.ownerBotId;
    }

    if (filters.memberBotId) {
      where.memberBotId = filters.memberBotId;
    }

    if (filters.enabled !== undefined) {
      where.enabled = filters.enabled;
    }

    return where;
  }

  private buildApiKeyWhereClause(
    filters?: A2aApiKeyFilters
  ): Prisma.A2aApiKeyWhereInput {
    if (!filters) return {};

    const where: Prisma.A2aApiKeyWhereInput = {};

    if (filters.botInstanceId) {
      where.botInstanceId = filters.botInstanceId;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    return where;
  }

  // ============================================
  // BOT TEAM MEMBER METHODS
  // ============================================

  async findTeamMemberById(
    id: string,
    tx?: TransactionClient
  ): Promise<BotTeamMemberWithRelations | null> {
    const client = this.getClient(tx);
    return client.botTeamMember.findUnique({
      where: { id },
      include: {
        ownerBot: {
          select: {
            id: true,
            name: true,
          },
        },
        memberBot: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });
  }

  async findManyTeamMembers(
    filters?: BotTeamMemberFilters,
    pagination?: PaginationOptions,
    tx?: TransactionClient
  ): Promise<PaginatedResult<BotTeamMember>> {
    const client = this.getClient(tx);
    const where = this.buildTeamMemberWhereClause(filters);
    const page = pagination?.page ?? 1;
    const limit = pagination?.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      client.botTeamMember.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
      }),
      client.botTeamMember.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findTeamMembersByOwner(
    ownerBotId: string,
    tx?: TransactionClient
  ): Promise<BotTeamMemberWithRelations[]> {
    const client = this.getClient(tx);
    return client.botTeamMember.findMany({
      where: { ownerBotId, enabled: true },
      include: {
        ownerBot: {
          select: {
            id: true,
            name: true,
          },
        },
        memberBot: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { role: "asc" },
    });
  }

  async findTeamsByMember(
    memberBotId: string,
    tx?: TransactionClient
  ): Promise<BotTeamMemberWithRelations[]> {
    const client = this.getClient(tx);
    return client.botTeamMember.findMany({
      where: { memberBotId, enabled: true },
      include: {
        ownerBot: {
          select: {
            id: true,
            name: true,
          },
        },
        memberBot: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async createTeamMember(
    data: Prisma.BotTeamMemberCreateInput,
    tx?: TransactionClient
  ): Promise<BotTeamMember> {
    const client = this.getClient(tx);
    return client.botTeamMember.create({ data });
  }

  async updateTeamMember(
    id: string,
    data: Prisma.BotTeamMemberUpdateInput,
    tx?: TransactionClient
  ): Promise<BotTeamMember> {
    const client = this.getClient(tx);
    return client.botTeamMember.update({
      where: { id },
      data,
    });
  }

  async deleteTeamMember(id: string, tx?: TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.botTeamMember.delete({ where: { id } });
  }

  async addMember(
    ownerBotId: string,
    memberBotId: string,
    role: string,
    description: string,
    tx?: TransactionClient
  ): Promise<BotTeamMember> {
    const client = this.getClient(tx);
    // Get the workspace ID from the owner bot
    const ownerBot = await client.botInstance.findUnique({
      where: { id: ownerBotId },
      select: { workspaceId: true },
    });

    if (!ownerBot) {
      throw new Error(`Owner bot not found: ${ownerBotId}`);
    }

    return client.botTeamMember.create({
      data: {
        workspace: { connect: { id: ownerBot.workspaceId } },
        ownerBot: { connect: { id: ownerBotId } },
        memberBot: { connect: { id: memberBotId } },
        role,
        description,
      },
    });
  }

  async removeMember(
    ownerBotId: string,
    memberBotId: string,
    tx?: TransactionClient
  ): Promise<void> {
    const client = this.getClient(tx);
    await client.botTeamMember.delete({
      where: {
        ownerBotId_memberBotId: {
          ownerBotId,
          memberBotId,
        },
      },
    });
  }

  async isTeamMember(
    ownerBotId: string,
    memberBotId: string,
    tx?: TransactionClient
  ): Promise<boolean> {
    const client = this.getClient(tx);
    const count = await client.botTeamMember.count({
      where: {
        ownerBotId,
        memberBotId,
        enabled: true,
      },
    });
    return count > 0;
  }

  // ============================================
  // A2A API KEY METHODS
  // ============================================

  async findApiKeyById(
    id: string,
    tx?: TransactionClient
  ): Promise<A2aApiKey | null> {
    const client = this.getClient(tx);
    return client.a2aApiKey.findUnique({ where: { id } });
  }

  async findApiKeyByHash(
    keyHash: string,
    tx?: TransactionClient
  ): Promise<A2aApiKey | null> {
    const client = this.getClient(tx);
    return client.a2aApiKey.findFirst({
      where: { keyHash, isActive: true },
    });
  }

  async findApiKeysByBotInstance(
    botInstanceId: string,
    filters?: Omit<A2aApiKeyFilters, "botInstanceId">,
    tx?: TransactionClient
  ): Promise<A2aApiKey[]> {
    const client = this.getClient(tx);
    const where = this.buildApiKeyWhereClause({ ...filters, botInstanceId });

    return client.a2aApiKey.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });
  }

  async createApiKey(
    data: Prisma.A2aApiKeyCreateInput,
    tx?: TransactionClient
  ): Promise<A2aApiKey> {
    const client = this.getClient(tx);
    return client.a2aApiKey.create({ data });
  }

  async updateApiKey(
    id: string,
    data: Prisma.A2aApiKeyUpdateInput,
    tx?: TransactionClient
  ): Promise<A2aApiKey> {
    const client = this.getClient(tx);
    return client.a2aApiKey.update({
      where: { id },
      data,
    });
  }

  async deleteApiKey(id: string, tx?: TransactionClient): Promise<void> {
    const client = this.getClient(tx);
    await client.a2aApiKey.delete({ where: { id } });
  }

  async deactivateApiKey(id: string, tx?: TransactionClient): Promise<A2aApiKey> {
    const client = this.getClient(tx);
    return client.a2aApiKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async recordApiKeyUsage(id: string, tx?: TransactionClient): Promise<A2aApiKey> {
    const client = this.getClient(tx);
    return client.a2aApiKey.update({
      where: { id },
      data: { lastUsedAt: new Date() },
    });
  }

  async deleteExpiredApiKeys(tx?: TransactionClient): Promise<number> {
    const client = this.getClient(tx);
    const result = await client.a2aApiKey.deleteMany({
      where: {
        expiresAt: { lt: new Date() },
      },
    });
    return result.count;
  }

  async revokeApiKey(id: string, tx?: TransactionClient): Promise<A2aApiKey> {
    const client = this.getClient(tx);
    return client.a2aApiKey.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async verifyApiKey(
    plainTextKey: string,
    tx?: TransactionClient
  ): Promise<A2aApiKeyWithRelations | null> {
    const client = this.getClient(tx);

    // Hash the plain text key to compare with stored hash
    const keyHash = crypto.createHash("sha256").update(plainTextKey).digest("hex");

    const apiKey = await client.a2aApiKey.findFirst({
      where: {
        keyHash,
        isActive: true,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: {
        botInstance: {
          select: {
            id: true,
            name: true,
            fleetId: true,
          },
        },
      },
    });

    return apiKey;
  }
}
