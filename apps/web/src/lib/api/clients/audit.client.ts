/**
 * Audit domain client.
 * Handles audit event listing.
 */

import { BaseHttpClient } from '../base-client';
import type { AuditEvent, AuditFilters } from '../types/audit';

export class AuditClient extends BaseHttpClient {
  /**
   * List audit events with optional filters.
   */
  list(filters?: AuditFilters): Promise<AuditEvent[]> {
    return this.get('/audit', filters);
  }
}

export const auditClient = new AuditClient();
