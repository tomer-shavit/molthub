import { Injectable, Logger } from "@nestjs/common";

export interface TokenValidationResult {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

@Injectable()
export class ChannelTokenValidatorService {
  private readonly logger = new Logger(ChannelTokenValidatorService.name);

  /**
   * Validate a channel token has the expected format and minimal scope.
   */
  validateToken(channelType: string, token: string): TokenValidationResult {
    switch (channelType) {
      case "slack":
        return this.validateSlackToken(token);
      case "discord":
        return this.validateDiscordToken(token);
      case "telegram":
        return this.validateTelegramToken(token);
      default:
        return { valid: true, warnings: [], errors: [] };
    }
  }

  private validateSlackToken(token: string): TokenValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    if (token.startsWith("xoxp-")) {
      errors.push(
        "User token (xoxp-) detected. Use a bot token (xoxb-) instead to limit scope. " +
        "User tokens have full access to the workspace."
      );
    } else if (!token.startsWith("xoxb-") && !token.startsWith("xapp-")) {
      warnings.push("Unexpected Slack token prefix. Expected xoxb- (bot) or xapp- (app-level).");
    }

    return { valid: errors.length === 0, warnings, errors };
  }

  private validateDiscordToken(token: string): TokenValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Discord bot tokens are base64-encoded and have a specific structure
    const parts = token.split(".");
    if (parts.length !== 3) {
      warnings.push("Discord token does not match expected format (3 dot-separated segments).");
    }

    return { valid: errors.length === 0, warnings, errors };
  }

  private validateTelegramToken(token: string): TokenValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];

    // Telegram bot tokens follow the format: <bot_id>:<hash>
    const telegramPattern = /^\d+:[A-Za-z0-9_-]+$/;
    if (!telegramPattern.test(token)) {
      errors.push("Telegram token does not match expected format (<bot_id>:<hash>).");
    }

    return { valid: errors.length === 0, warnings, errors };
  }
}
