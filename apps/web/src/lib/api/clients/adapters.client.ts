/**
 * Adapters domain client.
 * Handles deployment adapter metadata.
 */

import { BaseHttpClient } from '../base-client';
import type { AdapterMetadata } from '../types/adapters';

export class AdaptersClient extends BaseHttpClient {
  /**
   * List all available adapters.
   */
  list(): Promise<AdapterMetadata[]> {
    return this.get('/adapters');
  }
}

export const adaptersClient = new AdaptersClient();
