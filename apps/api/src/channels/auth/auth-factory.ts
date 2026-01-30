import { Injectable, BadRequestException } from "@nestjs/common";
import { MoltbotChannelType } from "../channel-types";
import { WhatsAppAuthService, WhatsAppAuthResult } from "./whatsapp-auth.service";
import { TelegramAuthService, TelegramAuthResult } from "./telegram-auth.service";
import { DiscordAuthService, DiscordAuthResult } from "./discord-auth.service";
import { SlackAuthService, SlackAuthResult } from "./slack-auth.service";

// ---------------------------------------------------------------------------
// Channel Auth Factory
//
// Dispatches auth operations to platform-specific auth services.
// Each platform has its own auth method:
//   - WhatsApp: QR pairing via Gateway
//   - Telegram: Bot API token validation (getMe)
//   - Discord:  Bot token validation + guild fetch
//   - Slack:    Bot token + app token + Socket Mode validation
// ---------------------------------------------------------------------------

export type PlatformAuthResult =
  | WhatsAppAuthResult
  | TelegramAuthResult
  | DiscordAuthResult
  | SlackAuthResult;

export interface ValidateTokenParams {
  channelType: MoltbotChannelType;
  /** Bot token (Telegram, Discord) or bot token (Slack) */
  token?: string;
  /** App-level token (Slack only) */
  appToken?: string;
  /** Channel ID (WhatsApp only, for QR pairing) */
  channelId?: string;
  /** Bot instance ID (WhatsApp only, to execute command on the instance) */
  botInstanceId?: string;
}

/** Channels that have real API-based auth validation */
const TOKEN_AUTH_CHANNELS: MoltbotChannelType[] = [
  "telegram",
  "discord",
  "slack",
];

/** Channels that use QR-based pairing */
const QR_AUTH_CHANNELS: MoltbotChannelType[] = ["whatsapp"];

@Injectable()
export class ChannelAuthFactory {
  constructor(
    private readonly whatsappAuth: WhatsAppAuthService,
    private readonly telegramAuth: TelegramAuthService,
    private readonly discordAuth: DiscordAuthService,
    private readonly slackAuth: SlackAuthService,
  ) {}

  // ========================================================================
  // Dispatch Auth Validation
  // ========================================================================

  /**
   * Validate credentials for a specific channel type.
   * Routes to the appropriate platform auth service.
   */
  async validateCredentials(
    params: ValidateTokenParams,
  ): Promise<PlatformAuthResult> {
    const { channelType } = params;

    switch (channelType) {
      case "whatsapp":
        return this.handleWhatsApp(params);
      case "telegram":
        return this.handleTelegram(params);
      case "discord":
        return this.handleDiscord(params);
      case "slack":
        return this.handleSlack(params);
      default:
        // For channels without real validation (signal, imessage, etc.),
        // return a pending state — they rely on config-level setup
        return { state: "pending" };
    }
  }

  // ========================================================================
  // Platform Checks
  // ========================================================================

  /** Returns true if this channel type supports real API-based token auth */
  supportsTokenValidation(channelType: MoltbotChannelType): boolean {
    return TOKEN_AUTH_CHANNELS.includes(channelType);
  }

  /** Returns true if this channel type uses QR-based pairing */
  requiresQrPairing(channelType: MoltbotChannelType): boolean {
    return QR_AUTH_CHANNELS.includes(channelType);
  }

  /** Get the WhatsApp auth service directly (for QR operations) */
  getWhatsAppService(): WhatsAppAuthService {
    return this.whatsappAuth;
  }

  /** Get the Discord auth service directly (for guild refresh) */
  getDiscordService(): DiscordAuthService {
    return this.discordAuth;
  }

  // ========================================================================
  // Private: Platform Handlers
  // ========================================================================

  private async handleWhatsApp(
    params: ValidateTokenParams,
  ): Promise<WhatsAppAuthResult> {
    if (!params.channelId) {
      throw new BadRequestException(
        "channelId is required for WhatsApp QR pairing",
      );
    }
    return this.whatsappAuth.startPairing(
      params.channelId,
      params.botInstanceId,
    );
  }

  private async handleTelegram(
    params: ValidateTokenParams,
  ): Promise<TelegramAuthResult> {
    if (!params.token) {
      throw new BadRequestException(
        "botToken is required for Telegram validation",
      );
    }
    return this.telegramAuth.validateToken(params.token);
  }

  private async handleDiscord(
    params: ValidateTokenParams,
  ): Promise<DiscordAuthResult> {
    if (!params.token) {
      throw new BadRequestException(
        "token is required for Discord validation",
      );
    }
    return this.discordAuth.validateToken(params.token);
  }

  private async handleSlack(
    params: ValidateTokenParams,
  ): Promise<SlackAuthResult> {
    if (!params.token) {
      throw new BadRequestException(
        "botToken is required for Slack validation",
      );
    }
    if (!params.appToken) {
      throw new BadRequestException(
        "appToken is required for Slack Socket Mode validation",
      );
    }
    return this.slackAuth.validateTokens(params.token, params.appToken);
  }
}
