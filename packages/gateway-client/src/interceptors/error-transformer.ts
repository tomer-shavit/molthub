// ---------------------------------------------------------------------------
// ErrorTransformerInterceptor — Maps Gateway error codes to friendly messages
// ---------------------------------------------------------------------------

import type {
  GatewayInterceptor,
  InboundMessage,
} from "./interface";

/**
 * Default error code to human-readable message map.
 * Uses numeric codes from the Gateway JSON-RPC error convention:
 * - -32001: NOT_LINKED (bot not connected)
 * - -32002: AGENT_TIMEOUT
 * - -32600: INVALID_REQUEST
 * - -32003: UNAVAILABLE
 */
const DEFAULT_ERROR_MAP: Record<number, string> = {
  [-32001]: "Bot is not connected to Gateway. Check deployment status.",
  [-32002]: "Agent operation timed out.",
  [-32600]: "Invalid request format.",
  [-32003]: "Gateway is temporarily unavailable.",
};

export interface ErrorTransformerOptions {
  /** Custom error code → message mappings. Merged with defaults (custom wins). */
  errorMap?: Record<number, string>;
}

export class ErrorTransformerInterceptor implements GatewayInterceptor {
  readonly name = "error-transformer";

  private readonly errorMap: Record<number, string>;

  constructor(options?: ErrorTransformerOptions) {
    this.errorMap = { ...DEFAULT_ERROR_MAP, ...options?.errorMap };
  }

  async onInbound(message: InboundMessage): Promise<InboundMessage> {
    if (!message.error) {
      return message;
    }

    const code = message.error.code;
    const numericCode = typeof code === "string" ? parseInt(code, 10) : code;
    const friendlyMessage = typeof numericCode === "number" && !isNaN(numericCode)
      ? this.errorMap[numericCode]
      : undefined;

    if (!friendlyMessage) {
      return message;
    }

    return {
      ...message,
      error: {
        code: message.error.code,
        message: friendlyMessage,
        originalError: {
          code: message.error.code,
          message: message.error.message,
        },
      },
    };
  }
}
