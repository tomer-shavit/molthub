import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
} from '@nestjs/common';
import { SkillPacksService } from './skill-packs.service';
import { CreateSkillPackDto, UpdateSkillPackDto, AttachSkillPackDto, BulkAttachSkillPackDto, DetachSkillPackDto } from './skill-packs.dto';

@Controller('skill-packs')
export class SkillPacksController {
  constructor(private readonly skillPacksService: SkillPacksService) {}

  private getWorkspaceId(): string {
    // TODO: Get from authenticated user context
    return 'default';
  }

  private getUserId(): string {
    // TODO: Get from authenticated user context
    return 'system';
  }

  @Post()
  create(@Body() dto: CreateSkillPackDto) {
    const workspaceId = this.getWorkspaceId();
    const userId = this.getUserId();
    return this.skillPacksService.create(workspaceId, userId, dto);
  }

  @Get()
  findAll() {
    const workspaceId = this.getWorkspaceId();
    return this.skillPacksService.findAll(workspaceId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    const workspaceId = this.getWorkspaceId();
    return this.skillPacksService.findOne(workspaceId, id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateSkillPackDto,
  ) {
    const workspaceId = this.getWorkspaceId();
    return this.skillPacksService.update(workspaceId, id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    const workspaceId = this.getWorkspaceId();
    return this.skillPacksService.remove(workspaceId, id);
  }

  // Attach/Detach operations

  @Post(':id/attach')
  attachToBot(
    @Param('id') skillPackId: string,
    @Body() dto: AttachSkillPackDto,
  ) {
    const workspaceId = this.getWorkspaceId();
    return this.skillPacksService.attachToBot(workspaceId, skillPackId, dto);
  }

  @Post(':id/attach-bulk')
  bulkAttach(
    @Param('id') skillPackId: string,
    @Body() dto: BulkAttachSkillPackDto,
  ) {
    const workspaceId = this.getWorkspaceId();
    return this.skillPacksService.bulkAttach(workspaceId, skillPackId, dto);
  }

  @Post(':id/detach')
  detachFromBot(
    @Param('id') skillPackId: string,
    @Body() dto: DetachSkillPackDto,
  ) {
    const workspaceId = this.getWorkspaceId();
    return this.skillPacksService.detachFromBot(workspaceId, skillPackId, dto.botInstanceId);
  }

  @Get(':id/bots')
  getBotsWithPack(@Param('id') skillPackId: string) {
    const workspaceId = this.getWorkspaceId();
    return this.skillPacksService.getBotsWithPack(workspaceId, skillPackId);
  }

  @Post(':id/sync')
  syncPackToBots(@Param('id') skillPackId: string) {
    const workspaceId = this.getWorkspaceId();
    return this.skillPacksService.syncPackToBots(workspaceId, skillPackId);
  }
}
