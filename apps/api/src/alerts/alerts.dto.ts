import {
  IsOptional,
  IsString,
  IsEnum,
  IsDateString,
  IsInt,
  Min,
  Max,
} from "class-validator";
import { Type } from "class-transformer";
import { ApiPropertyOptional } from "@nestjs/swagger";
import { AlertSeverity, AlertStatus } from "@molthub/database";

// ---------------------------------------------------------------------------
// Query DTO
// ---------------------------------------------------------------------------

export class AlertQueryDto {
  @ApiPropertyOptional({ description: "Filter by bot instance ID" })
  @IsOptional()
  @IsString()
  instanceId?: string;

  @ApiPropertyOptional({ description: "Filter by fleet ID" })
  @IsOptional()
  @IsString()
  fleetId?: string;

  @ApiPropertyOptional({ enum: AlertSeverity, description: "Filter by severity" })
  @IsOptional()
  @IsEnum(AlertSeverity)
  severity?: AlertSeverity;

  @ApiPropertyOptional({ enum: AlertStatus, description: "Filter by status" })
  @IsOptional()
  @IsEnum(AlertStatus)
  status?: AlertStatus;

  @ApiPropertyOptional({ description: "Filter by rule name" })
  @IsOptional()
  @IsString()
  rule?: string;

  @ApiPropertyOptional({ description: "Start date (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: "End date (ISO 8601)" })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: "Page number (1-based)", default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: "Items per page", default: 50 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;
}

// ---------------------------------------------------------------------------
// Acknowledge DTO
// ---------------------------------------------------------------------------

export class AcknowledgeAlertDto {
  @ApiPropertyOptional({ description: "User or system that acknowledged the alert" })
  @IsOptional()
  @IsString()
  acknowledgedBy?: string;
}

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

export interface AlertSummaryResponse {
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
}
