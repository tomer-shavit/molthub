/**
 * Credential vault domain client.
 * Handles saved credentials.
 */

import { BaseHttpClient } from '../base-client';
import type {
  SavedCredential,
  SaveCredentialPayload,
  SaveCredentialResult,
} from '../types/credentials';

export class CredentialsClient extends BaseHttpClient {
  /**
   * Save a new credential.
   */
  save(data: SaveCredentialPayload): Promise<SaveCredentialResult> {
    return this.post('/credential-vault', data);
  }

  /**
   * List saved credentials.
   */
  list(type?: string): Promise<SavedCredential[]> {
    return this.get('/credential-vault', type ? { type } : undefined);
  }

  /**
   * Delete a saved credential.
   */
  deleteById(id: string): Promise<void> {
    return this.delete(`/credential-vault/${id}`);
  }
}

export const credentialsClient = new CredentialsClient();
