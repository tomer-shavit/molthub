import { IsString, IsOptional, IsObject, IsArray, IsNumber } from "class-validator";
// Environment, FleetStatus were enums, now plain strings after SQLite migration

export class CreateFleetDto {
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @IsString()
  name: string;

  @IsString()
  environment: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;

  @IsString()
  @IsOptional()
  defaultProfileId?: string;
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
}

export class UpdateFleetStatusDto {
  @IsString()
  status: string;
}

export class ListFleetsQueryDto {
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @IsString()
  @IsOptional()
  environment?: string;

  @IsString()
  @IsOptional()
  status?: string;
}

export class PromoteFleetDto {
  @IsString()
  targetEnvironment: string;
}