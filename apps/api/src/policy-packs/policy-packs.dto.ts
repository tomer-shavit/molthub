import { 
  IsString, 
  IsOptional, 
  IsObject, 
  IsArray, 
  IsNumber, 
  IsBoolean 
} from "class-validator";

export class CreatePolicyPackDto {
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsBoolean()
  @IsOptional()
  autoApply?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetEnvironments?: string[];

  @IsObject()
  @IsOptional()
  targetTags?: Record<string, string>;

  @IsArray()
  @IsOptional()
  rules?: Record<string, unknown>[];

  @IsBoolean()
  @IsOptional()
  isEnforced?: boolean;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  version?: string;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class UpdatePolicyPackDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsBoolean()
  @IsOptional()
  autoApply?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  targetEnvironments?: string[];

  @IsObject()
  @IsOptional()
  targetTags?: Record<string, string>;

  @IsArray()
  @IsOptional()
  rules?: Record<string, unknown>[];

  @IsBoolean()
  @IsOptional()
  isEnforced?: boolean;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ListPolicyPacksQueryDto {
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isBuiltin?: boolean;

  @IsBoolean()
  @IsOptional()
  autoApply?: boolean;
}

export class EvaluatePolicyDto {
  @IsString()
  policyPackId: string;

  @IsString()
  resourceType: string;

  @IsString()
  resourceId: string;

  @IsObject()
  manifest: Record<string, unknown>;
}