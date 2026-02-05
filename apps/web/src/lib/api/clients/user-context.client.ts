/**
 * User context domain client.
 * Handles user context retrieval.
 */

import { BaseHttpClient } from '../base-client';
import type { UserContextResponse } from '../types/user-context';

export class UserContextClient extends BaseHttpClient {
  /**
   * Get user context (agent count, stage, etc.).
   */
  getContext(): Promise<UserContextResponse> {
    return this.get('/user-context');
  }
}

export const userContextClient = new UserContextClient();
