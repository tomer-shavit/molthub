/**
 * Bot instances health client.
 * Single responsibility: Health checks, drift detection, diagnostics.
 */

import { BaseHttpClient } from '../../base-client';
import type {
  InstanceHealth,
  InstanceDrift,
  DiagnosticsResult,
} from '../../types/bot-instances';
import type { TraceStats } from '../../types/traces';

export class BotInstancesHealthClient extends BaseHttpClient {
  /**
   * Get instance health status.
   */
  getHealth(id: string): Promise<InstanceHealth> {
    return this.get(`/bot-instances/${id}/health`);
  }

  /**
   * Get instance drift (config differences).
   */
  getDrift(id: string): Promise<InstanceDrift> {
    return this.get(`/bot-instances/${id}/drift`);
  }

  /**
   * Run diagnostics on an instance.
   */
  runDiagnostics(id: string): Promise<DiagnosticsResult> {
    return this.post(`/bot-instances/${id}/doctor`);
  }

  /**
   * Get metrics for a bot instance.
   */
  getMetrics(id: string, from: Date, to: Date): Promise<TraceStats> {
    return this.get(`/traces/stats/${id}`, {
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }
}

export const botInstancesHealthClient = new BotInstancesHealthClient();
