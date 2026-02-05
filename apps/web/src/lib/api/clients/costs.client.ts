/**
 * Costs domain client.
 * Handles cost events and summaries.
 */

import { BaseHttpClient } from '../base-client';
import type {
  CostEvent,
  CostSummary,
  PaginatedCostEvents,
  CreateCostEventPayload,
  CostFilters,
} from '../types/costs';

export class CostsClient extends BaseHttpClient {
  /**
   * List cost events with optional filters.
   */
  list(filters?: CostFilters): Promise<PaginatedCostEvents> {
    return this.get('/costs/events', filters);
  }

  /**
   * Record a new cost event.
   */
  record(data: CreateCostEventPayload): Promise<CostEvent> {
    return this.post('/costs/events', data);
  }

  /**
   * Get cost summary with optional filters.
   */
  getSummary(filters?: Pick<CostFilters, 'instanceId' | 'from' | 'to'>): Promise<CostSummary> {
    return this.get('/costs/summary', filters);
  }

  /**
   * Get costs for a specific instance.
   */
  getInstanceCosts(instanceId: string): Promise<CostSummary> {
    return this.get(`/costs/instance/${instanceId}`);
  }
}

export const costsClient = new CostsClient();
