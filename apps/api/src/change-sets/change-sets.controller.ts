import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
} from "@nestjs/common";
import { ChangeSetsService } from "./change-sets.service";
import { CreateChangeSetDto, RollbackChangeSetDto, ListChangeSetsQueryDto } from "./change-sets.dto";
import { ChangeSet } from "@molthub/database";

@Controller("change-sets")
export class ChangeSetsController {
  constructor(private readonly changeSetsService: ChangeSetsService) {}

  @Post()
  create(@Body() dto: CreateChangeSetDto): Promise<ChangeSet> {
    return this.changeSetsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListChangeSetsQueryDto): Promise<ChangeSet[]> {
    return this.changeSetsService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<ChangeSet> {
    return this.changeSetsService.findOne(id);
  }

  @Get(":id/status")
  getRolloutStatus(@Param("id") id: string): Promise<Record<string, unknown>> {
    return this.changeSetsService.getRolloutStatus(id);
  }

  @Post(":id/start")
  startRollout(@Param("id") id: string): Promise<ChangeSet> {
    return this.changeSetsService.startRollout(id);
  }

  @Post(":id/complete")
  complete(@Param("id") id: string): Promise<ChangeSet> {
    return this.changeSetsService.complete(id);
  }

  @Post(":id/fail")
  fail(@Param("id") id: string, @Body("error") error: string): Promise<ChangeSet> {
    return this.changeSetsService.fail(id, error);
  }

  @Post(":id/rollback")
  rollback(@Param("id") id: string, @Body() dto: RollbackChangeSetDto): Promise<ChangeSet> {
    return this.changeSetsService.rollback(id, dto);
  }
}