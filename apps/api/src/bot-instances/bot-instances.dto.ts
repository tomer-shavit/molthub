import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsBoolean,
  IsUrl,
  MaxLength,
  IsNumber,
  IsIn,
  Min,
  Max,
} from "class-validator";
// BotStatus, BotHealth, Environment were enums, now plain strings after SQLite migration

export class CreateBotInstanceDto {
  @IsString()
  @MaxLength(255)
  workspaceId: string;

  @IsString()
  @MaxLength(255)
  fleetId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsOptional()
  templateId?: string;

  @IsString()
  @IsOptional()
  profileId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  overlayIds?: string[];

  @IsObject()
  desiredManifest: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  deploymentTargetId?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class UpdateBotInstanceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  fleetId?: string;

  @IsObject()
  @IsOptional()
  desiredManifest?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  overlayIds?: string[];

  @IsString()
  @IsOptional()
  profileId?: string;
}

export class UpdateBotStatusDto {
  @IsString()
  status: string;
}

export class UpdateBotHealthDto {
  @IsString()
  health: string;
}

export class UpdateAiGatewaySettingsDto {
  @IsBoolean()
  enabled: boolean;

  @IsString()
  @MaxLength(100)
  @IsOptional()
  providerName?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  gatewayUrl?: string;

  @IsString()
  @MaxLength(500)
  @IsOptional()
  gatewayApiKey?: string;
}

export class ChatMessageDto {
  @IsString()
  message: string;

  @IsString()
  @IsOptional()
  sessionId?: string;
}

export class PatchConfigDto {
  @IsObject()
  patch: Record<string, unknown>;
}

export class ListBotInstancesQueryDto {
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @IsString()
  @IsOptional()
  fleetId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  health?: string;

  @IsString()
  @IsOptional()
  templateId?: string;
}

/**
 * Resource tier for bot instances.
 * Maps to provider-specific configurations.
 */
export type ResourceTier = "light" | "standard" | "performance" | "custom";

/**
 * DTO for updating bot instance resources.
 * Supports both tier-based selection and custom resource specification.
 */
export class UpdateBotResourcesDto {
  @IsIn(["light", "standard", "performance", "custom"])
  tier: ResourceTier;

  /**
   * CPU allocation in provider-specific units.
   * For ECS: CPU units (256-4096).
   * Only required when tier is "custom".
   */
  @IsOptional()
  @IsNumber()
  @Min(256)
  @Max(4096)
  cpu?: number;

  /**
   * Memory allocation in MiB.
   * For ECS: Memory in MiB (512-30720).
   * Only required when tier is "custom".
   */
  @IsOptional()
  @IsNumber()
  @Min(512)
  @Max(30720)
  memory?: number;

  /**
   * Data disk size in GB.
   * For VM-based targets (GCE, Azure VM).
   * Only supports increasing the disk size.
   */
  @IsOptional()
  @IsNumber()
  @Min(5)
  @Max(100)
  dataDiskSizeGb?: number;
}

/**
 * Response DTO for current bot resources.
 */
export class BotResourcesResponseDto {
  /** Current tier (or "custom" if not matching a predefined tier) */
  tier: ResourceTier;

  /** CPU allocation in provider-specific units */
  cpu: number;

  /** Memory allocation in MiB */
  memory: number;

  /** Data disk size in GB (for VM-based targets) */
  dataDiskSizeGb?: number;

  /** Deployment type for context */
  deploymentType: string;
}
