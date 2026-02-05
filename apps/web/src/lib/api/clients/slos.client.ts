/**
 * SLOs domain client.
 * Handles SLO CRUD and summary.
 */

import { BaseHttpClient } from '../base-client';
import type {
  SloDefinition,
  SloSummary,
  CreateSloPayload,
  UpdateSloPayload,
  SloFilters,
} from '../types/slos';

export class SlosClient extends BaseHttpClient {
  /**
   * List all SLOs with optional filters.
   */
  list(filters?: SloFilters): Promise<SloDefinition[]> {
    return this.get('/slos', filters);
  }

  /**
   * Get a single SLO by ID.
   */
  getById(id: string): Promise<SloDefinition> {
    return this.get(`/slos/${id}`);
  }

  /**
   * Create a new SLO.
   */
  create(data: CreateSloPayload): Promise<SloDefinition> {
    return this.post('/slos', data);
  }

  /**
   * Update an SLO.
   */
  update(id: string, data: UpdateSloPayload): Promise<SloDefinition> {
    return this.patch(`/slos/${id}`, data);
  }

  /**
   * Delete an SLO.
   */
  deleteById(id: string): Promise<void> {
    return this.delete(`/slos/${id}`);
  }

  /**
   * Get SLO summary statistics.
   */
  getSummary(): Promise<SloSummary> {
    return this.get('/slos/summary');
  }
}

export const slosClient = new SlosClient();
