import {
  IsString,
  IsOptional,
  IsEnum,
  IsInt,
  IsBoolean,
  IsDateString,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { CostProvider } from "@molthub/database";

// ============================================
// Cost Event DTOs
// ============================================

export class CreateCostEventDto {
  @IsString()
  instanceId: string;

  @IsEnum(CostProvider)
  provider: CostProvider;

  @IsString()
  model: string;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  inputTokens: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  outputTokens: number;

  @IsInt()
  @Min(0)
  @Type(() => Number)
  costCents: number;

  @IsString()
  @IsOptional()
  channelType?: string;

  @IsString()
  @IsOptional()
  traceId?: string;
}

export class CostQueryDto {
  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsEnum(CostProvider)
  @IsOptional()
  provider?: CostProvider;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  page?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  limit?: number;
}

export class CostSummaryQueryDto {
  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;
}

// ============================================
// Budget DTOs
// ============================================

export class CreateBudgetDto {
  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  fleetId?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  monthlyLimitCents: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  warnThresholdPct?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  criticalThresholdPct?: number;
}

export class UpdateBudgetDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsInt()
  @Min(1)
  @Type(() => Number)
  @IsOptional()
  monthlyLimitCents?: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  warnThresholdPct?: number;

  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  @IsOptional()
  criticalThresholdPct?: number;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class BudgetQueryDto {
  @IsString()
  @IsOptional()
  instanceId?: string;

  @IsString()
  @IsOptional()
  fleetId?: string;

  @IsBoolean()
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;
}
