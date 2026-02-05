/**
 * Traces domain client.
 * Handles trace listing and retrieval.
 */

import { BaseHttpClient } from '../base-client';
import type {
  Trace,
  TraceFilters,
} from '../types/traces';

export class TracesClient extends BaseHttpClient {
  /**
   * List traces with optional filters.
   */
  list(filters?: TraceFilters): Promise<Trace[]> {
    const params: Record<string, unknown> = { ...filters };
    if (filters?.from) {
      params.from = filters.from.toISOString();
    }
    if (filters?.to) {
      params.to = filters.to.toISOString();
    }
    return this.get('/traces', params);
  }

  /**
   * Get a single trace by ID.
   */
  getById(id: string): Promise<Trace> {
    return this.get(`/traces/${id}`);
  }

  /**
   * Get a trace by its trace ID.
   */
  getByTraceId(traceId: string): Promise<Trace & { children: Trace[] }> {
    return this.get(`/traces/by-trace-id/${traceId}`);
  }

  /**
   * Get the full trace tree by trace ID.
   */
  getTree(traceId: string): Promise<Trace> {
    return this.get(`/traces/by-trace-id/${traceId}/tree`);
  }
}

export const tracesClient = new TracesClient();
