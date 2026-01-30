import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
} from "class-validator";
import { Transform } from "class-transformer";
import { SloMetric, SloWindow } from "@molthub/database";

export class CreateSloDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  instanceId: string;

  @IsEnum(SloMetric)
  metric: SloMetric;

  @IsNumber()
  @Transform(({ value }) => parseFloat(value))
  targetValue: number;

  @IsEnum(SloWindow)
  window: SloWindow;

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

  @IsEnum(SloMetric)
  @IsOptional()
  metric?: SloMetric;

  @IsNumber()
  @Transform(({ value }) => (value !== undefined ? parseFloat(value) : undefined))
  @IsOptional()
  targetValue?: number;

  @IsEnum(SloWindow)
  @IsOptional()
  window?: SloWindow;

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
