import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
} from "class-validator";
import { Type } from "class-transformer";

class ChannelConfigDto {
  @IsString()
  type: string;

  @IsOptional()
  config?: Record<string, unknown>;
}

class DeploymentTargetDto {
  @IsString()
  type: string;

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

  @IsOptional()
  @IsString()
  containerName?: string;

  @IsOptional()
  @IsString()
  configPath?: string;
}

export class OnboardingPreviewDto {
  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelConfigDto)
  channels?: ChannelConfigDto[];

  @IsOptional()
  configOverrides?: Record<string, unknown>;
}

export class OnboardingDeployDto {
  @IsString()
  @IsNotEmpty()
  botName: string;

  @IsString()
  @IsNotEmpty()
  templateId: string;

  @IsOptional()
  @IsString()
  environment?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChannelConfigDto)
  channels?: ChannelConfigDto[];

  @IsOptional()
  configOverrides?: Record<string, unknown>;

  @ValidateNested()
  @Type(() => DeploymentTargetDto)
  deploymentTarget: DeploymentTargetDto;
}
