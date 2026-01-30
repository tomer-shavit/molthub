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
import { BotInstance } from "@molthub/database";
import { BotInstancesService } from "./bot-instances.service";
import { 
  CreateBotInstanceDto, 
  UpdateBotInstanceDto, 
  UpdateBotStatusDto,
  UpdateBotHealthDto,
  ListBotInstancesQueryDto 
} from "./bot-instances.dto";

@Controller("bot-instances")
export class BotInstancesController {
  constructor(private readonly botInstancesService: BotInstancesService) {}

  @Post()
  create(@Body() dto: CreateBotInstanceDto): Promise<BotInstance> {
    return this.botInstancesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListBotInstancesQueryDto): Promise<BotInstance[]> {
    return this.botInstancesService.findAll(query);
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

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.botInstancesService.remove(id);
  }
}
