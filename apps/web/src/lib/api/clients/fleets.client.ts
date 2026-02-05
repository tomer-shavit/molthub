/**
 * Fleets domain client.
 * Handles fleet CRUD, health, promotion, and reconciliation.
 */

import { BaseHttpClient } from '../base-client';
import type {
  Fleet,
  FleetHealth,
  CreateFleetPayload,
  PromoteFleetResult,
} from '../types/fleets';

export class FleetsClient extends BaseHttpClient {
  /**
   * List all fleets.
   */
  list(): Promise<Fleet[]> {
    return this.get('/fleets');
  }

  /**
   * Get a single fleet by ID.
   */
  getById(id: string): Promise<Fleet> {
    return this.get(`/fleets/${id}`);
  }

  /**
   * Get health status for a fleet.
   */
  getHealth(id: string): Promise<FleetHealth> {
    return this.get(`/fleets/${id}/health`);
  }

  /**
   * Create a new fleet.
   */
  create(data: CreateFleetPayload): Promise<Fleet> {
    return this.post('/fleets', data);
  }

  /**
   * Promote a fleet to a target environment.
   */
  promote(id: string, targetEnvironment: string): Promise<PromoteFleetResult> {
    return this.post(`/fleets/${id}/promote`, { targetEnvironment });
  }

  /**
   * Reconcile all instances in a fleet.
   */
  reconcileAll(id: string): Promise<{ queued: number; skipped: number }> {
    return this.post(`/fleets/${id}/reconcile-all`);
  }
}

export const fleetsClient = new FleetsClient();
