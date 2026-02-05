/**
 * Trace types.
 */

export type TraceType = 'REQUEST' | 'TASK' | 'SKILL' | 'TOOL' | 'MODEL' | 'OTHER';
export type TraceStatus = 'SUCCESS' | 'ERROR' | 'PENDING';

export interface Trace {
  id: string;
  botInstanceId: string;
  botInstance?: { id: string; name: string };
  traceId: string;
  parentTraceId?: string;
  name: string;
  type: TraceType;
  status: TraceStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: Record<string, unknown>;
  metadata: Record<string, unknown>;
  tags: Record<string, unknown>;
  createdAt: string;
  children?: Trace[];
}

export interface TraceStats {
  total: number;
  success: number;
  error: number;
  pending: number;
  avgDuration: number;
  byType: Record<string, number>;
}

export interface TraceFilters {
  botInstanceId?: string;
  type?: string;
  status?: string;
  from?: Date;
  to?: Date;
  limit?: number;
}
