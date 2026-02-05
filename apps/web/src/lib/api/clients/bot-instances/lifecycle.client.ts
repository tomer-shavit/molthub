/**
 * Bot instances lifecycle client.
 * Single responsibility: Start, stop, reconcile operations.
 */

import { BaseHttpClient } from '../../base-client';
import type { ProvisioningStatus } from '../../types/bot-instances';

export class BotInstancesLifecycleClient extends BaseHttpClient {
  /**
   * Stop a bot instance.
   */
  stop(id: string): Promise<void> {
    return this.post(`/bot-instances/${id}/stop`);
  }

  /**
   * Start/resume a bot instance.
   */
  start(id: string): Promise<void> {
    return this.post(`/bot-instances/${id}/resume`);
  }

  /**
   * Trigger reconciliation for an instance.
   */
  reconcile(id: string): Promise<void> {
    return this.post(`/bot-instances/${id}/reconcile`);
  }

  /**
   * Get provisioning status for an instance.
   */
  getProvisioningStatus(instanceId: string): Promise<ProvisioningStatus> {
    return this.get(`/bot-instances/${instanceId}/provisioning/status`);
  }
}

export const botInstancesLifecycleClient = new BotInstancesLifecycleClient();
