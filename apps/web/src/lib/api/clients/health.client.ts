/**
 * Health domain client.
 * Handles health checks and metrics.
 */

import { BaseHttpClient, ApiError } from '../base-client';
import type { HealthCheckResult } from '../types/health';

export class HealthClient extends BaseHttpClient {
  /**
   * Check API health.
   */
  check(): Promise<HealthCheckResult> {
    return this.get('/health');
  }

  /**
   * Get Prometheus metrics.
   */
  async getMetrics(): Promise<string> {
    const response = await fetch(`${this.baseUrl}/metrics`);
    if (!response.ok) {
      throw new ApiError(response.status, `HTTP ${response.status}: ${response.statusText}`);
    }
    return response.text();
  }
}

export const healthClient = new HealthClient();
