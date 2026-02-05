/**
 * Credential vault types.
 */

export type CredentialType = 'aws-account' | 'api-key';

export interface SavedCredential {
  id: string;
  name: string;
  type: string;
  maskedConfig: Record<string, string>;
  createdAt: string;
}

export interface SaveCredentialPayload {
  name: string;
  type: CredentialType;
  credentials: Record<string, unknown>;
}

export interface SaveCredentialResult {
  id: string;
  name: string;
  type: string;
  maskedConfig: Record<string, string>;
  createdAt: string;
}
