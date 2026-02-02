import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { prisma, Prisma } from "@clawster/database";
import type {
  CreateBotRoutingRuleDto,
  UpdateBotRoutingRuleDto,
  RoutingRuleQueryDto,
} from "./bot-routing.dto";

// ---------------------------------------------------------------------------
// Shared include for source/target bot names
// ---------------------------------------------------------------------------

const botInclude = {
  sourceBot: { select: { id: true, name: true } },
  targetBot: { select: { id: true, name: true } },
} satisfies Prisma.BotRoutingRuleInclude;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class BotRoutingService {
  private readonly logger = new Logger(BotRoutingService.name);

  // ---- Create --------------------------------------------------------------

  async create(workspaceId: string, dto: CreateBotRoutingRuleDto) {
    // Validate that both bots exist and belong to the workspace
    const [sourceBot, targetBot] = await Promise.all([
      prisma.botInstance.findFirst({
        where: { id: dto.sourceBotId, workspaceId },
      }),
      prisma.botInstance.findFirst({
        where: { id: dto.targetBotId, workspaceId },
      }),
    ]);

    if (!sourceBot) {
      throw new BadRequestException(
        `Source bot ${dto.sourceBotId} not found in workspace`,
      );
    }
    if (!targetBot) {
      throw new BadRequestException(
        `Target bot ${dto.targetBotId} not found in workspace`,
      );
    }

    return prisma.botRoutingRule.create({
      data: {
        workspaceId,
        sourceBotId: dto.sourceBotId,
        targetBotId: dto.targetBotId,
        triggerPattern: dto.triggerPattern,
        description: dto.description,
        priority: dto.priority ?? 0,
        enabled: dto.enabled ?? true,
      },
      include: botInclude,
    });
  }

  // ---- List ----------------------------------------------------------------

  async findAll(workspaceId: string, query: RoutingRuleQueryDto) {
    const where: Prisma.BotRoutingRuleWhereInput = { workspaceId };

    if (query.sourceBotId) where.sourceBotId = query.sourceBotId;
    if (query.targetBotId) where.targetBotId = query.targetBotId;
    if (query.enabled !== undefined) where.enabled = query.enabled;

    return prisma.botRoutingRule.findMany({
      where,
      include: botInclude,
      orderBy: { priority: "desc" },
    });
  }

  // ---- Find one ------------------------------------------------------------

  async findOne(id: string) {
    const rule = await prisma.botRoutingRule.findUnique({
      where: { id },
      include: botInclude,
    });

    if (!rule) {
      throw new NotFoundException(`Routing rule ${id} not found`);
    }

    return rule;
  }

  // ---- Update --------------------------------------------------------------

  async update(id: string, dto: UpdateBotRoutingRuleDto) {
    await this.findOne(id); // ensure exists

    return prisma.botRoutingRule.update({
      where: { id },
      data: {
        ...(dto.sourceBotId !== undefined && { sourceBotId: dto.sourceBotId }),
        ...(dto.targetBotId !== undefined && { targetBotId: dto.targetBotId }),
        ...(dto.triggerPattern !== undefined && { triggerPattern: dto.triggerPattern }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priority !== undefined && { priority: dto.priority }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
      include: botInclude,
    });
  }

  // ---- Remove --------------------------------------------------------------

  async remove(id: string) {
    await this.findOne(id); // ensure exists

    await prisma.botRoutingRule.delete({ where: { id } });
  }

  // ---- Find matching rules for delegation ----------------------------------

  /**
   * Find enabled rules for a given source bot where the message matches the
   * triggerPattern (tested as a regex). Results are ordered by priority desc.
   */
  async findMatchingRules(sourceBotId: string, message: string) {
    const rules = await prisma.botRoutingRule.findMany({
      where: {
        sourceBotId,
        enabled: true,
      },
      include: botInclude,
      orderBy: { priority: "desc" },
    });

    return rules.filter((rule) => {
      try {
        const regex = new RegExp(rule.triggerPattern, "i");
        return regex.test(message);
      } catch (err) {
        this.logger.warn(
          `Invalid regex pattern "${rule.triggerPattern}" in rule ${rule.id}: ${err}`,
        );
        return false;
      }
    });
  }
}
