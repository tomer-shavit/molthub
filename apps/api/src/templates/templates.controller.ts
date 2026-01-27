import { Controller, Get, Post, Body, Param } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { TemplatesService } from "./templates.service";
import { CreateTemplateDto, TemplateResponseDto } from "./templates.dto";

@ApiTags("templates")
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  @Get()
  @ApiOperation({ summary: "List all templates" })
  @ApiResponse({ status: 200, type: [TemplateResponseDto] })
  async findAll(): Promise<TemplateResponseDto[]> {
    return this.templatesService.findAll();
  }

  @Get(":id")
  @ApiOperation({ summary: "Get template by ID" })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async findOne(@Param("id") id: string): Promise<TemplateResponseDto> {
    return this.templatesService.findOne(id);
  }

  @Post()
  @ApiOperation({ summary: "Create a new template" })
  @ApiResponse({ status: 201, type: TemplateResponseDto })
  async create(@Body() dto: CreateTemplateDto): Promise<TemplateResponseDto> {
    return this.templatesService.create(dto);
  }
}