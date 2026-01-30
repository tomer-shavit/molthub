import { 
  IsString, 
  IsOptional, 
  IsObject, 
  IsEnum,
  IsNumber,
  IsArray
} from "class-validator";

export enum ChangeType {
  UPDATE = "UPDATE",
  ROLLOUT = "ROLLOUT",
  ROLLBACK = "ROLLBACK",
}

export enum RolloutStrategy {
  ALL = "ALL",
  PERCENTAGE = "PERCENTAGE",
  CANARY = "CANARY",
}

export class CreateChangeSetDto {
  @IsString()
  botInstanceId: string;

  @IsEnum(ChangeType)
  changeType: string;

  @IsString()
  description: string;

  @IsObject()
  @IsOptional()
  fromManifest?: Record<string, unknown>;

  @IsObject()
  toManifest: Record<string, unknown>;

  @IsEnum(RolloutStrategy)
  @IsOptional()
  rolloutStrategy?: string;

  @IsNumber()
  @IsOptional()
  rolloutPercentage?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  canaryInstances?: string[];

  @IsNumber()
  @IsOptional()
  totalInstances?: number;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class RollbackChangeSetDto {
  @IsString()
  reason: string;

  @IsString()
  @IsOptional()
  rolledBackBy?: string;
}

export class ListChangeSetsQueryDto {
  @IsString()
  @IsOptional()
  botInstanceId?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  changeType?: string;
}