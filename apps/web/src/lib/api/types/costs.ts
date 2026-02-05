/**
 * Cost tracking types.
 */

import type { PaginatedResponse } from './common';

export type CostProvider = 'OPENAI' | 'ANTHROPIC' | 'GOOGLE' | 'AWS_BEDROCK' | 'AZURE_OPENAI' | 'CUSTOM';

export interface CostEvent {
  id: string;
  instanceId: string;
  provider: CostProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  channelType?: string;
  traceId?: string;
  metadata: Record<string, unknown>;
  occurredAt: string;
}

export interface CostSummaryByProvider {
  provider: string;
  _sum: {
    costCents: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  _count: {
    id: number;
  };
}

export interface CostSummaryByModel {
  model: string;
  provider: string;
  _sum: {
    costCents: number | null;
    inputTokens: number | null;
    outputTokens: number | null;
  };
  _count: {
    id: number;
  };
}

export interface CostSummaryByChannel {
  channelType: string | null;
  _sum: {
    costCents: number | null;
  };
  _count: {
    id: number;
  };
}

export interface CostSummary {
  totalCostCents: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEvents: number;
  byProvider: CostSummaryByProvider[];
  byModel: CostSummaryByModel[];
  byChannel: CostSummaryByChannel[];
}

export interface PaginatedCostEvents {
  data: CostEvent[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface CreateCostEventPayload {
  instanceId: string;
  provider: CostProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costCents: number;
  channelType?: string;
  traceId?: string;
}

export interface CostFilters {
  instanceId?: string;
  provider?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/**
 * Live cost totals from gateway usage.cost RPC.
 */
export interface CostUsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
}

/**
 * Per-instance cost entry in live aggregation.
 */
export interface InstanceCostEntry {
  instanceId: string;
  instanceName: string;
  totals: CostUsageTotals;
}

/**
 * Aggregated live cost data from all running instances.
 */
export interface LiveCostAggregation {
  totals: CostUsageTotals;
  byInstance: InstanceCostEntry[];
  refreshedAt: string;
}
