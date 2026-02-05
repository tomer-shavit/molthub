/**
 * Bot instances channel auth client.
 * Single responsibility: Channel authentication and chat.
 */

import { BaseHttpClient } from '../../base-client';
import type { ChannelAuthStatus } from '../../types/channels';
import type { ChatWithBotResult } from '../../types/chat';

export class BotInstancesChannelAuthClient extends BaseHttpClient {
  /**
   * Start channel authentication for an instance.
   */
  startChannelAuth(id: string, channelId: string): Promise<ChannelAuthStatus> {
    return this.post(`/bot-instances/${id}/channels/${channelId}/auth`);
  }

  /**
   * Get channel authentication status.
   */
  getChannelAuthStatus(id: string, channelId: string): Promise<ChannelAuthStatus> {
    return this.get(`/bot-instances/${id}/channels/${channelId}/auth`);
  }

  /**
   * Chat with a bot instance.
   */
  chat(instanceId: string, message: string, sessionId?: string): Promise<ChatWithBotResult> {
    return this.post(`/bot-instances/${instanceId}/chat`, { message, sessionId });
  }
}

export const botInstancesChannelAuthClient = new BotInstancesChannelAuthClient();
