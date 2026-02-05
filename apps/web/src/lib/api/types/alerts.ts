/**
 * Alert types.
 */

import type { PaginatedResponse } from './common';

export type HealthAlertSeverity = 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
export type HealthAlertStatus = 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'SUPPRESSED';

export interface HealthAlert {
  id: string;
  instanceId?: string;
  fleetId?: string;
  rule: string;
  severity: HealthAlertSeverity;
  status: HealthAlertStatus;
  title: string;
  message: string;
  detail?: string;
  remediationAction?: string;
  remediationNote?: string;
  firstTriggeredAt: string;
  lastTriggeredAt: string;
  resolvedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  consecutiveHits: number;
  createdAt: string;
  updatedAt: string;
  instance?: { id: string; name: string; fleetId: string };
  fleet?: { id: string; name: string };
}

export interface AlertSummary {
  bySeverity: Record<string, number>;
  byStatus: Record<string, number>;
  total: number;
}

export type PaginatedAlerts = PaginatedResponse<HealthAlert>;

export interface RemediationResult {
  success: boolean;
  action: string;
  message: string;
  detail?: string;
}

export interface AlertFilters {
  instanceId?: string;
  fleetId?: string;
  severity?: HealthAlertSeverity;
  status?: HealthAlertStatus;
  rule?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export interface BulkAlertResult {
  updated: number;
}
