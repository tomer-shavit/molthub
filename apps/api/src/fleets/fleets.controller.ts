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

@Controller("fleets")
export class FleetController {
  constructor(private readonly fleetService: FleetService) {}

  @Post()
  create(@Body() dto: CreateFleetDto) {
    return this.fleetService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListFleetsQueryDto) {
    return this.fleetService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string) {
    return this.fleetService.findOne(id);
  }

  @Get(":id/health")
  getHealth(@Param("id") id: string) {
    return this.fleetService.getHealth(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateFleetDto) {
    return this.fleetService.update(id, dto);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateFleetStatusDto) {
    return this.fleetService.updateStatus(id, dto.status);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param("id") id: string) {
    return this.fleetService.remove(id);
  }
}