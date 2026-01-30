// ---------------------------------------------------------------------------
// AuditInterceptor — Audit trail for sensitive Gateway operations
// ---------------------------------------------------------------------------

import type {
  GatewayInterceptor,
  OutboundMessage,
  InboundMessage,
} from "./interface";

/** Methods that are audited. */
const AUDITED_METHODS = new Set(["config.apply", "config.patch", "send", "agent"]);

/** An audit event emitted for each audited operation. */
export interface AuditEvent {
  timestamp: number;
  method: string;
  requestId: string;
  direction: "outbound" | "inbound";
  success?: boolean;
  error?: string;
}

export interface AuditInterceptorOptions {
  /** Callback invoked for each audit event. */
  onAuditEvent: (event: AuditEvent) => void;
}

export class AuditInterceptor implements GatewayInterceptor {
  readonly name = "audit";

  private readonly onAuditEvent: (event: AuditEvent) => void;
  /** Maps request ID → method for inbound correlation. */
  private readonly requestMap = new Map<string, string>();

  constructor(options: AuditInterceptorOptions) {
    this.onAuditEvent = options.onAuditEvent;
  }

  async onOutbound(message: OutboundMessage): Promise<OutboundMessage> {
    if (!AUDITED_METHODS.has(message.method)) {
      return message;
    }

    // Store requestId → method for inbound correlation
    this.requestMap.set(message.id, message.method);

    this.onAuditEvent({
      timestamp: Date.now(),
      method: message.method,
      requestId: message.id,
      direction: "outbound",
    });

    return message;
  }

  async onInbound(message: InboundMessage): Promise<InboundMessage> {
    const method = this.requestMap.get(message.id);
    if (!method) {
      return message;
    }

    this.requestMap.delete(message.id);

    this.onAuditEvent({
      timestamp: Date.now(),
      method,
      requestId: message.id,
      direction: "inbound",
      success: !message.error,
      error: message.error?.message,
    });

    return message;
  }
}
