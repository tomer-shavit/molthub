/**
 * Dashboard domain client.
 * Handles dashboard metrics, health, and activity.
 */

import { BaseHttpClient } from '../base-client';
import type {
  DashboardMetrics,
  DashboardHealth,
  DashboardActivity,
} from '../types/dashboard';

export class DashboardClient extends BaseHttpClient {
  /**
   * Get dashboard metrics.
   */
  getMetrics(): Promise<DashboardMetrics> {
    return this.get('/dashboard/metrics');
  }

  /**
   * Get dashboard health status.
   */
  getHealth(): Promise<DashboardHealth> {
    return this.get('/dashboard/health');
  }

  /**
   * Get dashboard activity.
   */
  getActivity(): Promise<DashboardActivity> {
    return this.get('/dashboard/activity');
  }
}

export const dashboardClient = new DashboardClient();
