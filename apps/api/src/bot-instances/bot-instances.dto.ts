import {
  IsString,
  IsOptional,
  IsEnum,
  IsObject,
  IsArray,
  IsBoolean,
  IsUrl,
  MaxLength
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
