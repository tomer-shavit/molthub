/**
 * Policy packs domain client.
 * Handles policy pack listing.
 */

import { BaseHttpClient } from '../base-client';
import type { PolicyPack } from '../types/policies';

export class PoliciesClient extends BaseHttpClient {
  /**
   * List all policy packs.
   */
  list(): Promise<PolicyPack[]> {
    return this.get('/policy-packs');
  }
}

export const policiesClient = new PoliciesClient();
