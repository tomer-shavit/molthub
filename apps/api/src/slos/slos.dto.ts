import {
  IsString,
  IsOptional,
  IsNumber,
  IsBoolean,
} from "class-validator";
import { Transform } from "class-transformer";

export class CreateSloDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  instanceId: string;

  @IsString()
  metric: string;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  targetValue: number;

  @IsString()
  window: string;

  @IsString()
  @IsOptional()
  createdBy?: string;
}

export class UpdateSloDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  metric?: string;

  @IsNumber()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : undefined))
  @IsOptional()
  targetValue?: number;

  @IsString()
  @IsOptional()
  window?: string;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class SloQueryDto {
  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  isBreached?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
