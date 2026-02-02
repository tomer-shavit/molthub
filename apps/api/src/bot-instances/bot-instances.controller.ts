import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { BotInstance } from "@clawster/database";
import { BotInstancesService } from "./bot-instances.service";
import {
  CreateBotInstanceDto,
  UpdateBotInstanceDto,
  UpdateBotStatusDto,
  UpdateBotHealthDto,
  UpdateAiGatewaySettingsDto,
  ListBotInstancesQueryDto,
  ChatMessageDto,
  PatchConfigDto,
} from "./bot-instances.dto";
import { CompareBotsDto, BulkActionDto, BulkActionResultItem } from "./bot-compare.dto";
import { OpenClawHealthService } from "../health/openclaw-health.service";
import { BotDelegationService } from "../bot-routing/bot-delegation.service";

@Controller("bot-instances")
export class BotInstancesController {
  constructor(
    private readonly botInstancesService: BotInstancesService,
    private readonly openClawHealthService: OpenClawHealthService,
    private readonly botDelegationService: BotDelegationService,
  ) {}

  @Post()
  create(@Body() dto: CreateBotInstanceDto): Promise<BotInstance> {
    return this.botInstancesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListBotInstancesQueryDto): Promise<BotInstance[]> {
    return this.botInstancesService.findAll(query);
  }

  @Post("compare")
  compareBots(@Body() dto: CompareBotsDto): Promise<BotInstance[]> {
    return this.botInstancesService.compareBots(dto.instanceIds);
  }

  @Post("bulk-action")
  bulkAction(@Body() dto: BulkActionDto): Promise<BulkActionResultItem[]> {
    return this.botInstancesService.bulkAction(dto.instanceIds, dto.action);
  }

  @Get("dashboard")
  getDashboardData(@Query('workspaceId') workspaceId: string): Promise<Record<string, unknown>> {
    return this.botInstancesService.getDashboardData(workspaceId);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<BotInstance> {
    return this.botInstancesService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateBotInstanceDto): Promise<BotInstance> {
    return this.botInstancesService.update(id, dto);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateBotStatusDto): Promise<BotInstance> {
    return this.botInstancesService.updateStatus(id, dto.status);
  }

  @Patch(":id/health")
  updateHealth(@Param("id") id: string, @Body() dto: UpdateBotHealthDto): Promise<BotInstance> {
    return this.botInstancesService.updateHealth(id, dto.health);
  }

  @Post(":id/restart")
  @HttpCode(HttpStatus.NO_CONTENT)
  async restart(@Param("id") id: string): Promise<void> {
    await this.botInstancesService.restart(id);
  }

  @Post(":id/pause")
  @HttpCode(HttpStatus.NO_CONTENT)
  async pause(@Param("id") id: string): Promise<void> {
    await this.botInstancesService.pause(id);
  }

  @Post(":id/resume")
  @HttpCode(HttpStatus.NO_CONTENT)
  async resume(@Param("id") id: string): Promise<void> {
    await this.botInstancesService.resume(id);
  }

  @Post(":id/stop")
  @HttpCode(HttpStatus.NO_CONTENT)
  async stop(@Param("id") id: string): Promise<void> {
    await this.botInstancesService.stop(id);
  }

  @Patch(":id/ai-gateway")
  updateAiGateway(
    @Param("id") id: string,
    @Body() dto: UpdateAiGatewaySettingsDto,
  ): Promise<BotInstance> {
    return this.botInstancesService.updateAiGatewaySettings(id, dto);
  }

  @Post(":id/reconcile")
  @HttpCode(HttpStatus.OK)
  async reconcile(@Param("id") id: string): Promise<Record<string, unknown>> {
    return this.botInstancesService.reconcileInstance(id);
  }

  @Post(":id/chat")
  async chat(@Param("id") id: string, @Body() dto: ChatMessageDto) {
    // Check routing rules before sending to the source bot.
    // If a rule matches, delegate to the target bot instead.
    const delegation = await this.botDelegationService.attemptDelegation(
      id,
      dto.message,
      dto.sessionId,
    );

    if (delegation) {
      return delegation;
    }

    // No delegation — handle normally via the source bot
    return this.botInstancesService.chat(id, dto.message, dto.sessionId);
  }

  @Patch(":id/config")
  async patchConfig(@Param("id") id: string, @Body() dto: PatchConfigDto) {
    return this.botInstancesService.patchConfig(id, dto.patch);
  }

  @Post(":id/doctor")
  @HttpCode(HttpStatus.OK)
  async doctor(@Param("id") id: string): Promise<Record<string, unknown>> {
    return this.botInstancesService.runDoctor(id);
  }

  @Get(":id/usage")
  async getUsage(@Param("id") id: string) {
    const usage = await this.openClawHealthService.getUsage(id);
    return usage ?? { totals: null, daily: [] };
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.botInstancesService.remove(id);
  }
}
