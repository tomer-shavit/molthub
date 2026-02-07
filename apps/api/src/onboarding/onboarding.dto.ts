import {
  IsString,
  IsOptional,
  IsArray,
  IsObject,
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
  @IsIn(["light", "standard", "performance"])
  tier?: string;

  @IsOptional()
  @IsObject()
  credentials?: Record<string, string>;
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

  @IsOptional()
  @IsString()
  fleetId?: string;

  @IsOptional()
  @IsString()
  savedCredentialId?: string;

  /** @deprecated Use savedCredentialId instead */
  @IsOptional()
  @IsString()
  awsCredentialId?: string;

  @IsOptional()
  @IsString()
  modelCredentialId?: string;

  @ValidateNested()
  @Type(() => DeploymentTargetDto)
  deploymentTarget: DeploymentTargetDto;
}
