import { IsString, IsNotEmpty, IsOptional, IsEnum, Length } from "class-validator";

/**
 * Valid channel types for pairing operations.
 * Mirrors OpenClawChannelType from Prisma schema.
 */
enum PairingChannelType {
  WHATSAPP = "WHATSAPP",
  TELEGRAM = "TELEGRAM",
  DISCORD = "DISCORD",
  SLACK = "SLACK",
  SIGNAL = "SIGNAL",
  IMESSAGE = "IMESSAGE",
  MATTERMOST = "MATTERMOST",
  GOOGLE_CHAT = "GOOGLE_CHAT",
  MS_TEAMS = "MS_TEAMS",
  LINE = "LINE",
  MATRIX = "MATRIX",
}

enum PairingStateFilter {
  PENDING = "PENDING",
  APPROVED = "APPROVED",
  REJECTED = "REJECTED",
  REVOKED = "REVOKED",
  EXPIRED = "EXPIRED",
}

export class PairingActionDto {
  @IsEnum(PairingChannelType, {
    message: "channelType must be a valid channel type (WHATSAPP, TELEGRAM, DISCORD, SLACK, etc.)",
  })
  channelType: string;

  @IsString()
  @IsNotEmpty()
  senderId: string;
}

export class ApproveByCodeDto {
  @IsString()
  @Length(8, 8, { message: "code must be exactly 8 characters" })
  code: string;
}

export class ListPairingsQueryDto {
  @IsOptional()
  @IsEnum(PairingStateFilter, {
    message: "state must be one of: PENDING, APPROVED, REJECTED, REVOKED, EXPIRED",
  })
  state?: string;
}
