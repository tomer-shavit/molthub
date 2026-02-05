/**
 * Agent evolution types.
 */

export interface EvolutionChange {
  category: string;
  field: string;
  changeType: 'added' | 'removed' | 'modified';
  deployedValue?: unknown;
  liveValue?: unknown;
}

export interface AgentEvolutionDiff {
  changes: EvolutionChange[];
  hasEvolved: boolean;
  totalChanges: number;
}

export interface EvolutionSummary {
  hasEvolved: boolean;
  totalChanges: number;
  categoryCounts: Record<string, number>;
  changedCategories: string[];
}

export interface AgentLiveState {
  gatewayReachable: boolean;
  config: Record<string, unknown> | null;
  configHash: string | null;
  health: unknown | null;
  diff: AgentEvolutionDiff;
  summary: EvolutionSummary;
  skills: string[];
  mcpServers: string[];
  channels: string[];
  toolProfile: unknown;
  lastSnapshotAt?: string | null;
}

export interface AgentEvolutionSnapshot {
  hasEvolved: boolean;
  totalChanges: number;
  gatewayReachable: boolean;
  capturedAt: string;
  diff: AgentEvolutionDiff | null;
  liveSkills: string[];
  liveMcpServers: string[];
  liveChannels: string[];
  liveToolProfile: unknown;
  liveConfigHash: string;
  message?: string;
  snapshot?: null;
}

export interface TokenUsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
  totalCost: number;
}

export interface TokenUsageSummary {
  totals: TokenUsageTotals | null;
  daily: Array<{
    date: string;
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
    totalTokens: number;
    totalCost: number;
  }>;
}
