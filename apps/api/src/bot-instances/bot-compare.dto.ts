import {
  IsArray,
  IsString,
  IsEnum,
  ArrayMinSize,
  ArrayMaxSize,
  IsBoolean,
  IsOptional,
} from "class-validator";

export class CompareBotsDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  instanceIds: string[];
}

export type BulkActionType = "restart" | "pause" | "stop" | "start";

export class BulkActionDto {
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  instanceIds: string[];

  @IsEnum(["restart", "pause", "stop", "start"] as const, {
    message: "action must be one of: restart, pause, stop, start",
  })
  action: BulkActionType;
}

export interface BulkActionResultItem {
  instanceId: string;
  success: boolean;
  error?: string;
}
