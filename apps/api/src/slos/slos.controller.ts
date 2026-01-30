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
import { SloDefinition } from "@molthub/database";
import { SlosService } from "./slos.service";
import { CreateSloDto, UpdateSloDto, SloQueryDto } from "./slos.dto";

@Controller("slos")
export class SlosController {
  constructor(private readonly slosService: SlosService) {}

  @Post()
  create(@Body() dto: CreateSloDto): Promise<SloDefinition> {
    return this.slosService.create(dto);
  }

  @Get("summary")
  getSummary(): Promise<{
    total: number;
    breached: number;
    healthy: number;
    compliancePercent: number;
  }> {
    return this.slosService.getSummary();
  }

  @Get("instance/:instanceId")
  findByInstance(
    @Param("instanceId") instanceId: string,
  ): Promise<SloDefinition[]> {
    return this.slosService.findByInstance(instanceId);
  }

  @Get()
  findAll(@Query() query: SloQueryDto): Promise<SloDefinition[]> {
    return this.slosService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<SloDefinition> {
    return this.slosService.findOne(id);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() dto: UpdateSloDto,
  ): Promise<SloDefinition> {
    return this.slosService.update(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.slosService.remove(id);
  }
}
