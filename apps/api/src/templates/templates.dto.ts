import {
  IsString,
  IsObject,
  IsOptional,
  IsArray,
} from "class-validator";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

// =============================================================================
// Create Custom Template DTO
// =============================================================================

export class CreateTemplateDto {
  @ApiProperty({ description: "Human-readable template name" })
  @IsString()
  name: string;

  @ApiProperty({ description: "Short description of what this template provides" })
  @IsString()
  description: string;

  @ApiProperty({
    description: "Template category",
    enum: ["communication", "development", "operations", "minimal"],
  })
  @IsString()
  category: string;

  @ApiProperty({ description: "Partial MoltbotFullConfig used as defaults" })
  @IsObject()
  defaultConfig: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Channel presets for this template",
    type: "array",
  })
  @IsOptional()
  @IsArray()
  channels?: Array<{
    type: string;
    enabled: boolean;
    defaults: Record<string, unknown>;
  }>;

  @ApiPropertyOptional({
    description: "Recommended policy pack IDs",
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recommendedPolicies?: string[];

  @ApiPropertyOptional({
    description: "Legacy manifest template (v1 compat)",
  })
  @IsOptional()
  @IsObject()
  manifestTemplate?: Record<string, unknown>;
}

// =============================================================================
// Preview Config DTO
// =============================================================================

export class PreviewConfigDto {
  @ApiPropertyOptional({
    description: "Key-value map of user-provided input values",
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, string>;

  @ApiPropertyOptional({
    description: "Arbitrary config overrides deep-merged onto template defaults",
  })
  @IsOptional()
  @IsObject()
  configOverrides?: Record<string, unknown>;
}

// =============================================================================
// Generate Config DTO
// =============================================================================

export class GenerateConfigDto {
  @ApiPropertyOptional({
    description: "Key-value map of user-provided input values",
  })
  @IsOptional()
  @IsObject()
  values?: Record<string, string>;

  @ApiPropertyOptional({
    description: "Arbitrary config overrides deep-merged onto template defaults",
  })
  @IsOptional()
  @IsObject()
  configOverrides?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Instance name (lowercase alphanumeric + hyphens, max 63 chars)",
  })
  @IsOptional()
  @IsString()
  instanceName?: string;

  @ApiPropertyOptional({
    description: "Workspace slug for the manifest",
  })
  @IsOptional()
  @IsString()
  workspace?: string;

  @ApiPropertyOptional({
    description: "Target environment",
    enum: ["dev", "staging", "prod", "local"],
  })
  @IsOptional()
  @IsString()
  environment?: "dev" | "staging" | "prod" | "local";

  @ApiPropertyOptional({
    description: "Deployment target",
    enum: ["local", "docker", "ecs", "kubernetes", "fly"],
  })
  @IsOptional()
  @IsString()
  deploymentTarget?: "local" | "docker" | "ecs" | "kubernetes" | "fly";

  @ApiPropertyOptional({
    description: "Extra labels for manifest metadata",
  })
  @IsOptional()
  @IsObject()
  labels?: Record<string, string>;
}

// =============================================================================
// Response DTOs
// =============================================================================

export class RequiredInputResponseDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  label: string;

  @ApiProperty()
  envVar: string;

  @ApiProperty()
  configPath: string;

  @ApiProperty()
  secret: boolean;

  @ApiPropertyOptional()
  placeholder?: string;
}

export class ChannelPresetResponseDto {
  @ApiProperty()
  type: string;

  @ApiProperty()
  enabled: boolean;

  @ApiProperty()
  defaults: Record<string, unknown>;
}

export class TemplateResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  description: string;

  @ApiProperty()
  category: string;

  @ApiProperty({ description: "Partial default config" })
  defaultConfig: Record<string, unknown>;

  @ApiProperty()
  isBuiltin: boolean;

  @ApiPropertyOptional({ type: [RequiredInputResponseDto] })
  requiredInputs?: RequiredInputResponseDto[];

  @ApiPropertyOptional({ type: [ChannelPresetResponseDto] })
  channels?: ChannelPresetResponseDto[];

  @ApiPropertyOptional({ type: [String] })
  recommendedPolicies?: string[];

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class ConfigPreviewResponseDto {
  @ApiProperty({ description: "Fully resolved moltbot.json config" })
  config: Record<string, unknown>;

  @ApiProperty({
    description: "Map of env-var name -> description for secrets to provision",
  })
  secretRefs: Record<string, string>;
}

export class GenerateConfigResponseDto {
  @ApiProperty({ description: "Fully resolved moltbot.json config" })
  config: Record<string, unknown>;

  @ApiProperty({ description: "v2 MoltbotManifest wrapping the config" })
  manifest: Record<string, unknown>;

  @ApiProperty({
    description: "Map of env-var name -> description for secrets to provision",
  })
  secretRefs: Record<string, string>;
}
