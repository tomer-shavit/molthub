import {
  IsString,
  IsOptional,
  IsNotEmpty,
  MaxLength,
  IsIn,
  IsObject,
} from "class-validator";

export class SaveCredentialDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsString()
  @IsIn(["aws-account", "azure-account", "gce-account", "api-key"])
  type: string;

  @IsObject()
  credentials: Record<string, unknown>;

  /** Set by the controller from the authenticated workspace. Not sent by the frontend. */
  @IsString()
  @IsOptional()
  workspaceId?: string;
}

export class ListSavedCredentialsQueryDto {
  /** Set by the controller from the authenticated workspace. Not sent by the frontend. */
  @IsString()
  @IsOptional()
  workspaceId?: string;

  @IsString()
  @IsOptional()
  @IsIn(["aws-account", "azure-account", "gce-account", "api-key"])
  type?: string;
}
