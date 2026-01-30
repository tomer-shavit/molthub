import {
  IsString,
  IsOptional,
  IsObject,
  IsArray,
  IsNumber,
  IsBoolean,
  MaxLength
} from "class-validator";

export class CreateProfileDto {
  @IsString()
  @MaxLength(255)
  workspaceId: string;

  @IsString()
  @MaxLength(255)
  name: string;

  @IsString()
  @MaxLength(1000)
  description: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  fleetIds?: string[];

  @IsObject()
  defaults: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  mergeStrategy?: Record<string, "override" | "merge" | "prepend" | "append">;

  @IsBoolean()
  @IsOptional()
  allowInstanceOverrides?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  lockedFields?: string[];

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class UpdateProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  fleetIds?: string[];

  @IsObject()
  @IsOptional()
  defaults?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  mergeStrategy?: Record<string, "override" | "merge" | "prepend" | "append">;

  @IsBoolean()
  @IsOptional()
  allowInstanceOverrides?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  lockedFields?: string[];

  @IsNumber()
  @IsOptional()
  priority?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class ListProfilesQueryDto {
  @IsString()
  workspaceId: string;

  @IsString()
  @IsOptional()
  fleetId?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
