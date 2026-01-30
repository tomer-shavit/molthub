// ---------------------------------------------------------------------------
// TelemetryInterceptor — Per-method latency & error tracking
// ---------------------------------------------------------------------------

import type {
  GatewayInterceptor,
  OutboundMessage,
  InboundMessage,
} from "./interface";

/** Metrics for a single RPC method. */
export interface MethodMetrics {
  count: number;
  errorCount: number;
  totalLatencyMs: number;
  p95LatencyMs: number;
}

/** Aggregated metrics across all methods. */
export type TelemetryMetrics = Record<string, MethodMetrics>;

const DEFAULT_BUFFER_SIZE = 100;

/** Circular buffer for storing latency samples to compute p95. */
class CircularBuffer {
  private readonly buffer: number[];
  private readonly capacity: number;
  private index = 0;
  private count = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Array<number>(capacity).fill(0);
  }

  push(value: number): void {
    this.buffer[this.index] = value;
    this.index = (this.index + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /** Compute the p95 value from the current samples. Returns 0 if no samples. */
  p95(): number {
    if (this.count === 0) return 0;
    const samples = this.buffer.slice(0, this.count).sort((a, b) => a - b);
    const idx = Math.ceil(this.count * 0.95) - 1;
    return samples[Math.max(0, idx)];
  }

  reset(): void {
    this.buffer.fill(0);
    this.index = 0;
    this.count = 0;
  }
}

interface MethodState {
  count: number;
  errorCount: number;
  totalLatencyMs: number;
  latencyBuffer: CircularBuffer;
}

export interface TelemetryInterceptorOptions {
  /** Size of the circular buffer for p95 calculation. Default: 100. */
  bufferSize?: number;
}

export class TelemetryInterceptor implements GatewayInterceptor {
  readonly name = "telemetry";

  private readonly bufferSize: number;
  private readonly methods = new Map<string, MethodState>();
  private readonly pendingTimestamps = new Map<string, { method: string; startTime: number }>();

  constructor(options?: TelemetryInterceptorOptions) {
    this.bufferSize = options?.bufferSize ?? DEFAULT_BUFFER_SIZE;
  }

  async onOutbound(message: OutboundMessage): Promise<OutboundMessage> {
    // Record start time for latency calculation
    this.pendingTimestamps.set(message.id, {
      method: message.method,
      startTime: Date.now(),
    });

    // Ensure method state exists
    this.ensureMethod(message.method);

    return message;
  }

  async onInbound(message: InboundMessage): Promise<InboundMessage> {
    const pending = this.pendingTimestamps.get(message.id);
    if (!pending) return message;

    this.pendingTimestamps.delete(message.id);

    const state = this.ensureMethod(pending.method);
    state.count++;

    const latency = Date.now() - pending.startTime;
    state.totalLatencyMs += latency;
    state.latencyBuffer.push(latency);

    if (message.error) {
      state.errorCount++;
    }

    return message;
  }

  /** Get a snapshot of all method metrics. */
  getMetrics(): TelemetryMetrics {
    const result: TelemetryMetrics = {};
    for (const [method, state] of this.methods) {
      result[method] = {
        count: state.count,
        errorCount: state.errorCount,
        totalLatencyMs: state.totalLatencyMs,
        p95LatencyMs: state.latencyBuffer.p95(),
      };
    }
    return result;
  }

  /** Reset all metrics. */
  resetMetrics(): void {
    this.methods.clear();
    this.pendingTimestamps.clear();
  }

  private ensureMethod(method: string): MethodState {
    let state = this.methods.get(method);
    if (!state) {
      state = {
        count: 0,
        errorCount: 0,
        totalLatencyMs: 0,
        latencyBuffer: new CircularBuffer(this.bufferSize),
      };
      this.methods.set(method, state);
    }
    return state;
  }
}
