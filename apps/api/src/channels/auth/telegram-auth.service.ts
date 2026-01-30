import { Injectable, Logger } from "@nestjs/common";
import { ChannelAuthState } from "../channel-types";

// ---------------------------------------------------------------------------
// Telegram Auth Service
//
// Telegram uses bot token validation via the Telegram Bot API.
// We call `getMe` to validate the token and retrieve bot info.
// ---------------------------------------------------------------------------

export interface TelegramBotInfo {
  id: number;
  isBot: boolean;
  firstName: string;
  username: string;
  canJoinGroups: boolean;
  canReadAllGroupMessages: boolean;
  supportsInlineQueries: boolean;
}

export interface TelegramAuthResult {
  state: ChannelAuthState;
  botInfo?: TelegramBotInfo;
  error?: string;
}

const TELEGRAM_API_BASE = "https://api.telegram.org";

@Injectable()
export class TelegramAuthService {
  private readonly logger = new Logger(TelegramAuthService.name);

  // ========================================================================
  // Validate Bot Token
  // ========================================================================

  /**
   * Validate a Telegram bot token by calling the `getMe` API endpoint.
   * Returns bot information on success, or an error state on failure.
   */
  async validateToken(botToken: string): Promise<TelegramAuthResult> {
    this.logger.log("Validating Telegram bot token via getMe API");

    // Format validation first
    const formatError = this.validateTokenFormat(botToken);
    if (formatError) {
      return { state: "error", error: formatError };
    }

    try {
      const url = `${TELEGRAM_API_BASE}/bot${botToken}/getMe`;
      const response = await fetch(url, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const description =
          (body as Record<string, unknown>).description ||
          `HTTP ${response.status}`;
        this.logger.warn(`Telegram token validation failed: ${description}`);
        return {
          state: "error",
          error: `Telegram API error: ${description}`,
        };
      }

      const data = (await response.json()) as {
        ok: boolean;
        result?: TelegramBotInfo;
        description?: string;
      };

      if (!data.ok || !data.result) {
        return {
          state: "error",
          error: data.description || "Telegram API returned an unexpected response",
        };
      }

      if (!data.result.isBot) {
        return {
          state: "error",
          error: "The token does not belong to a bot account",
        };
      }

      this.logger.log(
        `Telegram bot validated: @${data.result.username} (ID: ${data.result.id})`,
      );

      return {
        state: "paired",
        botInfo: data.result,
      };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unknown error";
      this.logger.error(`Telegram token validation error: ${message}`);

      if (message.includes("timeout") || message.includes("abort")) {
        return {
          state: "error",
          error: "Telegram API request timed out. Please check your network connection.",
        };
      }

      return {
        state: "error",
        error: `Failed to validate Telegram token: ${message}`,
      };
    }
  }

  // ========================================================================
  // Format Validation
  // ========================================================================

  /**
   * Validate the bot token format before making an API call.
   * Telegram bot tokens follow the format: <bot_id>:<hash>
   */
  private validateTokenFormat(token: string): string | null {
    if (!token || token.trim().length === 0) {
      return "Bot token is required";
    }

    const pattern = /^\d+:[A-Za-z0-9_-]+$/;
    if (!pattern.test(token.trim())) {
      return "Invalid Telegram bot token format. Expected format: <bot_id>:<hash> (e.g., 123456789:ABCdefGhIjKlMnOpQrStUvWxYz)";
    }

    return null;
  }
}
