import { 
  IsString, 
  IsOptional, 
  IsEnum, 
  IsObject, 
  IsArray 
} from "class-validator";
import { BotStatus, BotHealth, Environment } from "@molthub/database";

export class CreateBotInstanceDto {
  @IsString()
  workspaceId: string;

  @IsString()
  fleetId: string;

  @IsString()
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
  desiredManifest: Record<string, any>;

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

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
  desiredManifest?: Record<string, any>;

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, any>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  overlayIds?: string[];

  @IsString()
  @IsOptional()
  profileId?: string;
}

export class UpdateBotStatusDto {
  @IsEnum(BotStatus)
  status: BotStatus;
}

export class UpdateBotHealthDto {
  @IsEnum(BotHealth)
  health: BotHealth;
}

export class ListBotInstancesQueryDto {
  @IsString()
  workspaceId: string;

  @IsString()
  @IsOptional()
  fleetId?: string;

  @IsEnum(BotStatus)
  @IsOptional()
  status?: BotStatus;

  @IsEnum(BotHealth)
  @IsOptional()
  health?: BotHealth;

  @IsString()
  @IsOptional()
  templateId?: string;
}