/**
 * Change set types.
 */

import type { BotInstance } from './bot-instances';
import type { AuditEvent } from './audit';

export type ChangeSetStatusValue = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'ROLLED_BACK';
export type RolloutStrategy = 'ALL' | 'PERCENTAGE' | 'CANARY';

export interface ChangeSet {
  id: string;
  botInstanceId: string;
  botInstance?: BotInstance;
  changeType: string;
  description: string;
  fromManifest?: Record<string, unknown>;
  toManifest: Record<string, unknown>;
  rolloutStrategy: RolloutStrategy;
  rolloutPercentage?: number;
  canaryInstances?: string[];
  status: ChangeSetStatusValue;
  totalInstances: number;
  updatedInstances: number;
  failedInstances: number;
  startedAt?: string;
  completedAt?: string;
  canRollback: boolean;
  rolledBackAt?: string;
  rolledBackBy?: string;
  createdAt: string;
  createdBy: string;
  auditEvents?: AuditEvent[];
}

/**
 * Response from the change set status endpoint.
 * @deprecated Use ChangeSetStatusInfo for new code.
 */
export interface ChangeSetStatus {
  changeSetId: string;
  status: string;
  progress: {
    total: number;
    updated: number;
    failed: number;
    remaining: number;
    percentage: number;
  };
  canRollback: boolean;
}

/**
 * Response from the change set status endpoint.
 */
export type ChangeSetStatusInfo = ChangeSetStatus;

export interface CreateChangeSetPayload {
  botInstanceId: string;
  changeType: string;
  description: string;
  fromManifest?: Record<string, unknown>;
  toManifest: Record<string, unknown>;
  rolloutStrategy?: string;
  rolloutPercentage?: number;
}

export interface ChangeSetFilters {
  botInstanceId?: string;
  status?: string;
}
