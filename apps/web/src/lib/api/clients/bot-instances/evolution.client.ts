/**
 * Bot instances evolution client.
 * Single responsibility: Agent evolution tracking and sync.
 */

import { BaseHttpClient } from '../../base-client';
import type {
  AgentLiveState,
  AgentEvolutionSnapshot,
} from '../../types/evolution';

export class BotInstancesEvolutionClient extends BaseHttpClient {
  /**
   * Get live state for an instance (evolution).
   */
  getLiveState(instanceId: string): Promise<AgentLiveState> {
    return this.get(`/bot-instances/${instanceId}/live-state`);
  }

  /**
   * Get evolution snapshot for an instance.
   */
  getEvolution(instanceId: string): Promise<AgentEvolutionSnapshot> {
    return this.get(`/bot-instances/${instanceId}/evolution`);
  }

  /**
   * Get evolution history for an instance.
   */
  getEvolutionHistory(instanceId: string, limit = 50): Promise<{ snapshots: AgentEvolutionSnapshot[] }> {
    return this.get(`/bot-instances/${instanceId}/evolution/history`, { limit });
  }

  /**
   * Sync evolution for an instance.
   */
  syncEvolution(instanceId: string): Promise<AgentEvolutionSnapshot> {
    return this.post(`/bot-instances/${instanceId}/evolution/sync`);
  }
}

export const botInstancesEvolutionClient = new BotInstancesEvolutionClient();
