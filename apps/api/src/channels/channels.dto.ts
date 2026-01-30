import {
  IsString,
  IsObject,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsIn,
  IsArray,
  IsNumber,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { Type } from "class-transformer";
import { ChannelType, ChannelStatus } from "@molthub/database";
import {
  MOLTBOT_CHANNEL_TYPES,
  MoltbotChannelType,
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

  @IsIn([...MOLTBOT_CHANNEL_TYPES])
  moltbotType: MoltbotChannelType;

  @IsEnum(ChannelType)
  @IsOptional()
  type?: ChannelType;

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

  @IsEnum(ChannelStatus)
  @IsOptional()
  status?: ChannelStatus;

  @IsObject()
  @IsOptional()
  tags?: Record<string, unknown>;
}

export class ListChannelsQueryDto {
  @IsString()
  workspaceId: string;

  @IsIn([...MOLTBOT_CHANNEL_TYPES])
  @IsOptional()
  moltbotType?: MoltbotChannelType;

  @IsEnum(ChannelType)
  @IsOptional()
  type?: ChannelType;

  @IsEnum(ChannelStatus)
  @IsOptional()
  status?: ChannelStatus;
}

// ============================================
// Auth Flow DTOs
// ============================================

export class StartAuthDto {
  @IsString()
  @IsOptional()
  botInstanceId?: string;
}

export class AuthStatusResponseDto {
  state: string;
  channelId: string;
  moltbotType: string;
  qrCode?: string;
  pairingUrl?: string;
  error?: string;
  expiresAt?: string;
  startedAt: string;
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
