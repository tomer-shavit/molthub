/**
 * SLO (Service Level Objective) types.
 */

export type SloMetric = 'UPTIME' | 'LATENCY_P50' | 'LATENCY_P95' | 'LATENCY_P99' | 'ERROR_RATE' | 'CHANNEL_HEALTH';
export type SloWindow = 'ROLLING_1H' | 'ROLLING_24H' | 'ROLLING_7D' | 'ROLLING_30D' | 'CALENDAR_DAY' | 'CALENDAR_WEEK' | 'CALENDAR_MONTH';

export interface SloDefinition {
  id: string;
  instanceId: string;
  name: string;
  description?: string;
  metric: SloMetric;
  targetValue: number;
  window: SloWindow;
  currentValue?: number;
  isBreached: boolean;
  breachedAt?: string;
  breachCount: number;
  lastEvaluatedAt?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  instance?: {
    id: string;
    name: string;
    status: string;
    health: string;
  };
}

export interface SloSummary {
  total: number;
  breached: number;
  healthy: number;
  compliancePercent: number;
}

export interface CreateSloPayload {
  name: string;
  description?: string;
  instanceId: string;
  metric: SloMetric;
  targetValue: number;
  window: SloWindow;
}

export interface UpdateSloPayload {
  name?: string;
  description?: string;
  metric?: SloMetric;
  targetValue?: number;
  window?: SloWindow;
  isActive?: boolean;
}

export interface SloFilters {
  instanceId?: string;
  isBreached?: boolean;
  isActive?: boolean;
}
