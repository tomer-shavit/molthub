import { 
  IsString, 
  IsOptional, 
  IsObject, 
  IsBoolean,
  IsEnum,
  IsArray
} from "class-validator";
import { ConnectorStatus } from "@molthub/database";

export class CreateConnectorDto {
  @IsString()
  workspaceId: string;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  type: string;

  @IsObject()
  config: Record<string, any>;

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
  config?: Record<string, any>;

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

  @IsEnum(ConnectorStatus)
  @IsOptional()
  status?: ConnectorStatus;

  @IsBoolean()
  @IsOptional()
  isShared?: boolean;
}

export class TestConnectionDto {
  @IsObject()
  @IsOptional()
  options?: Record<string, any>;
}