import { IsString, IsOptional, IsObject, IsEnum, IsArray } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";
import { InstanceStatus, Environment } from "@molthub/core";

export class CreateInstanceDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ enum: Environment })
  @IsEnum(Environment)
  environment: Environment;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  tags?: Record<string, string>;

  @ApiProperty({ description: "Template ID or 'blank'" })
  @IsString()
  templateId: string;

  @ApiProperty({ required: false, description: "Override manifest fields" })
  @IsOptional()
  @IsObject()
  manifestOverrides?: Record<string, unknown>;
}

export class ListInstancesQueryDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  workspaceId?: string;

  @ApiProperty({ required: false, enum: Environment })
  @IsOptional()
  @IsEnum(Environment)
  environment?: Environment;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  status?: InstanceStatus;
}

export class InstanceResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  workspaceId: string;

  @ApiProperty()
  name: string;

  @ApiProperty({ enum: Environment })
  environment: Environment;

  @ApiProperty()
  tags: any;

  @ApiProperty({ enum: InstanceStatus })
  status: InstanceStatus;

  @ApiProperty({ required: false })
  desiredManifestId?: string;

  @ApiProperty({ required: false })
  lastReconcileAt?: Date;

  @ApiProperty({ required: false })
  lastError?: string;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}