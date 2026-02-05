/**
 * Overlays domain client.
 * Handles config overlays.
 */

import { BaseHttpClient } from '../base-client';
import type { Overlay } from '../types/overlays';

export class OverlaysClient extends BaseHttpClient {
  /**
   * List all overlays.
   */
  list(): Promise<Overlay[]> {
    return this.get('/overlays');
  }
}

export const overlaysClient = new OverlaysClient();
