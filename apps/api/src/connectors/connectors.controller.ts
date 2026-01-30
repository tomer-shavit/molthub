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
import { IntegrationConnector } from "@molthub/database";
import { ConnectorsService } from "./connectors.service";
import { CreateConnectorDto, UpdateConnectorDto, ListConnectorsQueryDto, TestConnectionDto } from "./connectors.dto";

@Controller("connectors")
export class ConnectorsController {
  constructor(private readonly connectorsService: ConnectorsService) {}

  @Post()
  create(@Body() dto: CreateConnectorDto): Promise<IntegrationConnector> {
    return this.connectorsService.create(dto);
  }

  @Get()
  findAll(@Query() query: ListConnectorsQueryDto): Promise<IntegrationConnector[]> {
    return this.connectorsService.findAll(query);
  }

  @Get(":id")
  findOne(@Param("id") id: string): Promise<IntegrationConnector> {
    return this.connectorsService.findOne(id);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateConnectorDto): Promise<IntegrationConnector> {
    return this.connectorsService.update(id, dto);
  }

  @Post(":id/test")
  testConnection(@Param("id") id: string, @Body() dto: TestConnectionDto): Promise<Record<string, unknown>> {
    return this.connectorsService.testConnection(id, dto);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param("id") id: string): Promise<void> {
    await this.connectorsService.remove(id);
  }
}
