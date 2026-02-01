import {
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNotEmpty,
  MaxLength,
  Matches,
  IsIn,
} from "class-validator";
import { Type } from "class-transformer";

class ChannelConfigDto {
  @IsString()
  type: string;

  @IsOptional()
  config?: Record<string, unknown>;
}

class ModelConfigDto {
  @IsString()
  provider: string;

  @IsString()
  model: string;

  @IsString()
  apiKey: string;
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
  @IsString()
  @IsIn(["simple", "production"])
  tier?: string;

  @IsOptional()
  @IsString()
  certificateArn?: string;

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

export class ValidateAwsDto {
  @IsString()
  @IsNotEmpty()
  accessKeyId: string;

  @IsString()
  @IsNotEmpty()
  secretAccessKey: string;

  @IsString()
  @IsNotEmpty()
  region: string;
}

export class OnboardingDeployDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(63)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, {
    message:
      "Bot name must start with a letter or number and contain only letters, numbers, hyphens, or underscores",
  })
  botName: string;

  @IsOptional()
  @IsString()
  templateId?: string;

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

  @IsOptional()
  @ValidateNested()
  @Type(() => ModelConfigDto)
  modelConfig?: ModelConfigDto;

  @ValidateNested()
  @Type(() => DeploymentTargetDto)
  deploymentTarget: DeploymentTargetDto;
}
