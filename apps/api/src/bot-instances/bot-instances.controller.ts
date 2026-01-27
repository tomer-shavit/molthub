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
  create(@Body() dto: CreateBotInstanceDto) {
    return this.botInstancesService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListBotInstancesQueryDto) {
    return this.botInstancesService.findAll(query);
  }

  @Get("dashboard")
  getDashboardData(@Query('workspaceId') workspaceId: string) {
    return this.botInstancesService.getDashboardData(workspaceId);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.botInstancesService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateBotInstanceDto) {
    return this.botInstancesService.update(id, dto);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateBotStatusDto) {
    return this.botInstancesService.updateStatus(id, dto.status);
  }

  @Patch(":id/health")
  updateHealth(@Param("id") id: string, @Body() dto: UpdateBotHealthDto) {
    return this.botInstancesService.updateHealth(id, dto.health);
  }

  @Post(":id/restart")
  @HttpCode(HttpStatus.NO_CONTENT)
  restart(@Param("id") id: string) {
    return this.botInstancesService.restart(id);
  }

  @Post(":id/pause")
  @HttpCode(HttpStatus.NO_CONTENT)
  pause(@Param("id") id: string) {
    return this.botInstancesService.pause(id);
  }

  @Post(":id/resume")
  @HttpCode(HttpStatus.NO_CONTENT)
  resume(@Param("id") id: string) {
    return this.botInstancesService.resume(id);
  }

  @Post(":id/stop")
  @HttpCode(HttpStatus.NO_CONTENT)
  stop(@Param("id") id: string) {
    return this.botInstancesService.stop(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.botInstancesService.remove(id);
  }
}