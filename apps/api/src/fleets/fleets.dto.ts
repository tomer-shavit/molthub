import { IsString, IsOptional, IsEnum, IsObject, IsArray, IsNumber } from "class-validator";
import { Environment, FleetStatus } from "@molthub/database";

export class CreateFleetDto {
  @IsString()
  workspaceId: string;

  @IsString()
  name: string;

  @IsEnum(Environment)
  environment: Environment;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  privateSubnetIds?: string[];

  @IsString()
  @IsOptional()
  defaultProfileId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  enforcedPolicyPackIds?: string[];
}

export class UpdateFleetDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;

  @IsString()
  @IsOptional()
  defaultProfileId?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  enforcedPolicyPackIds?: string[];
}

export class UpdateFleetStatusDto {
  @IsEnum(FleetStatus)
  status: FleetStatus;
}

export class ListFleetsQueryDto {
  @IsString()
  workspaceId: string;

  @IsEnum(Environment)
  @IsOptional()
  environment?: Environment;

  @IsEnum(FleetStatus)
  @IsOptional()
  status?: FleetStatus;
}