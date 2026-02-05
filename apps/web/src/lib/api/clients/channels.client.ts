/**
 * Channels domain client.
 * Handles channel CRUD, types, and bindings.
 */

import { BaseHttpClient } from '../base-client';
import type {
  Channel,
  ChannelTypeInfo,
  CreateChannelPayload,
  ChannelBotBinding,
} from '../types/channels';

export class ChannelsClient extends BaseHttpClient {
  /**
   * List all channels for a workspace.
   */
  list(workspaceId: string): Promise<Channel[]> {
    return this.get('/channels', { workspaceId });
  }

  /**
   * Get available channel types.
   */
  getTypes(): Promise<ChannelTypeInfo[]> {
    return this.get('/channels/types');
  }

  /**
   * Create a new channel.
   */
  create(data: CreateChannelPayload): Promise<Channel> {
    return this.post('/channels', data);
  }

  /**
   * Delete a channel.
   */
  deleteById(id: string): Promise<void> {
    return this.delete(`/channels/${id}`);
  }

  /**
   * Bind a channel to a bot.
   */
  bind(channelId: string, botId: string, purpose: string): Promise<ChannelBotBinding> {
    return this.post(`/channels/${channelId}/bind`, { botId, purpose });
  }

  /**
   * Unbind a channel from a bot.
   */
  unbind(channelId: string, bindingId: string): Promise<void> {
    return this.delete(`/channels/${channelId}/bind/${bindingId}`);
  }
}

export const channelsClient = new ChannelsClient();
