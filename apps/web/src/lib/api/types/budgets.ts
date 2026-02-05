/**
 * Budget configuration types.
 */

export interface BudgetConfig {
  id: string;
  instanceId?: string;
  fleetId?: string;
  name: string;
  description?: string;
  // Monthly limits
  monthlyLimitCents: number;
  currency: string;
  warnThresholdPct: number;
  criticalThresholdPct: number;
  currentSpendCents: number;
  periodStart: string;
  periodEnd?: string;
  // Daily limits (optional)
  dailyLimitCents?: number;
  dailyWarnThresholdPct?: number;
  dailyCriticalThresholdPct?: number;
  currentDailySpendCents: number;
  dailyPeriodStart?: string;
  // Status
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
}

export interface CreateBudgetPayload {
  name: string;
  instanceId?: string;
  fleetId?: string;
  description?: string;
  monthlyLimitCents: number;
  currency?: string;
  warnThresholdPct?: number;
  criticalThresholdPct?: number;
  // Daily limits (optional)
  dailyLimitCents?: number;
  dailyWarnThresholdPct?: number;
  dailyCriticalThresholdPct?: number;
}

export interface UpdateBudgetPayload {
  name?: string;
  instanceId?: string;
  fleetId?: string;
  description?: string;
  monthlyLimitCents?: number;
  currency?: string;
  warnThresholdPct?: number;
  criticalThresholdPct?: number;
  isActive?: boolean;
  // Daily limits (optional)
  dailyLimitCents?: number;
  dailyWarnThresholdPct?: number;
  dailyCriticalThresholdPct?: number;
}

export interface BudgetFilters {
  instanceId?: string;
  fleetId?: string;
  isActive?: boolean;
}
