import { IsString, IsOptional, IsObject, IsBoolean, IsArray, IsJSON } from 'class-validator';

export class CreateSkillPackDto {
  @IsString()
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  skills?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  mcps?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  envVars?: Record<string, string>;
}

export class UpdateSkillPackDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsArray()
  skills?: Record<string, unknown>[];

  @IsOptional()
  @IsArray()
  mcps?: Record<string, unknown>[];

  @IsOptional()
  @IsObject()
  envVars?: Record<string, string>;
}

export class AttachSkillPackDto {
  @IsString()
  botInstanceId: string;

  @IsOptional()
  @IsObject()
  envOverrides?: Record<string, string>;
}

export class DetachSkillPackDto {
  @IsString()
  botInstanceId: string;
}

export class BulkAttachSkillPackDto {
  @IsArray()
  botInstanceIds: string[];

  @IsOptional()
  @IsObject()
  envOverrides?: Record<string, string>;
}
