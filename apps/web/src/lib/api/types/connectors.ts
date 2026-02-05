/**
 * Connector types.
 */

export interface Connector {
  id: string;
  name: string;
  description: string;
  workspaceId: string;
  type: string;
  config: Record<string, unknown>;
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'PENDING';
  statusMessage?: string;
  lastTestedAt?: string;
  lastTestResult?: string;
  lastError?: string;
  isShared: boolean;
  allowedInstanceIds?: string[];
  rotationSchedule?: Record<string, unknown>;
  usageCount: number;
  lastUsedAt?: string;
  tags: Record<string, string>;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}
