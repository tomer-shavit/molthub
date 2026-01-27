import { IsString, IsOptional, IsDateString } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class ListAuditEventsQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  instanceId?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  actor?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AuditEventResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  actor: string;

  @ApiProperty()
  action: string;

  @ApiProperty()
  resourceType: string;

  @ApiProperty()
  resourceId: string;

  @ApiProperty({ required: false })
  diffSummary?: string;

  @ApiProperty()
  timestamp: Date;

  @ApiProperty()
  metadata: any;
}