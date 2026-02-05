/**
 * Audit event types.
 */

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId: string;
  diffSummary?: string;
  timestamp: string;
  metadata: Record<string, unknown>;
  workspaceId: string;
  changeSetId?: string;
}

export interface AuditFilters {
  instanceId?: string;
  actor?: string;
  from?: string;
  to?: string;
}
