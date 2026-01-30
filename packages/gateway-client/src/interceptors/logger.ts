// ---------------------------------------------------------------------------
// LoggerInterceptor — Structured logging for Gateway message traffic
// ---------------------------------------------------------------------------

import type {
  GatewayInterceptor,
  OutboundMessage,
  InboundMessage,
  GatewayInterceptorEvent,
  ErrorContext,
} from "./interface";

export interface LoggerInterceptorOptions {
  /** Enable verbose logging (include message bodies). Default: false. */
  verbose?: boolean;
  /** Maximum body length before truncation. Default: 500. */
  maxBodyLength?: number;
  /** Custom log function. Default: console.log. */
  logFn?: (message: string) => void;
}

export class LoggerInterceptor implements GatewayInterceptor {
  readonly name = "logger";

  private readonly verbose: boolean;
  private readonly maxBodyLength: number;
  private readonly logFn: (message: string) => void;

  constructor(options?: LoggerInterceptorOptions) {
    this.verbose = options?.verbose ?? false;
    this.maxBodyLength = options?.maxBodyLength ?? 500;
    this.logFn = options?.logFn ?? console.log;
  }

  async onOutbound(message: OutboundMessage): Promise<OutboundMessage> {
    let line = `[GW:OUT] method=${message.method} id=${message.id}`;
    if (this.verbose && message.params) {
      line += ` params=${this.truncate(JSON.stringify(message.params))}`;
    }
    this.logFn(line);
    return message;
  }

  async onInbound(message: InboundMessage): Promise<InboundMessage> {
    const ok = !message.error;
    let line = `[GW:IN] id=${message.id} ok=${ok}`;
    if (this.verbose) {
      if (ok && message.result !== undefined) {
        line += ` result=${this.truncate(JSON.stringify(message.result))}`;
      }
      if (!ok && message.error) {
        line += ` error=${this.truncate(JSON.stringify(message.error))}`;
      }
    }
    this.logFn(line);
    return message;
  }

  async onEvent(event: GatewayInterceptorEvent): Promise<void> {
    let line = `[GW:EVT] type=${event.type}`;
    if (this.verbose) {
      line += ` data=${this.truncate(JSON.stringify(event.data))}`;
    }
    this.logFn(line);
  }

  async onError(error: Error, context: ErrorContext): Promise<void> {
    this.logFn(`[GW:ERR] phase=${context.phase} error=${error.message}`);
  }

  private truncate(value: string): string {
    if (value.length <= this.maxBodyLength) {
      return value;
    }
    return value.slice(0, this.maxBodyLength) + "...(truncated)";
  }
}
