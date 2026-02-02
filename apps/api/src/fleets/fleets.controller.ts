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
import { FleetService } from "./fleets.service";
import { 
  CreateFleetDto, 
  UpdateFleetDto, 
  UpdateFleetStatusDto, 
  ListFleetsQueryDto 
} from "./fleets.dto";
import { Fleet } from "@clawster/database";

@Controller("fleets")
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Post()
  create(@Body() dto: CreateFleetDto): Promise<Fleet> {
    return this.fleetService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListFleetsQueryDto): Promise<Fleet[]> {
    return this.fleetService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<Fleet> {
    return this.fleetService.findOne(id);
  }

  @Get(":id/health")
  getHealth(@Param("id") id: string): Promise<Record<string, unknown>> {
    return this.fleetService.getHealth(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateFleetDto): Promise<Fleet> {
    return this.fleetService.update(id, dto);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateFleetStatusDto): Promise<Fleet> {
    return this.fleetService.updateStatus(id, dto.status);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.fleetService.remove(id);
  }
}