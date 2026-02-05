/**
 * Budget configuration types.
 */

export interface BudgetConfig {
  id: string;
  instanceId?: string;
  fleetId?: string;
  name: string;
  description?: string;
  monthlyLimitCents: number;
  currency: string;
  warnThresholdPct: number;
  criticalThresholdPct: number;
  currentSpendCents: number;
  periodStart: string;
  periodEnd?: string;
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
}

export interface BudgetFilters {
  instanceId?: string;
  fleetId?: string;
  isActive?: boolean;
}
