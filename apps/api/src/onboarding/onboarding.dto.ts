import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsObject,
} from "class-validator";
import { Type } from "class-transformer";

export class DeploymentTargetDto {
  @IsString()
  type: "docker" | "ecs-fargate";

  // Docker fields
  @IsOptional()
  @IsString()
  containerName?: string;

  @IsOptional()
  @IsString()
  configPath?: string;

  // ECS fields
  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @IsString()
  accessKeyId?: string;

  @IsOptional()
  @IsString()
  secretAccessKey?: string;

  @IsOptional()
  @IsArray()
  subnetIds?: string[];

  @IsOptional()
  @IsString()
  securityGroupId?: string;

  @IsOptional()
  @IsString()
  executionRoleArn?: string;
}

export class ChannelConfigDto {
  @IsString()
  type: string; // "whatsapp" | "telegram" | "discord" | "slack"

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>; // channel-specific config (tokens, etc.)
}

export class OnboardingDeployDto {
  @IsString()
  templateId: string;

  @IsString()
  botName: string;

  @ValidateNested()
  @Type(() => DeploymentTargetDto)
  deploymentTarget: DeploymentTargetDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelConfigDto)
  channels?: ChannelConfigDto[];

  @IsOptional()
  @IsString()
  environment?: string; // defaults to "dev"

  @IsOptional()
  @IsObject()
  configOverrides?: Record<string, unknown>;
}

export class OnboardingPreviewDto {
  @IsString()
  templateId: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelConfigDto)
  channels?: ChannelConfigDto[];

  @IsOptional()
  @IsObject()
  configOverrides?: Record<string, unknown>;
}
