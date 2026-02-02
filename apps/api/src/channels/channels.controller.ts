import { Controller, Get, Post, Patch, Delete, Body, Param, Query, HttpCode, HttpStatus } from "@nestjs/common";
import { ChannelsService } from "./channels.service";
import { ChannelAuthService } from "./channel-auth.service";
import {
  CreateChannelDto,
  UpdateChannelDto,
  ListChannelsQueryDto,
  TestChannelDto,
  BindChannelToBotDto,
  UpdateBindingDto,
  SendTestMessageDto,
  StartAuthDto,
  ValidateTokenDto,
  GenerateConfigDto,
} from "./channels.dto";
import { ChannelTypeMeta } from "./channel-types";
import { CommunicationChannel, BotChannelBinding } from "@clawster/database";

@Controller("channels")
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly authService: ChannelAuthService,
  ) {}

  // ==========================================
  // Channel Management
  // ==========================================

  @Post()
  create(@Body() dto: CreateChannelDto): Promise<CommunicationChannel> {
    return this.channelsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListChannelsQueryDto): Promise<CommunicationChannel[]> {
    return this.channelsService.findAll(query);
  }

  @Get("types")
  getChannelTypes(): ChannelTypeMeta[] {
    return this.channelsService.getChannelTypes();
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<CommunicationChannel> {
    return this.channelsService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateChannelDto): Promise<CommunicationChannel> {
    return this.channelsService.update(id, dto);
  }

  @Post(":id/test")
  testConnection(@Param("id") id: string, @Body() dto: TestChannelDto): Promise<Record<string, unknown>> {
    return this.channelsService.testConnection(id, dto);
  }

  @Post(":id/test-message")
  sendTestMessage(@Param("id") id: string, @Body() dto: SendTestMessageDto): Promise<Record<string, unknown>> {
    return this.channelsService.sendTestMessage(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.channelsService.remove(id);
  }

  // ==========================================
  // Auth Flow Endpoints
  // ==========================================

  @Post(":id/auth/start")
  startAuth(
    @Param("id") id: string,
    @Body() dto: StartAuthDto,
  ) {
    return this.authService.startAuth(id, dto.botInstanceId);
  }

  @Get(":id/auth/status")
  getAuthStatus(@Param("id") id: string) {
    return this.authService.getAuthStatus(id);
  }

  @Post(":id/auth/validate")
  validateToken(
    @Param("id") id: string,
    @Body() dto: ValidateTokenDto,
  ) {
    return this.authService.validateToken(id, dto.token, dto.appToken);
  }

  @Post(":id/auth/refresh-qr")
  refreshQr(@Param("id") id: string) {
    return this.authService.refreshQr(id);
  }

  @Post(":id/auth/complete")
  completeAuth(@Param("id") id: string) {
    return this.authService.completeAuth(id);
  }

  // ==========================================
  // Config Generation
  // ==========================================

  @Post(":instanceId/generate-config")
  generateConfig(
    @Param("instanceId") instanceId: string,
    @Body() dto: GenerateConfigDto,
  ): Promise<Record<string, unknown>> {
    return this.channelsService.generateConfig(instanceId, dto.channelIds);
  }

  // ==========================================
  // Bot Channel Bindings
  // ==========================================

  @Post(":id/bind")
  bindToBot(
    @Param("id") channelId: string,
    @Body() dto: BindChannelToBotDto,
  ): Promise<BotChannelBinding> {
    return this.channelsService.bindToBot(channelId, dto);
  }

  @Delete(":id/bind/:bindingId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async unbindFromBot(@Param("bindingId") bindingId: string): Promise<void> {
    await this.channelsService.unbindFromBot(bindingId);
  }

  @Patch(":id/bind/:bindingId")
  updateBinding(
    @Param("bindingId") bindingId: string,
    @Body() dto: UpdateBindingDto,
  ): Promise<BotChannelBinding> {
    return this.channelsService.updateBinding(bindingId, dto);
  }

  // ==========================================
  // Monitoring
  // ==========================================

  @Get(":id/stats")
  getChannelStats(@Param("id") id: string): Promise<Record<string, unknown>> {
    return this.channelsService.getChannelStats(id);
  }

  @Get(":id/bots")
  getBoundBots(@Param("id") id: string): Promise<Record<string, unknown>[]> {
    return this.channelsService.getBoundBots(id);
  }

  @Get("bot/:botId/channels")
  getBotChannels(@Param("botId") botId: string): Promise<Record<string, unknown>[]> {
    return this.channelsService.getBotChannels(botId);
  }

  @Post("bot/:botId/health-check")
  async checkBotChannelsHealth(@Param("botId") botId: string): Promise<Record<string, unknown>> {
    return this.channelsService.checkBotChannelsHealth(botId);
  }
}
