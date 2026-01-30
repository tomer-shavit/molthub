import { Injectable } from "@nestjs/common";
import {
  MoltbotChannelType,
  MOLTBOT_CHANNEL_TYPES,
  DEFAULT_COMMON_CONFIG,
  SECRET_FIELDS,
  CHANNEL_TYPE_META,
  CommonChannelConfig,
} from "./channel-types";

// ============================================
// Channel Data shape (from DB config JSON)
// ============================================

export interface ChannelData {
  id: string;
  name: string;
  moltbotType: MoltbotChannelType;
  enabled: boolean;
  policies: Partial<CommonChannelConfig>;
  typeConfig: Record<string, unknown>;
  secrets: Record<string, string>;
}

// ============================================
// Config Generator
// ============================================

@Injectable()
export class ChannelConfigGenerator {
  /**
   * Generate a complete Moltbot channel config block from stored channel data.
   *
   * Secrets are referenced as `${VAR_NAME}` environment variable substitutions
   * and are never embedded directly in the output.
   *
   * @returns Object keyed by channel type with Moltbot-compatible config sections
   */
  generateChannelConfig(channels: ChannelData[]): Record<string, unknown> {
    const config: Record<string, unknown> = {};

    for (const channel of channels) {
      if (!(MOLTBOT_CHANNEL_TYPES as readonly string[]).includes(channel.moltbotType)) {
        continue;
      }

      const section = this.buildChannelSection(channel);
      config[channel.moltbotType] = section;
    }

    return config;
  }

  /**
   * Build a single channel's config section.
   */
  private buildChannelSection(channel: ChannelData): Record<string, unknown> {
    const section: Record<string, unknown> = {};

    // Common fields
    section.enabled = channel.enabled;
    section.dmPolicy = channel.policies.dmPolicy ?? DEFAULT_COMMON_CONFIG.dmPolicy;
    section.groupPolicy = channel.policies.groupPolicy ?? DEFAULT_COMMON_CONFIG.groupPolicy;

    if (channel.policies.allowFrom && channel.policies.allowFrom.length > 0) {
      section.allowFrom = channel.policies.allowFrom;
    }
    if (channel.policies.groupAllowFrom && channel.policies.groupAllowFrom.length > 0) {
      section.groupAllowFrom = channel.policies.groupAllowFrom;
    }
    if (channel.policies.historyLimit !== undefined) {
      section.historyLimit = channel.policies.historyLimit;
    }
    if (channel.policies.mediaMaxMb !== undefined) {
      section.mediaMaxMb = channel.policies.mediaMaxMb;
    }

    // Type-specific config
    const typeSpecific = this.buildTypeSpecificConfig(channel);
    Object.assign(section, typeSpecific);

    // Secrets as env var references
    const secretRefs = this.buildSecretReferences(channel);
    Object.assign(section, secretRefs);

    return section;
  }

  /**
   * Build type-specific config fields (non-secret, non-common).
   */
  private buildTypeSpecificConfig(channel: ChannelData): Record<string, unknown> {
    const config: Record<string, unknown> = {};
    const tc = channel.typeConfig || {};

    switch (channel.moltbotType) {
      case 'whatsapp':
        config.sendReadReceipts = tc.sendReadReceipts ?? true;
        if (tc.chunkMode) {
          config.chunkMode = tc.chunkMode;
        }
        break;

      case 'telegram':
        config.linkPreview = tc.linkPreview ?? true;
        if (tc.streamMode && tc.streamMode !== 'off') {
          config.streamMode = tc.streamMode;
        }
        if (tc.customCommands && Object.keys(tc.customCommands).length > 0) {
          config.customCommands = tc.customCommands;
        }
        break;

      case 'discord':
        config.allowBots = tc.allowBots ?? false;
        if (tc.guilds && Object.keys(tc.guilds).length > 0) {
          config.guilds = tc.guilds;
        }
        if (tc.replyToMode && tc.replyToMode !== 'off') {
          config.replyToMode = tc.replyToMode;
        }
        break;

      case 'slack':
        if (tc.slashCommand) {
          config.slashCommand = tc.slashCommand;
        }
        if (tc.thread) {
          config.thread = tc.thread;
        }
        break;

      case 'signal':
        if (tc.adapterConfig && Object.keys(tc.adapterConfig).length > 0) {
          config.adapterConfig = tc.adapterConfig;
        }
        break;

      case 'imessage':
        if (tc.adapterConfig && Object.keys(tc.adapterConfig).length > 0) {
          config.adapterConfig = tc.adapterConfig;
        }
        break;

      case 'mattermost':
        if (tc.serverUrl) {
          config.serverUrl = tc.serverUrl;
        }
        break;

      case 'google-chat':
        // Service account handled via secrets
        break;

      case 'ms-teams':
        if (tc.tenantId) {
          config.tenantId = tc.tenantId;
        }
        break;

      case 'line':
        // Tokens handled via secrets
        break;

      case 'matrix':
        if (tc.homeserverUrl) {
          config.homeserverUrl = tc.homeserverUrl;
        }
        break;
    }

    return config;
  }

  /**
   * Build secret field references as `${ENV_VAR}` substitutions.
   *
   * Secrets are NEVER embedded directly in the config output.
   * Instead, each secret is referenced as an env var name.
   */
  private buildSecretReferences(channel: ChannelData): Record<string, string> {
    const refs: Record<string, string> = {};
    const secretFieldNames = SECRET_FIELDS[channel.moltbotType] || [];

    for (const field of secretFieldNames) {
      if (channel.secrets[field]) {
        // Convert secret field name to env var format:
        // e.g., "botToken" for telegram -> "${TELEGRAM_BOT_TOKEN}"
        const envVarName = this.toEnvVarName(channel.moltbotType, field);
        refs[field] = `\${${envVarName}}`;
      }
    }

    return refs;
  }

  /**
   * Convert a channel type + secret field name to an environment variable name.
   *
   * Examples:
   *   ('telegram', 'botToken')   -> 'TELEGRAM_BOT_TOKEN'
   *   ('discord', 'token')       -> 'DISCORD_TOKEN'
   *   ('slack', 'appToken')      -> 'SLACK_APP_TOKEN'
   *   ('google-chat', 'serviceAccountJson') -> 'GOOGLE_CHAT_SERVICE_ACCOUNT_JSON'
   */
  toEnvVarName(channelType: MoltbotChannelType, fieldName: string): string {
    // Convert channel type: 'google-chat' -> 'GOOGLE_CHAT'
    const typePrefix = channelType.toUpperCase().replace(/-/g, '_');

    // Convert camelCase field to SCREAMING_SNAKE_CASE:
    // 'botToken' -> 'BOT_TOKEN', 'serviceAccountJson' -> 'SERVICE_ACCOUNT_JSON'
    const fieldSuffix = fieldName
      .replace(/([A-Z])/g, '_$1')
      .toUpperCase();

    return `${typePrefix}_${fieldSuffix}`;
  }

  /**
   * Extract actual secret values for secure storage.
   * Returns a map of env var name -> secret value.
   */
  extractSecrets(channel: ChannelData): Record<string, string> {
    const result: Record<string, string> = {};
    const secretFieldNames = SECRET_FIELDS[channel.moltbotType] || [];

    for (const field of secretFieldNames) {
      if (channel.secrets[field]) {
        const envVarName = this.toEnvVarName(channel.moltbotType, field);
        result[envVarName] = channel.secrets[field];
      }
    }

    return result;
  }
}
