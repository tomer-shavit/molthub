// ---------------------------------------------------------------------------
// Gateway Interceptor Interface — Middleware for outbound/inbound messages
// ---------------------------------------------------------------------------

/**
 * Outbound message sent from client to Gateway.
 */
export interface OutboundMessage {
  method: string;
  params?: Record<string, unknown>;
  id: string;
}

/**
 * Inbound message received from Gateway as a response.
 */
export interface InboundMessage {
  id: string;
  result?: unknown;
  error?: {
    code: number | string;
    message: string;
    originalError?: { code: number | string; message: string };
  };
}

/**
 * Gateway event pushed from the server (agentOutput, presence, keepalive, shutdown).
 */
export interface GatewayInterceptorEvent {
  type: string;
  data: Record<string, unknown>;
}

/**
 * Context provided to the error handler.
 */
export interface ErrorContext {
  phase: "outbound" | "inbound" | "event";
  message?: OutboundMessage | InboundMessage | GatewayInterceptorEvent;
}

/**
 * Interceptor interface for the Gateway client middleware chain.
 *
 * Each hook is optional. Interceptors are executed in registration order
 * for outbound/inbound/event processing, and in registration order for errors.
 *
 * - `onOutbound`: Called before sending a message. Return `null` to short-circuit
 *   (the message will NOT be sent and the request will resolve with `null`).
 * - `onInbound`: Called when a response arrives. Can transform the response.
 * - `onEvent`: Called when a server-pushed event arrives.
 * - `onError`: Called when an error occurs in any phase.
 */
export interface GatewayInterceptor {
  /** Human-readable name for this interceptor (used in logging/debugging). */
  name: string;

  /** Process an outbound message before it is sent. Return null to short-circuit. */
  onOutbound?(message: OutboundMessage): Promise<OutboundMessage | null>;

  /** Process an inbound response message. */
  onInbound?(message: InboundMessage): Promise<InboundMessage>;

  /** Process a server-pushed event. */
  onEvent?(event: GatewayInterceptorEvent): Promise<void>;

  /** Handle an error that occurred during any phase. */
  onError?(error: Error, context: ErrorContext): Promise<void>;
}
