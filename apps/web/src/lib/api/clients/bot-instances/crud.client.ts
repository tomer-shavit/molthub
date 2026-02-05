/**
 * Bot instances CRUD client.
 * Single responsibility: Create, Read, Update, Delete operations.
 */

import { BaseHttpClient } from '../../base-client';
import type {
  BotInstance,
  ListBotInstancesParams,
  BulkActionPayload,
  BulkActionResult,
  DeploymentEvent,
} from '../../types/bot-instances';

export class BotInstancesCrudClient extends BaseHttpClient {
  /**
   * List all bot instances with optional filters.
   */
  list(params?: ListBotInstancesParams): Promise<BotInstance[]> {
    return this.get('/bot-instances', params);
  }

  /**
   * Get a single bot instance by ID.
   */
  getById(id: string): Promise<BotInstance> {
    return this.get(`/bot-instances/${id}`);
  }

  /**
   * Delete a bot instance.
   */
  deleteById(id: string): Promise<void> {
    return this.delete(`/bot-instances/${id}`);
  }

  /**
   * Compare multiple bot instances.
   */
  compare(ids: string[]): Promise<BotInstance[]> {
    return this.post('/bot-instances/compare', { instanceIds: ids });
  }

  /**
   * Bulk action on multiple bot instances.
   */
  bulkAction(data: BulkActionPayload): Promise<BulkActionResult[]> {
    return this.post('/bot-instances/bulk-action', data);
  }

  /**
   * Get deployment events for an instance.
   */
  getDeploymentEvents(instanceId: string): Promise<DeploymentEvent[]> {
    return this.get(`/bot-instances/${instanceId}/events`);
  }
}

export const botInstancesCrudClient = new BotInstancesCrudClient();
