import { Injectable, Logger } from "@nestjs/common";
import { ChannelAuthState } from "../channel-types";

// ---------------------------------------------------------------------------
// Slack Auth Service
//
// Slack uses Socket Mode which requires both a bot token (xoxb-) and an
// app-level token (xapp-). We validate both:
// 1. Bot token: via `auth.test` Slack API
// 2. App token: via `apps.connections.open` (Socket Mode handshake)
// ---------------------------------------------------------------------------

export interface SlackBotInfo {
  botId: string;
  teamId: string;
  teamName: string;
  botUserId: string;
  url: string;
}

export interface SlackAuthResult {
  state: ChannelAuthState;
  botInfo?: SlackBotInfo;
  socketModeValid?: boolean;
  error?: string;
}

const SLACK_API_BASE = "https://slack.com/api";

@Injectable()
export class SlackAuthService {
  private readonly logger = new Logger(SlackAuthService.name);

  // ========================================================================
  // Validate Both Tokens
  // ========================================================================

  /**
   * Validate Slack bot token and app token.
   * 1. Validate bot token via `auth.test`
   * 2. Validate app token via `apps.connections.open` (Socket Mode)
   */
  async validateTokens(
    botToken: string,
    appToken: string,
  ): Promise<SlackAuthResult> {
    this.logger.log("Validating Slack tokens");

    // Format validation
    const botFormatError = this.validateBotTokenFormat(botToken);
    if (botFormatError) {
      return { state: "error", error: botFormatError };
    }

    const appFormatError = this.validateAppTokenFormat(appToken);
    if (appFormatError) {
      return { state: "error", error: appFormatError };
    }

    try {
      // Step 1: Validate bot token via auth.test
      const botInfo = await this.validateBotToken(botToken);
      if (!botInfo) {
        return {
          state: "error",
          error: "Invalid Slack bot token. The `auth.test` API call failed.",
        };
      }

      // Step 2: Validate app token via apps.connections.open (Socket Mode)
      const socketModeValid = await this.validateSocketMode(appToken);

      if (!socketModeValid) {
        return {
          state: "error",
          botInfo,
          socketModeValid: false,
          error:
            "Slack app token is invalid or Socket Mode is not enabled. " +
            "Ensure the app-level token (xapp-) is correct and Socket Mode is turned on in your Slack app settings.",
        };
      }

      this.logger.log(
        `Slack bot validated: team=${botInfo.teamName} (${botInfo.teamId}), botUser=${botInfo.botUserId}`,
      );

      return {
        state: "paired",
        botInfo,
        socketModeValid: true,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error(`Slack token validation error: ${message}`);

      return {
        state: "error",
        error: `Failed to validate Slack tokens: ${message}`,
      };
    }
  }

  // ========================================================================
  // Validate Bot Token Only
  // ========================================================================

  async validateBotTokenOnly(botToken: string): Promise<SlackAuthResult> {
    const formatError = this.validateBotTokenFormat(botToken);
    if (formatError) {
      return { state: "error", error: formatError };
    }

    const botInfo = await this.validateBotToken(botToken);
    if (!botInfo) {
      return { state: "error", error: "Invalid Slack bot token" };
    }

    return { state: "pending", botInfo };
  }

  // ========================================================================
  // Private: API Calls
  // ========================================================================

  /**
   * Validate the bot token by calling `auth.test`.
   */
  private async validateBotToken(
    botToken: string,
  ): Promise<SlackBotInfo | null> {
    const response = await fetch(`${SLACK_API_BASE}/auth.test`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${botToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Slack API HTTP error: ${response.status}`);
    }

    const data = (await response.json()) as {
      ok: boolean;
      error?: string;
      bot_id?: string;
      team_id?: string;
      team?: string;
      user_id?: string;
      url?: string;
    };

    if (!data.ok) {
      this.logger.warn(`Slack auth.test failed: ${data.error}`);
      return null;
    }

    return {
      botId: data.bot_id || "",
      teamId: data.team_id || "",
      teamName: data.team || "",
      botUserId: data.user_id || "",
      url: data.url || "",
    };
  }

  /**
   * Validate the app-level token by calling `apps.connections.open`.
   * This initiates a Socket Mode connection handshake.
   * We only check if the API responds with ok=true (we don't keep the WebSocket open).
   */
  private async validateSocketMode(appToken: string): Promise<boolean> {
    try {
      const response = await fetch(
        `${SLACK_API_BASE}/apps.connections.open`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${appToken}`,
            "Content-Type": "application/json",
          },
          signal: AbortSignal.timeout(10_000),
        },
      );

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as {
        ok: boolean;
        url?: string;
        error?: string;
      };

      if (!data.ok) {
        this.logger.warn(`Slack apps.connections.open failed: ${data.error}`);
        return false;
      }

      // We got a valid WebSocket URL — Socket Mode is working.
      // We don't connect to it; we just confirm the token is valid.
      return true;
    } catch (err) {
      this.logger.warn(
        `Socket Mode validation error: ${err instanceof Error ? err.message : "unknown"}`,
      );
      return false;
    }
  }

  // ========================================================================
  // Format Validation
  // ========================================================================

  private validateBotTokenFormat(token: string): string | null {
    if (!token || token.trim().length === 0) {
      return "Slack bot token (xoxb-) is required";
    }

    if (token.startsWith("xoxp-")) {
      return "User token (xoxp-) detected. Use a bot token (xoxb-) instead.";
    }

    if (!token.startsWith("xoxb-")) {
      return "Invalid Slack bot token format. Expected prefix: xoxb-";
    }

    return null;
  }

  private validateAppTokenFormat(token: string): string | null {
    if (!token || token.trim().length === 0) {
      return "Slack app-level token (xapp-) is required for Socket Mode";
    }

    if (!token.startsWith("xapp-")) {
      return "Invalid Slack app-level token format. Expected prefix: xapp-";
    }

    return null;
  }
}
