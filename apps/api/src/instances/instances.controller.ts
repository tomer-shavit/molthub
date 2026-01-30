import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { InstancesService } from "./instances.service";
import { CreateInstanceDto, InstanceResponseDto, ListInstancesQueryDto } from "./instances.dto";
import { Instance } from "@molthub/database";

@ApiTags("instances")
@Controller("instances")
export class InstancesController {
  constructor(private readonly instancesService: InstancesService) {}

  @Post()
  @ApiOperation({ summary: "Create a new Moltbot instance" })
  @ApiResponse({ status: 201, description: "Instance created", type: InstanceResponseDto })
  @ApiResponse({ status: 400, description: "Invalid manifest" })
  async create(@Body() dto: CreateInstanceDto): Promise<Instance> {
    return this.instancesService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: "List all instances" })
  @ApiResponse({ status: 200, description: "List of instances", type: [InstanceResponseDto] })
  async findAll(@Query() query: ListInstancesQueryDto): Promise<Instance[]> {
    return this.instancesService.findAll(query);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get instance details" })
  @ApiResponse({ status: 200, description: "Instance details", type: InstanceResponseDto })
  @ApiResponse({ status: 404, description: "Instance not found" })
  async findOne(@Param("id") id: string): Promise<Instance> {
    return this.instancesService.findOne(id);
  }

  @Post(":id/actions/restart")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Restart an instance" })
  @ApiResponse({ status: 202, description: "Restart initiated" })
  async restart(@Param("id") id: string): Promise<void> {
    await this.instancesService.restart(id);
  }

  @Post(":id/actions/stop")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Stop an instance" })
  @ApiResponse({ status: 202, description: "Stop initiated" })
  async stop(@Param("id") id: string): Promise<void> {
    await this.instancesService.stop(id);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Delete an instance" })
  @ApiResponse({ status: 202, description: "Deletion initiated" })
  async remove(@Param("id") id: string): Promise<void> {
    await this.instancesService.remove(id);
  }
}