/**
 * Bot instances config client.
 * Single responsibility: Configuration management.
 */

import { BaseHttpClient } from '../../base-client';
import type { BotInstance, AiGatewaySettings } from '../../types/bot-instances';

export class BotInstancesConfigClient extends BaseHttpClient {
  /**
   * Get current config for an instance.
   */
  getConfig(id: string): Promise<{ config: Record<string, unknown>; hash: string }> {
    return this.get(`/bot-instances/${id}/config`);
  }

  /**
   * Apply raw config to an instance.
   */
  applyConfig(id: string, config: string): Promise<void> {
    return this.put(`/bot-instances/${id}/config`, { raw: config });
  }

  /**
   * Patch config on an instance.
   */
  patchConfig(id: string, patch: Record<string, unknown>): Promise<BotInstance> {
    return this.patch(`/bot-instances/${id}/config`, { patch });
  }

  /**
   * Update AI Gateway settings for an instance.
   */
  updateAiGatewaySettings(instanceId: string, settings: AiGatewaySettings): Promise<BotInstance> {
    return this.patch(`/bot-instances/${instanceId}/ai-gateway`, settings);
  }
}

export const botInstancesConfigClient = new BotInstancesConfigClient();
