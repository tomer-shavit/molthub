import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from "@nestjs/common";
import * as crypto from "crypto";
import { prisma, Prisma } from "@clawster/database";
import { A2aMessageService } from "../a2a/a2a-message.service";
import { A2aApiKeyService } from "../a2a/a2a-api-key.service";
import type {
  CreateBotTeamMemberDto,
  UpdateBotTeamMemberDto,
  BotTeamQueryDto,
  DelegateTaskDto,
} from "./bot-teams.dto";

// ---------------------------------------------------------------------------
// Shared include for owner/member bot names
// ---------------------------------------------------------------------------

const memberInclude = {
  ownerBot: { select: { id: true, name: true, status: true } },
  memberBot: { select: { id: true, name: true, status: true } },
} satisfies Prisma.BotTeamMemberInclude;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

@Injectable()
export class BotTeamsService {
  private readonly logger = new Logger(BotTeamsService.name);

  constructor(
    private readonly a2aMessageService: A2aMessageService,
    private readonly a2aApiKeyService: A2aApiKeyService,
  ) {}

  // ---- Create --------------------------------------------------------------

  async create(_workspaceId: string, dto: CreateBotTeamMemberDto) {
    if (dto.ownerBotId === dto.memberBotId) {
      throw new BadRequestException("A bot cannot be a member of its own team");
    }

    // Validate that both bots exist and belong to the same workspace
    const [ownerBot, memberBot] = await Promise.all([
      prisma.botInstance.findFirst({
        where: { id: dto.ownerBotId },
      }),
      prisma.botInstance.findFirst({
        where: { id: dto.memberBotId },
      }),
    ]);

    if (!ownerBot) {
      throw new BadRequestException(
        `Owner bot ${dto.ownerBotId} not found`,
      );
    }
    if (!memberBot) {
      throw new BadRequestException(
        `Member bot ${dto.memberBotId} not found`,
      );
    }
    if (ownerBot.workspaceId !== memberBot.workspaceId) {
      throw new BadRequestException(
        "Both bots must belong to the same workspace",
      );
    }

    return prisma.botTeamMember.create({
      data: {
        workspaceId: ownerBot.workspaceId,
        ownerBotId: dto.ownerBotId,
        memberBotId: dto.memberBotId,
        role: dto.role,
        description: dto.description,
      },
      include: memberInclude,
    });
  }

  // ---- List ----------------------------------------------------------------

  async findAll(_workspaceId: string, query: BotTeamQueryDto) {
    const where: Prisma.BotTeamMemberWhereInput = {};

    if (query.ownerBotId) where.ownerBotId = query.ownerBotId;
    if (query.memberBotId) where.memberBotId = query.memberBotId;
    if (query.enabled !== undefined) where.enabled = query.enabled;

    return prisma.botTeamMember.findMany({
      where,
      include: memberInclude,
      orderBy: { createdAt: "asc" },
    });
  }

  // ---- Find one ------------------------------------------------------------

  async findOne(id: string) {
    const member = await prisma.botTeamMember.findUnique({
      where: { id },
      include: memberInclude,
    });

    if (!member) {
      throw new NotFoundException(`Team member ${id} not found`);
    }

    return member;
  }

  // ---- Update --------------------------------------------------------------

  async update(id: string, dto: UpdateBotTeamMemberDto) {
    await this.findOne(id); // ensure exists

    return prisma.botTeamMember.update({
      where: { id },
      data: {
        ...(dto.role !== undefined && { role: dto.role }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
      },
      include: memberInclude,
    });
  }

  // ---- Remove --------------------------------------------------------------

  async remove(id: string) {
    await this.findOne(id); // ensure exists

    await prisma.botTeamMember.delete({ where: { id } });
  }

  // ---- Delegate ------------------------------------------------------------

  async delegateToMember(
    dto: DelegateTaskDto,
    apiKey: string,
  ): Promise<{ success: boolean; response?: string; traceId?: string; error?: string }> {
    // 1. Validate API key
    const isValid = await this.a2aApiKeyService.validate(dto.sourceBotId, apiKey);
    if (!isValid) {
      throw new UnauthorizedException("Invalid API key for this bot");
    }

    // 2. Find team member relationship
    const teamMember = await prisma.botTeamMember.findFirst({
      where: {
        ownerBotId: dto.sourceBotId,
        enabled: true,
        memberBot: { name: dto.targetBotName },
      },
      include: {
        memberBot: { select: { id: true, name: true } },
        ownerBot: { select: { id: true, name: true } },
      },
    });

    if (!teamMember) {
      throw new BadRequestException(
        `No enabled team member "${dto.targetBotName}" found for this bot`,
      );
    }

    this.logger.log(
      `Delegation: "${teamMember.ownerBot.name}" → "${teamMember.memberBot.name}" — ${dto.message.slice(0, 100)}`,
    );

    // 3. Send via A2A
    try {
      const task = await this.a2aMessageService.sendMessage(
        teamMember.memberBotId,
        {
          message: {
            messageId: crypto.randomUUID(),
            role: "user",
            parts: [{ text: dto.message }],
          },
        },
        { parentTraceId: undefined },
      );

      // Extract response text
      const responseText = task.status.message?.parts
        ?.filter((p: any) => "text" in p)
        ?.map((p: any) => p.text)
        ?.join("\n");

      return {
        success: task.status.state === "completed",
        response: responseText,
        traceId: task.id,
        ...(task.status.state !== "completed" && { error: responseText || "Delegation failed" }),
      };
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Delegation failed: ${errorMsg}`);
      return {
        success: false,
        error: errorMsg,
      };
    }
  }
}
