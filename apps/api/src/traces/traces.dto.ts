import { 
  IsString, 
  IsOptional, 
  IsObject, 
  IsEnum,
  IsNumber,
  IsDateString
} from "class-validator";

export enum TraceStatus {
  SUCCESS = "SUCCESS",
  ERROR = "ERROR",
  PENDING = "PENDING",
}

export enum TraceType {
  REQUEST = "REQUEST",
  TASK = "TASK",
  SKILL = "SKILL",
  LLM = "LLM",
  DATABASE = "DATABASE",
  EXTERNAL_API = "EXTERNAL_API",
}

export class CreateTraceDto {
  @IsString()
  botInstanceId: string;

  @IsString()
  traceId: string;

  @IsString()
  @IsOptional()
  parentTraceId?: string;

  @IsString()
  name: string;

  @IsEnum(TraceType)
  type: string;

  @IsEnum(TraceStatus)
  @IsOptional()
  status?: string;

  @IsDateString()
  @IsOptional()
  startedAt?: Date;

  @IsDateString()
  @IsOptional()
  endedAt?: Date;

  @IsNumber()
  @IsOptional()
  durationMs?: number;

  @IsObject()
  @IsOptional()
  input?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  output?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  error?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;

  @IsObject()
  @IsOptional()
  tags?: Record<string, string>;
}

export class ListTracesQueryDto {
  @IsString()
  @IsOptional()
  botInstanceId?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsString()
  @IsOptional()
  status?: string;

  @IsString()
  @IsOptional()
  traceId?: string;

  @IsString()
  @IsOptional()
  parentTraceId?: string;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsNumber()
  @IsOptional()
  limit?: number;
}