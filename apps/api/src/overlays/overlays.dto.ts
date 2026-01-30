import { 
  IsString, 
  IsOptional, 
  IsObject, 
  IsNumber, 
  IsBoolean,
  IsEnum 
} from "class-validator";

export class CreateOverlayDto {
  @IsString()
  workspaceId: string;

  @IsString()
  name: string;

  @IsString()
  description: string;

  @IsString()
  targetType: string;

  @IsObject()
  targetSelector: {
    instanceIds?: string[];
    fleetId?: string;
    environment?: string;
    tags?: Record<string, string>;
  };

  @IsObject()
  overrides: Record<string, unknown>;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  rollout?: {
    strategy: "all" | "percentage" | "canary";
    percentage?: number;
    canaryInstances?: string[];
  };

  @IsObject()
  @IsOptional()
  schedule?: {
    startTime?: Date;
    endTime?: Date;
    timezone?: string;
  };

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class UpdateOverlayDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  targetType?: string;

  @IsObject()
  @IsOptional()
  targetSelector?: {
    instanceIds?: string[];
    fleetId?: string;
    environment?: string;
    tags?: Record<string, string>;
  };

  @IsObject()
  @IsOptional()
  overrides?: Record<string, unknown>;

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  rollout?: {
    strategy: "all" | "percentage" | "canary";
    percentage?: number;
    canaryInstances?: string[];
  };

  @IsObject()
  @IsOptional()
  schedule?: {
    startTime?: Date;
    endTime?: Date;
    timezone?: string;
  };
}

export class ListOverlaysQueryDto {
  @IsString()
  workspaceId: string;

  @IsString()
  @IsOptional()
  targetType?: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;
}