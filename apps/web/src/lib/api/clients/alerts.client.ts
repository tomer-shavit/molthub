/**
 * Alerts domain client.
 * Handles health alerts, acknowledgment, resolution, and bulk operations.
 */

import { BaseHttpClient } from '../base-client';
import type {
  HealthAlert,
  AlertSummary,
  PaginatedAlerts,
  RemediationResult,
  AlertFilters,
  BulkAlertResult,
} from '../types/alerts';

export class AlertsClient extends BaseHttpClient {
  /**
   * List alerts with optional filters.
   */
  list(filters?: AlertFilters): Promise<PaginatedAlerts> {
    return this.get('/alerts', filters);
  }

  /**
   * Get a single alert by ID.
   */
  getById(alertId: string): Promise<HealthAlert> {
    return this.get(`/alerts/${alertId}`);
  }

  /**
   * Get alert summary statistics.
   */
  getSummary(): Promise<AlertSummary> {
    return this.get('/alerts/summary');
  }

  /**
   * Get count of active alerts.
   */
  getActiveCount(): Promise<{ count: number }> {
    return this.get('/alerts/active-count');
  }

  /**
   * Acknowledge an alert.
   */
  acknowledge(alertId: string, acknowledgedBy?: string): Promise<HealthAlert> {
    return this.post(`/alerts/${alertId}/acknowledge`, { acknowledgedBy });
  }

  /**
   * Resolve an alert.
   */
  resolve(alertId: string): Promise<HealthAlert> {
    return this.post(`/alerts/${alertId}/resolve`);
  }

  /**
   * Suppress an alert.
   */
  suppress(alertId: string): Promise<HealthAlert> {
    return this.post(`/alerts/${alertId}/suppress`);
  }

  /**
   * Trigger remediation for an alert.
   */
  remediate(alertId: string): Promise<RemediationResult> {
    return this.post(`/alerts/${alertId}/remediate`);
  }

  /**
   * Bulk acknowledge multiple alerts.
   */
  bulkAcknowledge(ids: string[], acknowledgedBy?: string): Promise<BulkAlertResult> {
    return this.post('/alerts/bulk-acknowledge', { ids, acknowledgedBy });
  }

  /**
   * Bulk resolve multiple alerts.
   */
  bulkResolve(ids: string[]): Promise<BulkAlertResult> {
    return this.post('/alerts/bulk-resolve', { ids });
  }
}

export const alertsClient = new AlertsClient();
