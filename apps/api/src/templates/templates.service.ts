import { Injectable, NotFoundException } from "@nestjs/common";
import { prisma, Template } from "@molthub/database";
// Prisma namespace no longer needed after SQLite migration
import {
  CreateTemplateDto,
  PreviewConfigDto,
  GenerateConfigDto,
  TemplateResponseDto,
  ConfigPreviewResponseDto,
  GenerateConfigResponseDto,
} from "./templates.dto";
import {
  BUILTIN_TEMPLATES,
  getBuiltinTemplate,
  isBuiltinTemplateId,
  type BuiltinTemplate,
} from "./builtin-templates";
import { ConfigGenerator } from "./config-generator";

// =============================================================================
// Helpers to map between DB / builtin records and response DTOs
// =============================================================================

function builtinToResponse(t: BuiltinTemplate): TemplateResponseDto {
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    defaultConfig: t.defaultConfig as Record<string, unknown>,
    isBuiltin: true,
    requiredInputs: t.requiredInputs,
    channels: t.channels,
    recommendedPolicies: t.recommendedPolicies,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function dbToResponse(t: Template): TemplateResponseDto {
  // DB templates store config in `manifestTemplate` (v1 compat) or `defaultConfig`.
  const raw = (typeof t.manifestTemplate === "string" ? JSON.parse(t.manifestTemplate) : t.manifestTemplate) as Record<string, unknown> | null;
  return {
    id: t.id,
    name: t.name,
    description: t.description,
    category: t.category,
    defaultConfig: (raw ?? {}) as Record<string, unknown>,
    isBuiltin: t.isBuiltin,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

// =============================================================================
// Templates Service
// =============================================================================

@Injectable()
export class TemplatesService {
  constructor(private readonly configGenerator: ConfigGenerator) {}

  // ---------------------------------------------------------------------------
  // List all templates (builtin + DB)
  // ---------------------------------------------------------------------------

  async listTemplates(): Promise<TemplateResponseDto[]> {
    const dbTemplates = await prisma.template.findMany({
      orderBy: { createdAt: "desc" },
    });

    const builtins = BUILTIN_TEMPLATES.map(builtinToResponse);
    const custom = dbTemplates.map(dbToResponse);

    return [...builtins, ...custom];
  }

  // ---------------------------------------------------------------------------
  // Get a single template by ID
  // ---------------------------------------------------------------------------

  async getTemplate(id: string): Promise<TemplateResponseDto> {
    // Check builtin first
    const builtin = getBuiltinTemplate(id);
    if (builtin) {
      return builtinToResponse(builtin);
    }

    // Fall back to DB
    const template = await prisma.template.findUnique({ where: { id } });
    if (!template) {
      throw new NotFoundException(`Template ${id} not found`);
    }

    return dbToResponse(template);
  }

  // ---------------------------------------------------------------------------
  // Create a custom template (persisted to DB)
  // ---------------------------------------------------------------------------

  async createCustomTemplate(
    dto: CreateTemplateDto,
  ): Promise<TemplateResponseDto> {
    const template = await prisma.template.create({
      data: {
        name: dto.name,
        description: dto.description,
        category: dto.category,
        manifestTemplate: JSON.stringify(dto.defaultConfig ??
          dto.manifestTemplate ??
          {}),
        isBuiltin: false,
        workspaceId: "default",
      },
    });

    return dbToResponse(template);
  }

  // ---------------------------------------------------------------------------
  // Preview config (no side effects)
  // ---------------------------------------------------------------------------

  async previewConfig(
    templateId: string,
    dto: PreviewConfigDto,
  ): Promise<ConfigPreviewResponseDto> {
    const template = await this.resolveTemplate(templateId);

    const result = this.configGenerator.generateConfig(template, {
      values: dto.values,
      configOverrides: dto.configOverrides as Record<string, unknown> | undefined,
    });

    return {
      config: result.config as unknown as Record<string, unknown>,
      secretRefs: result.secretRefs,
    };
  }

  // ---------------------------------------------------------------------------
  // Generate config + manifest
  // ---------------------------------------------------------------------------

  async generateFromTemplate(
    templateId: string,
    dto: GenerateConfigDto,
  ): Promise<GenerateConfigResponseDto> {
    const template = await this.resolveTemplate(templateId);

    const result = this.configGenerator.generateConfig(template, {
      values: dto.values,
      configOverrides: dto.configOverrides as Record<string, unknown> | undefined,
      instanceName: dto.instanceName,
      workspace: dto.workspace,
      environment: dto.environment,
      deploymentTarget: dto.deploymentTarget,
      labels: dto.labels,
    });

    return {
      config: result.config as unknown as Record<string, unknown>,
      manifest: result.manifest as unknown as Record<string, unknown>,
      secretRefs: result.secretRefs,
    };
  }

  // ---------------------------------------------------------------------------
  // Internal: resolve template ID -> BuiltinTemplate-like shape for generator
  // ---------------------------------------------------------------------------

  private async resolveTemplate(
    templateId: string,
  ): Promise<BuiltinTemplate> {
    // Try builtin
    const builtin = getBuiltinTemplate(templateId);
    if (builtin) {
      return builtin;
    }

    // Try DB
    const dbTemplate = await prisma.template.findUnique({
      where: { id: templateId },
    });
    if (!dbTemplate) {
      throw new NotFoundException(`Template ${templateId} not found`);
    }

    // Adapt DB template to the BuiltinTemplate shape so the generator
    // can handle it uniformly.
    return {
      id: dbTemplate.id,
      name: dbTemplate.name,
      description: dbTemplate.description,
      category: (dbTemplate.category as BuiltinTemplate["category"]) ?? "minimal",
      defaultConfig: (typeof dbTemplate.manifestTemplate === "string" ? JSON.parse(dbTemplate.manifestTemplate) : dbTemplate.manifestTemplate) as Record<string, unknown> ?? {},
      requiredInputs: [],
      channels: [],
      recommendedPolicies: [],
    };
  }
}
