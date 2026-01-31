import {
  IsString,
  IsOptional,
  IsObject,
  IsBoolean,
  IsArray,
  MaxLength
} from "class-validator";
// ConnectorStatus was an enum, now plain string after SQLite migration

export class CreateConnectorDto {
  @IsString()
  @MaxLength(255)
  workspaceId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(255)
  description: string;

  @IsString()
  @MaxLength(255)
  type: string;

  @IsObject()
  config: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isShared?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedInstanceIds?: string[];

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class UpdateConnectorDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;

  @IsBoolean()
  @IsOptional()
  isShared?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  allowedInstanceIds?: string[];

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;

  @IsObject()
  @IsOptional()
  rotationSchedule?: {
    enabled: boolean;
    frequency?: "daily" | "weekly" | "monthly" | "quarterly";
  };
}

export class ListConnectorsQueryDto {
  @IsString()
  workspaceId: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsBoolean()
  @IsOptional()
  isShared?: boolean;
}

export class TestConnectionDto {
  @IsObject()
  @IsOptional()
  options?: Record<string, unknown>;
}
