import {
  IsString,
  IsBoolean,
  IsOptional,
  IsObject,
  IsNotEmpty,
  MaxLength,
  Matches,
} from "class-validator";

export class AssignMiddlewareDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  @Matches(/^@[\w-]+\/[\w-]+$/, {
    message: "package must be a scoped npm package name (e.g. @scope/name)",
  })
  package: string;

  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}

export class UpdateMiddlewareAssignmentDto {
  @IsBoolean()
  @IsOptional()
  enabled?: boolean;

  @IsObject()
  @IsOptional()
  config?: Record<string, unknown>;
}
