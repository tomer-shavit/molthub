/**
 * Device pairings domain client.
 * Handles pairing approval, rejection, revocation, and sync.
 */

import { BaseHttpClient } from '../base-client';
import type {
  DevicePairing,
  ApproveAllResult,
} from '../types/pairings';

export class PairingsClient extends BaseHttpClient {
  /**
   * Get all pairings for an instance.
   */
  list(instanceId: string, state?: string): Promise<DevicePairing[]> {
    const params = state ? { state } : undefined;
    return this.get(`/bot-instances/${instanceId}/pairings`, params);
  }

  /**
   * Get pending pairings for an instance.
   */
  getPending(instanceId: string): Promise<DevicePairing[]> {
    return this.get(`/bot-instances/${instanceId}/pairings/pending`);
  }

  /**
   * Approve a pairing request.
   */
  approve(instanceId: string, channelType: string, senderId: string): Promise<DevicePairing> {
    return this.post(`/bot-instances/${instanceId}/pairings/approve`, {
      channelType,
      senderId,
    });
  }

  /**
   * Reject a pairing request.
   */
  reject(instanceId: string, channelType: string, senderId: string): Promise<DevicePairing> {
    return this.post(`/bot-instances/${instanceId}/pairings/reject`, {
      channelType,
      senderId,
    });
  }

  /**
   * Approve all pending pairings for an instance.
   */
  approveAll(instanceId: string): Promise<ApproveAllResult> {
    return this.post(`/bot-instances/${instanceId}/pairings/approve-all`);
  }

  /**
   * Revoke a pairing.
   */
  revoke(instanceId: string, channelType: string, senderId: string): Promise<DevicePairing> {
    return this.post(`/bot-instances/${instanceId}/pairings/revoke`, {
      channelType,
      senderId,
    });
  }

  /**
   * Sync pairings from the gateway.
   */
  sync(instanceId: string): Promise<DevicePairing[]> {
    return this.post(`/bot-instances/${instanceId}/pairings/sync`);
  }
}

export const pairingsClient = new PairingsClient();
