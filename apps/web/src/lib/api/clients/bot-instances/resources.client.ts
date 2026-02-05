/**
 * Bot instances resources client.
 * Single responsibility: Resource allocation and usage tracking.
 */

import { BaseHttpClient } from '../../base-client';
import type {
  BotResourcesResponse,
  UpdateBotResourcesPayload,
  BotResourcesUpdateResult,
} from '../../types/bot-instances';
import type { TokenUsageSummary } from '../../types/evolution';

export class BotInstancesResourcesClient extends BaseHttpClient {
  /**
   * Get resource configuration for an instance.
   */
  getResources(instanceId: string): Promise<BotResourcesResponse> {
    return this.get(`/bot-instances/${instanceId}/resources`);
  }

  /**
   * Update resource configuration for an instance.
   */
  updateResources(instanceId: string, dto: UpdateBotResourcesPayload): Promise<BotResourcesUpdateResult> {
    return this.patch(`/bot-instances/${instanceId}/resources`, dto);
  }

  /**
   * Get token usage for an instance.
   */
  getTokenUsage(instanceId: string): Promise<TokenUsageSummary> {
    return this.get(`/bot-instances/${instanceId}/usage`);
  }
}

export const botInstancesResourcesClient = new BotInstancesResourcesClient();
