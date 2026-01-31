import {
  IsString,
  IsObject,
  IsOptional,
  IsBoolean,
  IsIn,
  IsArray,
  IsNumber,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
// ChannelType, ChannelStatus were enums, now plain strings after SQLite migration
import {
  OPENCLAW_CHANNEL_TYPES,
  OpenClawChannelType,
  DM_POLICIES,
  GROUP_POLICIES,
  DmPolicy,
  GroupPolicy,
} from "./channel-types";

// ============================================
// Common Channel Policy DTO
// ============================================

export class ChannelPoliciesDto {
  @IsIn(DM_POLICIES)
  @IsOptional()
  dmPolicy?: DmPolicy;

  @IsIn(GROUP_POLICIES)
  @IsOptional()
  groupPolicy?: GroupPolicy;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowFrom?: string[];

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  groupAllowFrom?: string[];

  @IsNumber()
  @Min(0)
  @IsOptional()
  historyLimit?: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  mediaMaxMb?: number;
}

// ============================================
// Channel CRUD DTOs
// ============================================

export class CreateChannelDto {
  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(255)
  workspaceId: string;

  @IsIn([...OPENCLAW_CHANNEL_TYPES])
  openclawType: OpenClawChannelType;

  @IsString()
  @IsOptional()
  type?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ValidateNested()
  @Type(() => ChannelPoliciesDto)
  @IsOptional()
  policies?: ChannelPoliciesDto;

  @IsObject()
  @IsOptional()
  typeConfig?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  secrets?: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  isShared?: boolean;

  @IsObject()
  @IsOptional()
  tags?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  createdBy?: string;

  @IsString()
  @IsOptional()
  botInstanceId?: string;
}

export class UpdateChannelDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @ValidateNested()
  @Type(() => ChannelPoliciesDto)
  @IsOptional()
  policies?: ChannelPoliciesDto;

  @IsObject()
  @IsOptional()
  typeConfig?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  secrets?: Record<string, string>;

  @IsBoolean()
  @IsOptional()
  isShared?: boolean;

  @IsString()
  @IsOptional()
  status?: string;

  @IsObject()
  @IsOptional()
  tags?: Record<string, unknown>;
}

export class ListChannelsQueryDto {
  @IsString()
  workspaceId: string;

  @IsIn([...OPENCLAW_CHANNEL_TYPES])
  @IsOptional()
  openclawType?: OpenClawChannelType;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

// ============================================
// Auth Flow DTOs
// ============================================

export class StartAuthDto {
  @IsString()
  @IsOptional()
  botInstanceId?: string;
}

export class ValidateTokenDto {
  @IsString()
  token: string;

  @IsString()
  @IsOptional()
  appToken?: string;
}

export class AuthStatusResponseDto {
  state: string;
  channelId: string;
  openclawType: string;
  qrCode?: string;
  qrExpiresAt?: string;
  pairingUrl?: string;
  error?: string;
  expiresAt?: string;
  startedAt: string;
  platformDetails?: Record<string, unknown>;
}

// ============================================
// Config Generation DTOs
// ============================================

export class GenerateConfigDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  channelIds?: string[];
}

// ============================================
// Testing DTOs
// ============================================

export class TestChannelDto {
  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}

export class SendTestMessageDto {
  @IsString()
  message: string;

  @IsObject()
  @IsOptional()
  targetDestination?: Record<string, unknown>;
}

// ============================================
// Binding DTOs
// ============================================

export class BindChannelToBotDto {
  @IsString()
  botId: string;

  @IsString()
  purpose: string;

  @IsObject()
  @IsOptional()
  settings?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  targetDestination?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateBindingDto {
  @IsObject()
  @IsOptional()
  settings?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  targetDestination?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsString()
  @IsOptional()
  purpose?: string;
}
