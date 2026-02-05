/**
 * Change sets domain client.
 * Handles change set CRUD, status, and rollback.
 */

import { BaseHttpClient } from '../base-client';
import type {
  ChangeSet,
  ChangeSetStatus,
  CreateChangeSetPayload,
  ChangeSetFilters,
} from '../types/change-sets';

export class ChangeSetsClient extends BaseHttpClient {
  /**
   * List all change sets with optional filters.
   */
  list(filters?: ChangeSetFilters): Promise<ChangeSet[]> {
    return this.get('/change-sets', filters);
  }

  /**
   * Get a single change set by ID.
   */
  getById(id: string): Promise<ChangeSet> {
    return this.get(`/change-sets/${id}`);
  }

  /**
   * Get status for a change set.
   */
  getStatus(id: string): Promise<ChangeSetStatus> {
    return this.get(`/change-sets/${id}/status`);
  }

  /**
   * Create a new change set.
   */
  create(data: CreateChangeSetPayload): Promise<ChangeSet> {
    return this.post('/change-sets', data);
  }

  /**
   * Start rollout for a change set.
   */
  startRollout(id: string): Promise<ChangeSet> {
    return this.post(`/change-sets/${id}/start`);
  }

  /**
   * Rollback a change set.
   */
  rollback(id: string, reason: string): Promise<ChangeSet> {
    return this.post(`/change-sets/${id}/rollback`, { reason });
  }
}

export const changeSetsClient = new ChangeSetsClient();
