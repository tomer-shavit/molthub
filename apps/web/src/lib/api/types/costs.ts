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
