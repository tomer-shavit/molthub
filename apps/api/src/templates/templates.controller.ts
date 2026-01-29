import { Controller, Get, Post, Body, Param } from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { TemplatesService } from "./templates.service";
import {
  CreateTemplateDto,
  PreviewConfigDto,
  GenerateConfigDto,
  TemplateResponseDto,
  ConfigPreviewResponseDto,
  GenerateConfigResponseDto,
} from "./templates.dto";

@ApiTags("templates")
@Controller("templates")
export class TemplatesController {
  constructor(private readonly templatesService: TemplatesService) {}

  // ---------------------------------------------------------------------------
  // GET /templates — List all templates (builtin + custom)
  // ---------------------------------------------------------------------------

  @Get()
  @ApiOperation({ summary: "List all templates (builtin + custom)" })
  @ApiResponse({ status: 200, type: [TemplateResponseDto] })
  async findAll(): Promise<TemplateResponseDto[]> {
    return this.templatesService.listTemplates();
  }

  // ---------------------------------------------------------------------------
  // GET /templates/:id — Get a single template by ID
  // ---------------------------------------------------------------------------

  @Get(":id")
  @ApiOperation({ summary: "Get template by ID" })
  @ApiResponse({ status: 200, type: TemplateResponseDto })
  async findOne(@Param("id") id: string): Promise<TemplateResponseDto> {
    return this.templatesService.getTemplate(id);
  }

  // ---------------------------------------------------------------------------
  // POST /templates — Create a custom template
  // ---------------------------------------------------------------------------

  @Post()
  @ApiOperation({ summary: "Create a custom template" })
  @ApiResponse({ status: 201, type: TemplateResponseDto })
  async create(@Body() dto: CreateTemplateDto): Promise<TemplateResponseDto> {
    return this.templatesService.createCustomTemplate(dto);
  }

  // ---------------------------------------------------------------------------
  // POST /templates/:id/preview — Preview generated config (no side effects)
  // ---------------------------------------------------------------------------

  @Post(":id/preview")
  @ApiOperation({
    summary: "Preview the generated config for a template without side effects",
  })
  @ApiResponse({ status: 200, type: ConfigPreviewResponseDto })
  async previewConfig(
    @Param("id") id: string,
    @Body() dto: PreviewConfigDto,
  ): Promise<ConfigPreviewResponseDto> {
    return this.templatesService.previewConfig(id, dto);
  }

  // ---------------------------------------------------------------------------
  // POST /templates/:id/generate — Generate config + manifest
  // ---------------------------------------------------------------------------

  @Post(":id/generate")
  @ApiOperation({
    summary: "Generate a full moltbot config and manifest from a template",
  })
  @ApiResponse({ status: 201, type: GenerateConfigResponseDto })
  async generateConfig(
    @Param("id") id: string,
    @Body() dto: GenerateConfigDto,
  ): Promise<GenerateConfigResponseDto> {
    return this.templatesService.generateFromTemplate(id, dto);
  }
}
