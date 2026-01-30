import { Injectable, Logger } from "@nestjs/common";
import { ChannelAuthState } from "../channel-types";

// ---------------------------------------------------------------------------
// Discord Auth Service
//
// Discord uses bot token validation via the Discord API.
// We call GET /users/@me to validate the token, then GET /users/@me/guilds
// to fetch the guild list for configuration.
// ---------------------------------------------------------------------------

export interface DiscordBotInfo {
  id: string;
  username: string;
  discriminator: string;
  bot: boolean;
  avatar?: string;
}

export interface DiscordGuild {
  id: string;
  name: string;
  icon?: string;
  owner: boolean;
  permissions: string;
}

export interface DiscordAuthResult {
  state: ChannelAuthState;
  botInfo?: DiscordBotInfo;
  guilds?: DiscordGuild[];
  error?: string;
}

const DISCORD_API_BASE = "https://discord.com/api/v10";

@Injectable()
export class DiscordAuthService {
  private readonly logger = new Logger(DiscordAuthService.name);

  // ========================================================================
  // Validate Token + Fetch Guilds
  // ========================================================================

  /**
   * Validate a Discord bot token by calling the Discord API.
   * 1. GET /users/@me to verify the token and get bot info
   * 2. GET /users/@me/guilds to fetch the guild list
   */
  async validateToken(botToken: string): Promise<DiscordAuthResult> {
    this.logger.log("Validating Discord bot token via API");

    // Format validation first
    const formatError = this.validateTokenFormat(botToken);
    if (formatError) {
      return { state: "error", error: formatError };
    }

    try {
      // Step 1: Validate token via /users/@me
      const botInfo = await this.fetchCurrentUser(botToken);
      if (!botInfo) {
        return {
          state: "error",
          error: "Failed to fetch Discord bot user info. Token may be invalid.",
        };
      }

      if (!botInfo.bot) {
        return {
          state: "error",
          error: "The token does not belong to a bot account. Use a bot token, not a user token.",
        };
      }

      // Step 2: Fetch guild list
      const guilds = await this.fetchGuilds(botToken);

      this.logger.log(
        `Discord bot validated: ${botInfo.username}#${botInfo.discriminator} (ID: ${botInfo.id}), ${guilds.length} guild(s)`,
      );

      return {
        state: "paired",
        botInfo,
        guilds,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      this.logger.error(`Discord token validation error: ${message}`);

      return {
        state: "error",
        error: `Failed to validate Discord token: ${message}`,
      };
    }
  }

  // ========================================================================
  // Fetch Guild List (can be called separately for refresh)
  // ========================================================================

  async fetchGuildList(botToken: string): Promise<DiscordGuild[]> {
    return this.fetchGuilds(botToken);
  }

  // ========================================================================
  // Private: API Calls
  // ========================================================================

  private async fetchCurrentUser(botToken: string): Promise<DiscordBotInfo | null> {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Invalid Discord bot token (401 Unauthorized)");
      }
      throw new Error(`Discord API error: HTTP ${response.status}`);
    }

    return (await response.json()) as DiscordBotInfo;
  }

  private async fetchGuilds(botToken: string): Promise<DiscordGuild[]> {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      this.logger.warn(`Failed to fetch Discord guilds: HTTP ${response.status}`);
      return [];
    }

    return (await response.json()) as DiscordGuild[];
  }

  // ========================================================================
  // Format Validation
  // ========================================================================

  /**
   * Validate the Discord bot token format.
   * Discord tokens are base64-encoded with 3 dot-separated segments.
   */
  private validateTokenFormat(token: string): string | null {
    if (!token || token.trim().length === 0) {
      return "Bot token is required";
    }

    const parts = token.trim().split(".");
    if (parts.length !== 3) {
      return "Invalid Discord bot token format. Expected 3 dot-separated segments.";
    }

    return null;
  }
}
