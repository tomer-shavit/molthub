import { IsObject, IsString, IsOptional } from "class-validator";
import { ApiProperty } from "@nestjs/swagger";

export class CreateManifestDto {
  @ApiProperty({ description: "Complete manifest object" })
  @IsObject()
  content: Record<string, unknown>;

  @ApiProperty({ required: false, description: "Change description" })
  @IsOptional()
  @IsString()
  description?: string;
}

export class ManifestResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  instanceId: string;

  @ApiProperty()
  version: number;

  @ApiProperty()
  content: any;

  @ApiProperty()
  createdBy: string;

  @ApiProperty()
  createdAt: Date;
}