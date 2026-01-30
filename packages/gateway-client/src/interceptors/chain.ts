// ---------------------------------------------------------------------------
// InterceptorChain — Executes interceptors in registration order
// ---------------------------------------------------------------------------

import type {
  GatewayInterceptor,
  OutboundMessage,
  InboundMessage,
  GatewayInterceptorEvent,
  ErrorContext,
} from "./interface";

export class InterceptorChain {
  private readonly interceptors: GatewayInterceptor[] = [];

  constructor(interceptors?: GatewayInterceptor[]) {
    if (interceptors) {
      this.interceptors.push(...interceptors);
    }
  }

  /** Add an interceptor to the end of the chain. */
  add(interceptor: GatewayInterceptor): void {
    this.interceptors.push(interceptor);
  }

  /** Remove an interceptor by name. */
  remove(name: string): boolean {
    const idx = this.interceptors.findIndex((i) => i.name === name);
    if (idx !== -1) {
      this.interceptors.splice(idx, 1);
      return true;
    }
    return false;
  }

  /** Number of interceptors in the chain. */
  get length(): number {
    return this.interceptors.length;
  }

  /**
   * Run all interceptors' `onOutbound` hooks in order.
   * If any interceptor returns `null`, processing stops (short-circuit)
   * and `null` is returned — the message should NOT be sent.
   */
  async processOutbound(message: OutboundMessage): Promise<OutboundMessage | null> {
    let current: OutboundMessage | null = message;

    for (const interceptor of this.interceptors) {
      if (current === null) break;
      if (!interceptor.onOutbound) continue;
      try {
        current = await interceptor.onOutbound(current);
      } catch (err) {
        await this.processError(err instanceof Error ? err : new Error(String(err)), {
          phase: "outbound",
          message: current ?? undefined,
        });
        // Continue with original message on interceptor failure
      }
    }

    return current;
  }

  /**
   * Run all interceptors' `onInbound` hooks in order.
   * Each interceptor may transform the message.
   */
  async processInbound(message: InboundMessage): Promise<InboundMessage> {
    let current = message;

    for (const interceptor of this.interceptors) {
      if (!interceptor.onInbound) continue;
      try {
        current = await interceptor.onInbound(current);
      } catch (err) {
        await this.processError(err instanceof Error ? err : new Error(String(err)), {
          phase: "inbound",
          message: current,
        });
        // Continue with current message on interceptor failure
      }
    }

    return current;
  }

  /**
   * Run all interceptors' `onEvent` hooks. All interceptors are called
   * regardless of failures in individual interceptors.
   */
  async processEvent(event: GatewayInterceptorEvent): Promise<void> {
    for (const interceptor of this.interceptors) {
      if (!interceptor.onEvent) continue;
      try {
        await interceptor.onEvent(event);
      } catch (err) {
        await this.processError(err instanceof Error ? err : new Error(String(err)), {
          phase: "event",
          message: event,
        });
      }
    }
  }

  /**
   * Run all interceptors' `onError` hooks. Errors within error handlers
   * are silently swallowed to prevent infinite loops.
   */
  async processError(error: Error, context: ErrorContext): Promise<void> {
    for (const interceptor of this.interceptors) {
      if (!interceptor.onError) continue;
      try {
        await interceptor.onError(error, context);
      } catch {
        // Swallow errors in error handlers to prevent loops
      }
    }
  }
}
