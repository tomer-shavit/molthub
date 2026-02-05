/**
 * Connectors domain client.
 * Handles connector listing.
 */

import { BaseHttpClient } from '../base-client';
import type { Connector } from '../types/connectors';

export class ConnectorsClient extends BaseHttpClient {
  /**
   * List all connectors.
   */
  list(): Promise<Connector[]> {
    return this.get('/connectors');
  }
}

export const connectorsClient = new ConnectorsClient();
